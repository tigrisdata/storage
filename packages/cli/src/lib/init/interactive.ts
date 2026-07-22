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
        hint: 'CLI (global), MCP server (global), agent skills (project)',
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

  // 3. Which skills to install.
  let skillIds: string[] = TIGRIS_SKILLS.filter((s) => s.recommended).map(
    (s) => s.id
  );
  if (skillsLocation !== 'skip') {
    const picked = await p.multiselect({
      message: 'Which skills should your agent get? (space to toggle)',
      options: TIGRIS_SKILLS.map((s) => ({ value: s.id, label: s.label })),
      initialValues: skillIds,
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
      for (const dir of skillsDirsFor(editors, skillsLocation, cwd, home)) {
        p.log.success(`Skills → ${prettyPath(dir, home)}`);
      }
    } else if (result.output) {
      p.log.error(result.output.split('\n').slice(-6).join('\n'));
    }
  }

  // 7. Hand off to the agent — use the installed CLI, or npx if unavailable.
  const runner = cliAvailable
    ? 'tigris init --agent --getting-started'
    : 'npx @tigrisdata/cli init --agent --getting-started';
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

/** Merge the Tigris remote MCP entry into an editor's config at the chosen scope. */
function writeMcp(
  editor: EditorInfo,
  requested: 'global' | 'project',
  cwd: string,
  home: string
): void {
  const target = resolveMcpTarget(editor, requested, cwd, home);
  if (!target) {
    p.log.warn(`${editor.label}: no writable MCP config — skipped.`);
    return;
  }

  const existing = existsSync(target.path)
    ? readFileSync(target.path, 'utf8')
    : null;
  let merged: { content: string; replaced: boolean };
  try {
    merged = mergeMcpServers(
      existing,
      editor.mcpKey,
      MCP_SERVER_NAME,
      editor.mcpEntry
    );
  } catch {
    p.log.error(
      `${editor.label}: could not parse ${target.path} as JSON — skipped.`
    );
    return;
  }

  mkdirSync(dirname(target.path), { recursive: true });
  writeFileSync(target.path, merged.content);

  const scopeNote = target.scope === requested ? '' : ` (${target.scope}-only)`;
  p.log.success(
    `${editor.label}: MCP → ${prettyPath(target.path, home)}${scopeNote}`
  );
}

/** The globally-installed `tigris` CLI version, or null if not on PATH. */
function getInstalledCliVersion(): string | null {
  const r = spawnSync('tigris', ['--version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0 || !r.stdout) return null;
  const v = r.stdout.trim().split('\n')[0].trim();
  return /^\d+\.\d+\.\d+/.test(v) ? v : null;
}

/**
 * Ensure the Tigris CLI is present and current: install it if missing, update
 * it if a newer version is published, and do nothing (no step) if it's already
 * the latest. Returns whether the `tigris` command is available afterwards.
 */
async function ensureCli(): Promise<boolean> {
  const installed = getInstalledCliVersion();

  let latest: string | null;
  try {
    // Cap the registry check so a slow network can't stall the wizard.
    latest = await Promise.race([
      fetchLatestVersion({ unref: true }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      ),
    ]);
  } catch {
    latest = null;
  }

  if (!installed) {
    return runCommand(
      'npm',
      ['install', '-g', '@tigrisdata/cli', '--ignore-scripts'],
      'Installing Tigris CLI (global)'
    ).ok;
  }

  if (latest && isNewerVersion(installed, latest)) {
    runCommand(
      'npm',
      ['install', '-g', '@tigrisdata/cli@latest', '--ignore-scripts'],
      `Updating Tigris CLI ${installed} → ${latest}`
    );
    return true;
  }

  // Installed and current (or latest unknown) — no CLI step shown.
  return true;
}

/** Run a command under a spinner; capture output and surface it on failure. */
function runCommand(
  cmd: string,
  args: string[],
  startMsg: string
): { ok: boolean; output?: string } {
  const s = p.spinner();
  s.start(startMsg);
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status === 0) {
    s.stop(`${startMsg} — done`);
    return { ok: true };
  }
  s.stop(`${startMsg} — failed`);
  return { ok: false, output: (r.stderr || r.stdout || '').trim() };
}
