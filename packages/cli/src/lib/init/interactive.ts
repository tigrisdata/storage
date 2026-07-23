import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import * as p from '@clack/prompts';
import { fetchLatestVersion, isNewerVersion } from '@utils/update-check.js';

import {
  buildSkillsArgs,
  detectEditors,
  type EditorInfo,
  type InstallLocation,
  MCP_SERVER_NAME,
  mergeMcpServers,
  resolveMcpTarget,
  SUPPORTED_EDITORS,
  skillsDirsFor,
  TIGRIS_SKILLS,
  upsertTomlServer,
} from './shared.js';

/**
 * Interactive setup (`tigris init`): pick the AI editor(s), optionally install
 * the CLI, point the editors at the Tigris remote MCP server, and install the
 * chosen agent skills — then hand the user a command to give their AI agent.
 * No login: the remote MCP server authenticates in-browser on first connect.
 */
export async function runInteractive() {
  if (!process.stdin.isTTY) {
    console.error('Run `tigris init` in an interactive terminal.');
    process.exit(1);
  }

  const cwd = process.cwd();
  const home = homedir();

  p.intro('Connect Tigris to your AI coding agent');

  // 1. Which editor(s) — detected ones pre-checked.
  const detected = detectEditors({
    env: process.env,
    cwd,
    home,
    fileExists: existsSync,
  });
  const editorIds = await p.multiselect({
    message: 'Which editor(s) should use Tigris?',
    options: SUPPORTED_EDITORS.map((e) => ({ value: e.id, label: e.label })),
    initialValues: detected,
    required: true,
  });
  if (p.isCancel(editorIds)) return cancel();
  const editors = SUPPORTED_EDITORS.filter((e) => editorIds.includes(e.id));

  // 2. Defaults or customize (installation targets/scopes).
  const mode = await p.select({
    message: 'What would you like to install?',
    options: [
      {
        value: 'defaults',
        label: 'Defaults',
        hint: 'CLI - Global, MCP - Global, Skills - Project',
      },
      { value: 'custom', label: 'Customize installation' },
    ],
    initialValue: 'defaults',
  });
  if (p.isCancel(mode)) return cancel();

  let mcpLocation: InstallLocation = 'global';
  let skillsLocation: InstallLocation = 'project';

  if (mode === 'custom') {
    mcpLocation = await location('MCP server:', 'global');
    skillsLocation = await location('Agent skills:', 'project');
  }

  // 3. Which skills to install. Defaults installs every skill without asking;
  // only the custom flow prompts (recommended ones pre-checked).
  let skillIds: string[] = TIGRIS_SKILLS.map((s) => s.id);
  if (mode === 'custom' && skillsLocation !== 'skip') {
    const picked = await p.multiselect({
      message: 'Which skills should your agent get? (space to toggle)',
      options: TIGRIS_SKILLS.map((s) => ({ value: s.id, label: s.label })),
      initialValues: TIGRIS_SKILLS.filter((s) => s.recommended).map(
        (s) => s.id
      ),
      required: false,
    });
    if (p.isCancel(picked)) return cancel();
    skillIds = picked;
  }

  // 4. Tigris CLI — install if missing, update if outdated, skip if current.
  const cliAvailable = await ensureCli();

  // 5. Point each editor at the remote MCP server.
  if (mcpLocation === 'skip') {
    p.log.info('MCP server: skipped');
  } else {
    for (const editor of editors) {
      writeMcp(editor, mcpLocation, cwd, home);
    }
  }

  // 6. Install the chosen Tigris agent skills. Output is captured (the skills
  // tool prints a big banner); we report the destination dirs ourselves.
  if (skillsLocation === 'skip' || skillIds.length === 0) {
    p.log.info('Agent skills: skipped');
  } else {
    const agents = editors.map((e) => e.skillsAgent);
    const args = buildSkillsArgs(skillIds, agents, skillsLocation === 'global');
    const result = runCommand(
      'npx',
      args,
      `Installing ${skillIds.length} Tigris skill(s) (${skillsLocation})`
    );
    if (result.ok) {
      for (const dir of skillsDirsFor(editors, skillsLocation, cwd)) {
        p.log.success(`Skills → ${prettyPath(dir, home)}`);
      }
    } else if (result.output) {
      p.log.error(result.output.split('\n').slice(-6).join('\n'));
    }
  }

  // 7. Hand off to the agent — use the installed CLI, or npx if unavailable.
  const runner = cliAvailable
    ? 'tigris init --agent'
    : 'npx @tigrisdata/cli init --agent';
  p.note(runner, 'Paste this to your AI coding agent to finish setup');
  p.outro('Your agent will authenticate with Tigris in-browser on first use.');
}

async function location(
  message: string,
  initialValue: 'global' | 'project'
): Promise<InstallLocation> {
  const value = await p.select<InstallLocation>({
    message,
    options: [
      { value: 'global', label: 'Global (available in all projects)' },
      { value: 'project', label: 'Project-level (this project only)' },
      { value: 'skip', label: 'Skip' },
    ],
    initialValue,
  });
  if (p.isCancel(value)) cancel();
  return value;
}

function cancel(): never {
  p.cancel('Setup cancelled.');
  process.exit(1);
}

