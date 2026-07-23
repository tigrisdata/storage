import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  applyEdits,
  modify,
  type ParseError,
  parse as parseJsonc,
} from 'jsonc-parser';

export type AgentTarget =
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'codex'
  | 'antigravity-cli'
  | 'cline'
  | 'zed'
  | 'roo'
  | 'opencode';

// ---------------------------------------------------------------------------
// Platform paths
// ---------------------------------------------------------------------------

const HOME = homedir();
const CONFIG_HOME =
  process.env.XDG_CONFIG_HOME?.trim() || join(HOME, '.config');
const CODEX_HOME = process.env.CODEX_HOME?.trim() || join(HOME, '.codex');

/** The VS Code user directory (where extensions keep globalStorage). */
function vsCodeUserDir(home: string, env: NodeJS.ProcessEnv): string {
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Code', 'User');
  }
  if (process.platform === 'win32') {
    return join(
      env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'),
      'Code',
      'User'
    );
  }
  return join(
    env.XDG_CONFIG_HOME?.trim() || join(home, '.config'),
    'Code',
    'User'
  );
}

const VSCODE_USER_DIR = vsCodeUserDir(HOME, process.env);

/** Cline's VS Code extension id; its globalStorage folder exists when installed. */
const CLINE_EXTENSION_ID = 'saoudrizwan.claude-dev';

/** MCP settings file for a VS Code extension, inside its globalStorage. */
function vscodeExtensionMcpPath(extensionId: string, file: string): string {
  return join(VSCODE_USER_DIR, 'globalStorage', extensionId, 'settings', file);
}

// ---------------------------------------------------------------------------
// MCP config (Tigris remote hosted MCP server, OAuth-in-browser auth)
// ---------------------------------------------------------------------------

export const MCP_SERVER_NAME = 'tigris';
export const REMOTE_MCP_URL = 'https://mcp.storage.dev/mcp';

/**
 * Merge an MCP server entry into existing config content (or a fresh file)
 * under the given top-level key (`mcpServers`, VS Code's `servers`, Zed's
 * `context_servers`, opencode's `mcp`). The file may be JSONC (comments,
 * trailing commas) — common for editor settings like Zed's — and the edit is
 * applied surgically so existing comments, key order, and formatting are kept.
 * Throws if the content isn't valid JSON/JSONC or the target isn't an object.
 */
export function mergeMcpServers(
  existing: string | null,
  key: string,
  name: string,
  entry: Record<string, unknown>
): { content: string; replaced: boolean } {
  const text = existing?.trim() ? existing : '{}';

  // Parse tolerantly to validate shape (comments / trailing commas allowed).
  const errors: ParseError[] = [];
  const root: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error('config is not valid JSON/JSONC');
  }
  if (!isPlainObject(root)) {
    throw new Error('config root is not an object');
  }
  // Guard against a non-object server map (e.g. `"mcpServers": "disabled"`).
  const existingServers = root[key];
  if (existingServers !== undefined && !isPlainObject(existingServers)) {
    throw new Error(`"${key}" is not an object`);
  }
  const replaced =
    isPlainObject(existingServers) && Object.hasOwn(existingServers, name);

  // Surgical edit — preserves the rest of the file's comments and formatting.
  const edits = modify(text, [key, name], entry, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  return {
    content: ensureTrailingNewline(applyEdits(text, edits)),
    replaced,
  };
}

/** True for a non-null, non-array object. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Upsert a `[<key>.<name>]` table into TOML content (Codex's `config.toml`),
 * replacing the table's body if it already exists, else appending. Only string
 * fields are supported, which is all our remote-server entry needs. Idempotent.
 */
