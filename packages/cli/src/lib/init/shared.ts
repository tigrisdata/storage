import { join } from 'node:path';

export type AgentTarget = 'claude-code' | 'cursor' | 'vscode' | 'windsurf';

// ---------------------------------------------------------------------------
// .env helpers
// ---------------------------------------------------------------------------

export const ENV_KEYS = {
  accessKeyId: 'TIGRIS_STORAGE_ACCESS_KEY_ID',
  secretAccessKey: 'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
  endpoint: 'TIGRIS_STORAGE_ENDPOINT',
  bucket: 'TIGRIS_STORAGE_BUCKET',
} as const;

// ---------------------------------------------------------------------------
// MCP config (Tigris remote hosted MCP server, OAuth-in-browser auth)
// ---------------------------------------------------------------------------

export const MCP_SERVER_NAME = 'tigris';
export const REMOTE_MCP_URL = 'https://mcp.storage.dev/mcp';

/**
 * Merge an MCP server entry into existing config content (or a fresh file)
 * under the given top-level key (`mcpServers` or VS Code's `servers`),
 * preserving other servers. Throws if the existing content is not valid JSON.
 */
export function mergeMcpServers(
  existing: string | null,
  key: string,
  name: string,
  entry: Record<string, unknown>
): { content: string; replaced: boolean } {
  let root: Record<string, unknown> = {};
  if (existing?.trim()) {
    root = JSON.parse(existing) as Record<string, unknown>;
  }

  const servers = (root[key] as Record<string, unknown>) ?? {};
  const replaced = Object.hasOwn(servers, name);

  const nextRoot = { ...root, [key]: { ...servers, [name]: entry } };
  return { content: `${JSON.stringify(nextRoot, null, 2)}\n`, replaced };
}

// ---------------------------------------------------------------------------
// Supported editors
// ---------------------------------------------------------------------------

export type InstallLocation = 'global' | 'project' | 'skip';

export interface EditorInfo {
  id: AgentTarget;
  label: string;
  /** Top-level key in the MCP config file. */
  mcpKey: 'mcpServers' | 'servers';
  /** The remote MCP server entry (shape varies per editor). */
  mcpEntry: Record<string, string>;
  /** MCP config path relative to cwd, when the editor supports project scope. */
  mcpProjectPath?: string;
  /** MCP config path relative to home, when the editor supports global scope. */
  mcpGlobalPath?: string;
  /** Agent flag passed to `npx skills add ... -a <skillsAgent>`. */
  skillsAgent: string;
  /** Directory where `npx skills` installs, relative to cwd (project scope). */
  skillsProjectDir: string;
  /** Directory where `npx skills` installs, relative to home (global scope). */
  skillsGlobalDir: string;
}

export const SUPPORTED_EDITORS: EditorInfo[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    mcpKey: 'mcpServers',
    mcpEntry: { type: 'http', url: REMOTE_MCP_URL },
    mcpProjectPath: '.mcp.json',
    mcpGlobalPath: '.claude.json',
    skillsAgent: 'claude-code',
    skillsProjectDir: join('.claude', 'skills'),
    skillsGlobalDir: join('.claude', 'skills'),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    mcpKey: 'mcpServers',
    mcpEntry: { url: REMOTE_MCP_URL },
    mcpProjectPath: join('.cursor', 'mcp.json'),
    mcpGlobalPath: join('.cursor', 'mcp.json'),
    skillsAgent: 'cursor',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join('.cursor', 'skills'),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    mcpKey: 'servers',
    mcpEntry: { type: 'http', url: REMOTE_MCP_URL },
    mcpProjectPath: join('.vscode', 'mcp.json'),
    // VS Code's user-level mcp.json path is platform-specific; project only.
    skillsAgent: 'github-copilot',
    skillsProjectDir: join('.agents', 'skills'),
    skillsGlobalDir: join('.copilot', 'skills'),
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    mcpKey: 'mcpServers',
    mcpEntry: { serverUrl: REMOTE_MCP_URL },
    // Windsurf only reads a single global config file.
    mcpGlobalPath: join('.codeium', 'windsurf', 'mcp_config.json'),
    skillsAgent: 'windsurf',
    skillsProjectDir: join('.windsurf', 'skills'),
    skillsGlobalDir: join('.codeium', 'windsurf', 'skills'),
  },
];

/** Distinct skills install directories for the given editors at a scope. */
export function skillsDirsFor(
  editors: EditorInfo[],
  scope: 'global' | 'project',
  cwd: string,
  home: string
): string[] {
  const dirs = editors.map((e) =>
    scope === 'global'
      ? join(home, e.skillsGlobalDir)
      : join(cwd, e.skillsProjectDir)
  );
  return [...new Set(dirs)];
}

/**
 * Resolve the MCP config path for an editor at the requested scope, falling
 * back to the editor's only supported scope when the requested one is absent
 * (e.g. Windsurf is global-only, VS Code is project-only). Returns null if the
 * editor has no writable MCP config path.
 */
export function resolveMcpTarget(
  editor: EditorInfo,
  requested: 'global' | 'project',
  cwd: string,
  home: string
): { path: string; scope: 'global' | 'project' } | null {
  const canGlobal = editor.mcpGlobalPath !== undefined;
  const canProject = editor.mcpProjectPath !== undefined;

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

  if (scope === 'global')
    return { path: join(home, editor.mcpGlobalPath!), scope };
  if (scope === 'project')
    return { path: join(cwd, editor.mcpProjectPath!), scope };
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