function prettyPath(path: string, home: string): string {
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/** Write the Tigris remote MCP entry into an editor's config at the chosen scope. */
function writeMcp(
  editor: EditorInfo,
  requested: 'global' | 'project',
  cwd: string,
  home: string
): void {
  const mcp = editor.mcp;
  const target = resolveMcpTarget(editor, requested, cwd);
  if (!mcp || !target) {
    p.log.warn(`${editor.label}: no writable MCP config — skipped.`);
    return;
  }

  // Prefer an existing JSONC sibling (e.g. opencode.jsonc) over creating a
  // second `.json` config the editor would then ignore or merge unexpectedly.
  let targetPath = target.path;
  if (
    !existsSync(targetPath) &&
    targetPath.endsWith('.json') &&
    existsSync(`${targetPath}c`)
  ) {
    targetPath = `${targetPath}c`;
  }

  const dir = dirname(targetPath);
  // App-managed locations (e.g. Cline's VS Code globalStorage): only write when
  // the editor is actually installed, so we don't create a junk config tree.
  if (mcp.createDirs === false && !existsSync(dirname(dir))) {
    p.log.warn(`${editor.label}: not installed — skipped.`);
    return;
  }

  // Read → merge → write per editor, so one editor's failure (unparseable or
  // incompatible existing config, permission error, full disk) is reported and
  // skipped without aborting the remaining editors.
  try {
    const existing = existsSync(targetPath)
      ? readFileSync(targetPath, 'utf8')
      : null;
    const written =
      mcp.format === 'toml'
        ? upsertTomlServer(
            existing,
            mcp.key,
            MCP_SERVER_NAME,
            stringFields(mcp.entry)
          )
        : mergeMcpServers(existing, mcp.key, MCP_SERVER_NAME, mcp.entry);

    mkdirSync(dir, { recursive: true });
    writeFileSync(targetPath, written.content);

    const scopeNote =
      target.scope === requested ? '' : ` (${target.scope}-only)`;
    p.log.success(
      `${editor.label}: MCP → ${prettyPath(targetPath, home)}${scopeNote}`
    );
  } catch {
    p.log.error(
      `${editor.label}: could not update ${prettyPath(targetPath, home)} (incompatible or unwritable) — skipped.`
    );
  }
}

/** Keep only string-valued fields (TOML upsert writes `k = "v"`). */
function stringFields(entry: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/** The globally-installed `tigris` CLI version, or null if not on PATH. */
function getInstalledCliVersion(): string | null {
  const r = spawnSync('tigris', ['--version'], spawnOpts());
  if (r.error || r.status !== 0 || !r.stdout) return null;
  const v = r.stdout.trim().split('\n')[0].trim();
  return /^\d+\.\d+\.\d+/.test(v) ? v : null;
}

/**
 * Ensure the Tigris CLI is present and current: install it if missing, update
 * it if a newer version is published, and do nothing (no step) if it's already
 * the latest. Returns whether an up-to-date `tigris` command is available
 * afterwards (false if an install/update was attempted and failed).
 */
async function ensureCli(): Promise<boolean> {
  const installed = getInstalledCliVersion();
  const latest = await fetchLatestVersionCapped(3000);

  if (!installed) {
    const result = runCommand(
      'npm',
      ['install', '-g', '@tigrisdata/cli', '--ignore-scripts'],
      'Installing Tigris CLI (global)'
    );
    if (!reportIfFailed(result)) return false;
    // A zero exit doesn't guarantee `tigris` is resolvable — npm's global bin
    // may not be on PATH. Confirm before recommending it over `npx`.
    if (getInstalledCliVersion() === null) {
      p.log.warn(
        'Tigris CLI installed but not on PATH — the agent handoff will use npx.'
      );
      return false;
    }
    return true;
  }

  if (latest && isNewerVersion(installed, latest)) {
    // Delegate to the installed CLI's own updater so we respect how it was
    // installed (npm / Homebrew / standalone binary) rather than forcing npm,
    // which could fail or leave a second copy on PATH. If it fails, report
    // unavailable so the handoff falls back to `npx` (an outdated CLI may
    // predate `init`).
    return reportIfFailed(
      runCommand(
        'tigris',
        ['update'],
        `Updating Tigris CLI ${installed} → ${latest}`
      )
    );
  }

  // Installed and current (or latest unknown) — no CLI step shown.
  return true;
}

/**
 * Latest published version, or null if the registry check errors or exceeds
 * `ms`. Never rejects: a late `fetchLatestVersion` failure is swallowed (so it
 * can't surface as an unhandled rejection). The timeout timer is intentionally
 * left ref'd — it's what keeps the process alive during this await (the fetch
 * socket is unref'd) — and is always cleared in `finally`, so the fetch winning
 * adds no delay and a still-pending fetch can't hold the process open after.
 */
async function fetchLatestVersionCapped(ms: number): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetchLatestVersion({ unref: true }).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * spawnSync options. On Windows npm/npx/tigris are `.cmd` shims that need a
 * shell to resolve; use `shell: true` (cmd.exe) rather than PowerShell, which
 * treats a leading `@` (as in `@tigrisdata/cli`) as its splat operator.
 */
function spawnOpts() {
  return {
    encoding: 'utf8' as const,
    ...(process.platform === 'win32' ? { shell: true } : {}),
  };
}

/** Run a command under a spinner; capture output and surface it on failure. */
function runCommand(
  cmd: string,
  args: string[],
  startMsg: string
): { ok: boolean; output?: string } {
  const s = p.spinner();
  s.start(startMsg);
  const r = spawnSync(cmd, args, spawnOpts());
  if (r.status === 0) {
    s.stop(`${startMsg} — done`);
    return { ok: true };
  }
  s.stop(`${startMsg} — failed`);
  // Include spawnSync's own error (e.g. ENOENT) — stderr/stdout are empty then.
  return {
    ok: false,
    output: (r.stderr || r.stdout || r.error?.message || '').trim(),
  };
}

/** Surface a failed command's captured output (last lines) and return its ok. */
function reportIfFailed(result: { ok: boolean; output?: string }): boolean {
  if (!result.ok && result.output) {
    p.log.error(result.output.split('\n').slice(-6).join('\n'));
  }
  return result.ok;
}