export function upsertTomlServer(
  existing: string | null,
  key: string,
  name: string,
  fields: Record<string, string>
): { content: string; replaced: boolean } {
  const header = `[${key}.${name}]`;
  const bodyLines = [
    header,
    ...Object.entries(fields).map(([k, v]) => `${k} = ${JSON.stringify(v)}`),
  ];

  const src = existing ?? '';
  // An inline `mcp_servers.tigris = { ... }` (vs a `[mcp_servers.tigris]`
  // table) would collide with the table we append and make the file invalid;
  // refuse rather than corrupt it.
  if (hasInlineTomlKey(src, key, name)) {
    throw new Error(`existing TOML defines ${key}.${name} inline`);
  }
  const target = `${key}.${name}`;
  const lines = src.length ? src.split('\n') : [];
  const start = lines.findIndex((l) => tomlTableHeader(l) === target);

  if (start !== -1) {
    // Replace the table body: from the header up to the next table header/EOF.
    let end = start + 1;
    while (end < lines.length && tomlTableHeader(lines[end]) === null) end++;
    lines.splice(start, end - start, ...bodyLines);
    return { content: ensureTrailingNewline(lines.join('\n')), replaced: true };
  }

  const prefix = src.length === 0 ? '' : ensureTrailingNewline(src);
  const gap = prefix.length === 0 ? '' : '\n';
  return {
    content: ensureTrailingNewline(prefix + gap + bodyLines.join('\n')),
    replaced: false,
  };
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`;
}

/**
 * The normalized dotted key of a TOML table-header line, or null if the line
 * isn't a table header. Tolerates a trailing comment and whitespace inside the
 * brackets / around dots: `[ mcp_servers . tigris ]  # x` → `mcp_servers.tigris`.
 */
function tomlTableHeader(line: string): string | null {
  const m = line.trim().match(/^\[([^[\]]*)\]/);
  if (!m) return null;
  return m[1]
    .split('.')
    .map((s) => s.trim())
    .join('.');
}

/**
 * True if `<key>.<name>` is already defined as an inline assignment (e.g.
 * `tigris = { ... }` under `[mcp_servers]`, or a top-level `mcp_servers.tigris`
 * dotted key) rather than as a `[<key>.<name>]` table. Appending our table in
 * that case would redefine the key and make the TOML invalid.
 */
function hasInlineTomlKey(src: string, key: string, name: string): boolean {
  let table = '';
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const tableHeader = tomlTableHeader(line);
    if (tableHeader !== null) {
      table = tableHeader;
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const lhs = line
      .slice(0, eq)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (table === key && (lhs === name || lhs.startsWith(`${name}.`))) {
      return true;
    }
    if (
      table === '' &&
      (lhs === `${key}.${name}` || lhs.startsWith(`${key}.${name}.`))
    ) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Supported editors
// ---------------------------------------------------------------------------

export type InstallLocation = 'global' | 'project' | 'skip';

export interface McpServerConfig {
  /** Config file format. */
  format: 'json' | 'toml';
  /** Top-level key (JSON) or table namespace (TOML, e.g. `mcp_servers`). */
  key: string;
  /** The server entry written under `key` → `MCP_SERVER_NAME`. */
  entry: Record<string, unknown>;
  /** Config path relative to cwd, when the editor supports project scope. */
  projectPath?: string;
  /** Absolute config path, when the editor supports global scope. */
  globalPath?: string;
  /**
   * When false, only write if the target's parent directory already exists.
   * Used for app-managed locations (e.g. Cline's VS Code globalStorage) so we
   * never create a junk config tree for an editor that isn't installed.
   */
  createDirs?: boolean;
}

export interface EditorInfo {
  id: AgentTarget;
  label: string;
  /** MCP config, when we can write one for this editor. */
  mcp?: McpServerConfig;
  /** Agent flag passed to `npx skills add ... -a <skillsAgent>`. */
  skillsAgent: string;
  /** Directory where `npx skills` installs, relative to cwd (project scope). */
  skillsProjectDir: string;
  /** Absolute directory where `npx skills` installs at global scope. */
  skillsGlobalDir: string;
}

/** A remote MCP server reached through the `mcp-remote` stdio bridge (for
 *  editors that only spawn stdio child processes, e.g. Zed). */
const MCP_REMOTE_BRIDGE: Record<string, unknown> = {
  source: 'custom',
  command: 'npx',
  args: ['-y', 'mcp-remote', REMOTE_MCP_URL],
};

export const SUPPORTED_EDITORS: EditorInfo[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      entry: { type: 'http', url: REMOTE_MCP_URL },
      projectPath: '.mcp.json',
      globalPath: join(HOME, '.claude.json'),
    },
    skillsAgent: 'claude-code',
    skillsProjectDir: join('.claude', 'skills'),
    skillsGlobalDir: join(HOME, '.claude', 'skills'),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      entry: { url: REMOTE_MCP_URL },
      projectPath: join('.cursor', 'mcp.json'),
      globalPath: join(HOME, '.cursor', 'mcp.json'),
    },
    skillsAgent: 'cursor',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(HOME, '.cursor', 'skills'),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    mcp: {
      format: 'json',
      key: 'servers',
      entry: { type: 'http', url: REMOTE_MCP_URL },
      // VS Code's user-level mcp.json path is platform-specific; project only.
      projectPath: join('.vscode', 'mcp.json'),
    },
    skillsAgent: 'github-copilot',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(HOME, '.copilot', 'skills'),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      entry: { serverUrl: REMOTE_MCP_URL },
      // Windsurf only reads a single global config file.
      globalPath: join(HOME, '.codeium', 'windsurf', 'mcp_config.json'),
    },
    skillsAgent: 'windsurf',
    skillsProjectDir: join('.windsurf', 'skills'),
    skillsGlobalDir: join(HOME, '.codeium', 'windsurf', 'skills'),
  },
  {
    id: 'codex',
    label: 'Codex',
    mcp: {
      format: 'toml',
      key: 'mcp_servers',
      entry: { url: REMOTE_MCP_URL },
      projectPath: join('.codex', 'config.toml'),
      globalPath: join(CODEX_HOME, 'config.toml'),
    },
    skillsAgent: 'codex',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(CODEX_HOME, 'skills'),
  },
  {
    id: 'antigravity-cli',
    label: 'Antigravity CLI',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      // Antigravity (the Gemini CLI successor) shares one MCP config across its
      // IDE and CLI at this global path; remote servers use `serverUrl`
      // (url/httpUrl unsupported). Its project-local path is unstable across
      // versions, so we target only the authoritative global file.
      entry: { serverUrl: REMOTE_MCP_URL },
      globalPath: join(HOME, '.gemini', 'config', 'mcp_config.json'),
    },
    skillsAgent: 'antigravity-cli',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(HOME, '.gemini', 'antigravity-cli', 'skills'),
  },
  {
    id: 'cline',
    label: 'Cline',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      entry: {
        type: 'streamableHttp',
        url: REMOTE_MCP_URL,
        disabled: false,
        autoApprove: [],
      },
      // Cline stores MCP config in its VS Code globalStorage — global only, and
      // only written if Cline is actually installed (createDirs: false).
      globalPath: vscodeExtensionMcpPath(
        CLINE_EXTENSION_ID,
        'cline_mcp_settings.json'
      ),
      createDirs: false,
    },
    skillsAgent: 'cline',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(HOME, '.agents', 'skills'),
  },
  {
    id: 'zed',
    label: 'Zed',
    mcp: {
      format: 'json',
      key: 'context_servers',
      // Zed spawns stdio servers only; reach the remote server via mcp-remote.
      entry: MCP_REMOTE_BRIDGE,
      projectPath: join('.zed', 'settings.json'),
      globalPath: join(CONFIG_HOME, 'zed', 'settings.json'),
    },
    skillsAgent: 'zed',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(HOME, '.agents', 'skills'),
  },
  {
    id: 'roo',
    label: 'Roo Code',
    mcp: {
      format: 'json',
      key: 'mcpServers',
      entry: { type: 'streamable-http', url: REMOTE_MCP_URL },
      // Roo reads a project-level .roo/mcp.json (its global store is VS Code
      // globalStorage); project scope is the reliable target.
      projectPath: join('.roo', 'mcp.json'),
    },
    skillsAgent: 'roo',
    skillsProjectDir: join('.roo', 'skills'),
    skillsGlobalDir: join(HOME, '.roo', 'skills'),
  },
  {
    id: 'opencode',
    label: 'opencode',
    mcp: {
      format: 'json',
      key: 'mcp',
      entry: { type: 'remote', url: REMOTE_MCP_URL, enabled: true },
      projectPath: 'opencode.json',
      globalPath: join(CONFIG_HOME, 'opencode', 'opencode.json'),
    },
    skillsAgent: 'opencode',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join(CONFIG_HOME, 'opencode', 'skills'),
  },
];

