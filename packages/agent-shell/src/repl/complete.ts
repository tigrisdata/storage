import { getCommandNames } from 'just-bash';
import type { TigrisShell } from '../shell.js';

type ShellFs = TigrisShell['engine']['fs'];

const REPL_COMMANDS = [
  'login',
  'configure',
  'mount',
  'umount',
  'df',
  'flush',
  'whoami',
  'logout',
  'clear',
  'help',
  'exit',
  'quit',
];

const CUSTOM_COMMANDS = ['presign', 'snapshot', 'fork'];

const BUCKET_ARG_COMMANDS = new Set(['mount', 'snapshot', 'fork']);
const MOUNT_POINT_ARG_COMMANDS = new Set(['umount', 'flush']);

export interface CompleteContext {
  shell: TigrisShell | null;
  cwd: string | undefined;
}

let cachedAllCommands: string[] | undefined;

function allCommandNames(): string[] {
  if (!cachedAllCommands) {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const name of [
      ...REPL_COMMANDS,
      ...CUSTOM_COMMANDS,
      ...getCommandNames(),
    ]) {
      if (seen.has(name)) continue;
      seen.add(name);
      ordered.push(name);
    }
    cachedAllCommands = ordered;
  }
  return cachedAllCommands;
}

/**
 * Compute completion candidates for a partial command line.
 *
 * Returns `[hits, completedToken]` in the shape that node:readline expects:
 * readline appends `hit.slice(completedToken.length)` when there is a single hit.
 */
export async function computeCompletions(
  line: string,
  ctx: CompleteContext
): Promise<[string[], string]> {
  const match = /\s(\S*)$/.exec(line);
  const tokenStart = match ? match.index + 1 : 0;
  const currentToken = line.slice(tokenStart);

  const before = line.slice(0, tokenStart).trim();
  const argIndex = before === '' ? 0 : before.split(/\s+/).length;

  if (argIndex === 0) {
    const all = allCommandNames();
    const hits = all.filter((c) => c.startsWith(currentToken));
    return [hits.length > 0 ? hits : all, currentToken];
  }

  const commandName = before.split(/\s+/)[0] ?? '';

  if (BUCKET_ARG_COMMANDS.has(commandName) && argIndex === 1) {
    const buckets = ctx.shell?.listMounts().map((m) => m.bucket) ?? [];
    const unique = Array.from(new Set(buckets));
    return [unique.filter((b) => b.startsWith(currentToken)), currentToken];
  }

  if (MOUNT_POINT_ARG_COMMANDS.has(commandName) && argIndex === 1) {
    const points = ctx.shell?.listMounts().map((m) => m.mountPoint) ?? [];
    return [points.filter((p) => p.startsWith(currentToken)), currentToken];
  }

  return [await completePath(currentToken, ctx), currentToken];
}

interface ResolvedPath {
  dir: string;
  prefix: string;
  displayDir: string;
}

function resolvePathToken(token: string, cwd: string): ResolvedPath {
  const lastSlash = token.lastIndexOf('/');
  if (lastSlash === -1) {
    return { dir: cwd, prefix: token, displayDir: '' };
  }
  const beforeSlash = token.slice(0, lastSlash);
  const prefix = token.slice(lastSlash + 1);
  const dir = token.startsWith('/')
    ? beforeSlash === ''
      ? '/'
      : beforeSlash
    : `${cwd}/${beforeSlash}`.replace(/\/\/+/g, '/');
  return { dir, prefix, displayDir: `${beforeSlash}/` };
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
}

async function readDirEntries(fs: ShellFs, dir: string): Promise<DirEntry[]> {
  if (typeof fs.readdirWithFileTypes === 'function') {
    const result = await fs.readdirWithFileTypes(dir);
    return result.map((d) => ({ name: d.name, isDirectory: d.isDirectory }));
  }
  const names = await fs.readdir(dir);
  return Promise.all(
    names.map(async (name) => {
      try {
        const stat = await fs.stat(`${dir}/${name}`.replace(/\/\/+/g, '/'));
        return { name, isDirectory: stat.isDirectory };
      } catch {
        return { name, isDirectory: false };
      }
    })
  );
}

async function completePath(
  token: string,
  ctx: CompleteContext
): Promise<string[]> {
  if (!ctx.shell) return [];
  const fs = ctx.shell.engine.fs;
  const cwd = ctx.cwd ?? ctx.shell.engine.getCwd();
  const { dir, prefix, displayDir } = resolvePathToken(token, cwd);

  let entries: DirEntry[];
  try {
    entries = await readDirEntries(fs, dir);
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.name.startsWith(prefix))
    .map((e) => `${displayDir}${e.name}${e.isDirectory ? '/' : ''}`);
}