/** Distinct skills install directories for the given editors at a scope. */
export function skillsDirsFor(
  editors: EditorInfo[],
  scope: 'global' | 'project',
  cwd: string
): string[] {
  const dirs = editors.map((e) =>
    scope === 'global' ? e.skillsGlobalDir : join(cwd, e.skillsProjectDir)
  );
  return [...new Set(dirs)];
}

/**
 * Resolve the MCP config path for an editor at the requested scope, falling
 * back to the editor's only supported scope when the requested one is absent
 * (e.g. Windsurf/Cline are global-only, VS Code/Roo are project-only). Returns
 * null if the editor has no writable MCP config path.
 */
export function resolveMcpTarget(
  editor: EditorInfo,
  requested: 'global' | 'project',
  cwd: string
): { path: string; scope: 'global' | 'project' } | null {
  const mcp = editor.mcp;
  if (!mcp) return null;

  const canGlobal = mcp.globalPath !== undefined;
  const canProject = mcp.projectPath !== undefined;

  const scope: 'global' | 'project' | null =
    requested === 'global'
      ? canGlobal
        ? 'global'
        : canProject
          ? 'project'
          : null
      : canProject
        ? 'project'
        : canGlobal
          ? 'global'
          : null;

  if (scope === 'global') return { path: mcp.globalPath!, scope };
  if (scope === 'project') return { path: join(cwd, mcp.projectPath!), scope };
  return null;
}

/**
 * Best-effort detection of which supported editors are present, used to
 * pre-check the multi-select. Returns the editor ids that look configured.
 */
export function detectEditors(deps: {
  env: NodeJS.ProcessEnv;
  cwd: string;
  home: string;
  fileExists: (p: string) => boolean;
}): AgentTarget[] {
  const { env, cwd, home, fileExists } = deps;
  const configHome = env.XDG_CONFIG_HOME?.trim() || join(home, '.config');
  const found: AgentTarget[] = [];

  if (
    env.CLAUDECODE === '1' ||
    fileExists(join(cwd, '.claude')) ||
    fileExists(join(home, '.claude.json'))
  ) {
    found.push('claude-code');
  }
  if (
    env.TERM_PROGRAM === 'cursor' ||
    fileExists(join(cwd, '.cursor')) ||
    fileExists(join(home, '.cursor'))
  ) {
    found.push('cursor');
  }
  if (env.TERM_PROGRAM === 'vscode' || fileExists(join(cwd, '.vscode'))) {
    found.push('vscode');
  }
  if (fileExists(join(home, '.codeium', 'windsurf'))) {
    found.push('windsurf');
  }
  if (env.CODEX_HOME?.trim() || fileExists(join(home, '.codex'))) {
    found.push('codex');
  }
  if (
    fileExists(join(home, '.gemini', 'antigravity-cli')) ||
    fileExists(join(home, '.gemini', 'antigravity')) ||
    fileExists(join(home, '.gemini', 'config'))
  ) {
    found.push('antigravity-cli');
  }
  if (
    fileExists(join(home, '.cline')) ||
    fileExists(
      join(vsCodeUserDir(home, env), 'globalStorage', CLINE_EXTENSION_ID)
    )
  ) {
    found.push('cline');
  }
  if (
    fileExists(join(configHome, 'zed')) ||
    fileExists('/Applications/Zed.app')
  ) {
    found.push('zed');
  }
  if (fileExists(join(cwd, '.roo'))) {
    found.push('roo');
  }
  if (
    fileExists(join(configHome, 'opencode')) ||
    fileExists(join(cwd, 'opencode.json')) ||
    fileExists(join(cwd, 'opencode.jsonc'))
  ) {
    found.push('opencode');
  }

  return found;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const TIGRIS_SKILLS_REPO = 'github.com/tigrisdata/skills';

export interface SkillInfo {
  id: string;
  label: string;
  /** Pre-selected in the picker. */
  recommended: boolean;
}

/** Available Tigris skills (mirrors github.com/tigrisdata/skills). */
export const TIGRIS_SKILLS: SkillInfo[] = [
  { id: 'tigris-agent-kit', label: 'Agent kit', recommended: true },
  {
    id: 'tigris-object-operations',
    label: 'Object operations',
    recommended: true,
  },
  {
    id: 'tigris-bucket-management',
    label: 'Bucket management',
    recommended: true,
  },
  { id: 'tigris-sdk-guide', label: 'SDK guide', recommended: true },
  {
    id: 'tigris-snapshots-forking',
    label: 'Snapshots & forking',
    recommended: false,
  },
  {
    id: 'tigris-snapshots-recovery',
    label: 'Snapshots recovery',
    recommended: false,
  },
  {
    id: 'tigris-lifecycle-management',
    label: 'Lifecycle management',
    recommended: false,
  },
  {
    id: 'tigris-security-access-control',
    label: 'Security & access control',
    recommended: false,
  },
  { id: 'tigris-s3-migration', label: 'S3 migration', recommended: false },
  { id: 'tigris-static-assets', label: 'Static assets', recommended: false },
  {
    id: 'tigris-image-optimization',
    label: 'Image optimization',
    recommended: false,
  },
  {
    id: 'tigris-egress-optimizer',
    label: 'Egress optimizer',
    recommended: false,
  },
  { id: 'tigris-backup-export', label: 'Backup & export', recommended: false },
  { id: 'tigris-python-sdk', label: 'Python SDK', recommended: false },
];

/**
 * Args for the `npx` skills installer — non-interactive: installs the chosen
 * skills to the given agents in one call. Run as `npx <args>`, e.g.
 * `npx -y skills add github.com/tigrisdata/skills --skill tigris-sdk-guide -a claude-code`.
 * `global` adds `-g` (user directory) instead of the default project scope.
 */
export function buildSkillsArgs(
  skillIds: string[],
  skillsAgents: string[],
  global: boolean
): string[] {
  // Leading `-y` is npx's auto-install; trailing `--yes` makes the skills tool
  // itself non-interactive (it prompts by default).
  const args = ['-y', 'skills', 'add', TIGRIS_SKILLS_REPO];
  for (const skill of skillIds) args.push('--skill', skill);
  if (global) args.push('-g');
  for (const agent of skillsAgents) args.push('-a', agent);
  args.push('--yes');
  return args;
}
