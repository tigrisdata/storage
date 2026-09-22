/**
 * Turn a freshly created access key into the environment variables an SDK
 * reads, and get them into a dotenv file or the user's shell.
 */

import {
  chmodSync,
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import { DEFAULT_STORAGE_ENDPOINT } from '../constants.js';

export const CREDENTIALS_SDKS = ['tigris', 'aws'] as const;
export type CredentialsSdk = (typeof CREDENTIALS_SDKS)[number];

export interface KeyCredentials {
  id: string;
  secret: string;
  /** Written when the key was scoped to exactly one bucket. */
  bucket?: string;
  sdk: CredentialsSdk;
  /** The endpoints the CLI itself is talking to, so the SDK gets the same. */
  endpoints: { storage: string; iam: string };
}

export type EnvVariable = [name: string, value: string];

/**
 * The variables the chosen SDK reads, in the order they are written. The AWS
 * set includes everything the AWS SDK needs to reach Tigris; Tigris SDK
 * defaults its endpoint, so that set only names one when it is not the
 * default.
 */
export function credentialVariables(
  credentials: KeyCredentials
): EnvVariable[] {
  const { id, secret, bucket, sdk, endpoints } = credentials;
  if (sdk === 'aws') {
    return [
      ['AWS_ACCESS_KEY_ID', id],
      ['AWS_SECRET_ACCESS_KEY', secret],
      ['AWS_ENDPOINT_URL_S3', endpoints.storage],
      ['AWS_ENDPOINT_URL_IAM', endpoints.iam],
      ['AWS_REGION', 'auto'],
    ];
  }
  const variables: EnvVariable[] = [
    ['TIGRIS_STORAGE_ACCESS_KEY_ID', id],
    ['TIGRIS_STORAGE_SECRET_ACCESS_KEY', secret],
  ];
  if (endpoints.storage !== DEFAULT_STORAGE_ENDPOINT) {
    variables.push(['TIGRIS_STORAGE_ENDPOINT', endpoints.storage]);
  }
  if (bucket) {
    variables.push(['TIGRIS_STORAGE_BUCKET', bucket]);
  }
  return variables;
}

/**
 * A dotenv value: bare when every dotenv parser reads it the same way,
 * otherwise double-quoted with the escapes they all understand.
 */
export function formatDotenvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+=-]*$/.test(value)) return value;
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/**
 * Set `variables` in dotenv `content`, leaving every other line alone. An
 * existing assignment is replaced in place (every occurrence, since parsers
 * disagree on whether the first or the last one wins, and an `export`
 * prefix is kept); anything missing is appended.
 */
export function mergeDotenv(content: string, variables: EnvVariable[]): string {
  // Split on LF and let each line keep its own CR, so a file that mixes
  // CRLF and LF is edited line by line and never re-joined wrongly. Lines
  // this adds follow the file's convention: CRLF if it uses CRLF anywhere.
  const lines = content === '' ? [] : content.split('\n');
  const endedWithNewline = content.endsWith('\n');
  if (endedWithNewline) lines.pop();
  const cr = content.includes('\r\n') ? '\r' : '';

  const wanted = new Map(variables);
  const seen = new Set<string>();
  const merged = lines.map((line) => {
    const lineCr = line.endsWith('\r') ? '\r' : '';
    const body = lineCr ? line.slice(0, -1) : line;
    const assignment = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(
      body
    );
    const name = assignment?.[2];
    if (!assignment || name === undefined || !wanted.has(name)) return line;
    seen.add(name);
    return `${assignment[1]}${name}=${formatDotenvValue(wanted.get(name) ?? '')}${lineCr}`;
  });
  // A last line that had no newline gets one below; in a CRLF file it
  // needs its CR too.
  if (!endedWithNewline && merged.length > 0 && cr) {
    const last = merged.length - 1;
    if (!merged[last].endsWith('\r')) merged[last] += '\r';
  }
  for (const [name, value] of variables) {
    if (!seen.has(name))
      merged.push(`${name}=${formatDotenvValue(value)}${cr}`);
  }
  return `${merged.join('\n')}\n`;
}

/**
 * Merge `variables` into the dotenv file at `filePath`. A new file is
 * created readable by its owner only; an existing file keeps its
 * permissions, so a file the CLI may not write is an error, not a chmod.
 * The content is written to a temporary file beside the target and renamed
 * over it, so a write that fails part-way (disk full, quota) leaves the
 * existing file untouched. Throws the filesystem error as is.
 */
export function writeDotenv(
  filePath: string,
  variables: EnvVariable[]
): { created: boolean } {
  // Through a symlink, so the file it points at is updated, not the link.
  const target = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const existed = existsSync(target);
  const current = existed ? readFileSync(target, 'utf8') : '';
  const mode = existed ? statSync(target).mode & 0o777 : 0o600;

  const temp = join(
    dirname(target),
    `.${basename(target)}.${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    writeFileSync(temp, mergeDotenv(current, variables), { mode, flag: 'wx' });
    // The mode passed at creation is subject to the umask; the file must
    // end up exactly as permissive as the one it replaces.
    chmodSync(temp, mode);
    renameSync(temp, target);
  } catch (err) {
    try {
      unlinkSync(temp);
    } catch {
      // Nothing to clean up.
    }
    throw err;
  }
  return { created: !existed };
}

/** `export NAME='value'` lines for `eval "$(...)"` in a POSIX shell. */
export function shellExportLines(variables: EnvVariable[]): string[] {
  return variables.map(
    ([name, value]) => `export ${name}='${value.replace(/'/g, `'\\''`)}'`
  );
}

export type GitignoreStatus = 'covered' | 'not-covered' | 'no-gitignore';

/**
 * A gitignore glob as a regex over a slash-separated path: `*` and `?` stop
 * at slashes, a `**` segment spans any number of directories, and a
 * trailing `**` is everything beneath.
 */
function globToRegex(glob: string): RegExp {
  const segments = glob.split('/');
  const source = segments
    .map((segment, index) => {
      const last = index === segments.length - 1;
      if (segment === '**') return last ? '.*' : '(?:.*/)?';
      const literal = segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      return last ? literal : `${literal}/`;
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** How a pattern matched: the file itself, or a directory above it. */
type GitignoreMatch = 'file' | 'parent' | null;

/**
 * Compile one .gitignore pattern into a test over a slash-separated path
 * relative to the .gitignore's directory. Covers the parts of the format
 * that matter for a dotenv file: anchoring (a slash anywhere but the end
 * anchors the pattern to that directory; otherwise it matches at any
 * depth), `**`, directory-only patterns, and the rule that a pattern
 * matching a parent directory ignores everything inside it.
 */
function gitignoreMatcher(
  pattern: string
): ((relativePath: string) => GitignoreMatch) | null {
  let glob = pattern.trim();
  if (glob === '' || glob.startsWith('#')) return null;

  const directoryOnly = glob.endsWith('/');
  if (directoryOnly) glob = glob.slice(0, -1);
  // A leading "**/" matches at any depth, which is what an unanchored
  // pattern already means; any other slash anchors the pattern here.
  const anyDepth = glob.startsWith('**/');
  if (anyDepth) glob = glob.slice(3);
  const anchored = !anyDepth && glob.includes('/');
  if (glob.startsWith('/')) glob = glob.slice(1);
  if (glob === '') return null;

  const regex = globToRegex(glob);
  const matchesPath = (candidate: string) => {
    if (anchored) return regex.test(candidate);
    // Unanchored: the pattern may match any trailing part of the path.
    const segments = candidate.split('/');
    return segments.some((_, i) => regex.test(segments.slice(i).join('/')));
  };

  return (relativePath) => {
    const segments = relativePath.split('/');
    const parents = segments
      .slice(0, -1)
      .map((_, i) => segments.slice(0, i + 1).join('/'));
    if (!directoryOnly && matchesPath(relativePath)) return 'file';
    return parents.some(matchesPath) ? 'parent' : null;
  };
}

/**
 * Whether the `.gitignore` files above `filePath` (up to the repository
 * root, or the filesystem root) ignore it. As in git: the nearest file has
 * the final say, within a file the last matching pattern does, `!pattern`
 * re-includes, but nothing re-includes a file under an excluded directory.
 */
export function gitignoreStatus(filePath: string): GitignoreStatus {
  let dir = dirname(filePath);
  let status: GitignoreStatus = 'no-gitignore';
  const verdicts: Array<{
    depth: number;
    ignored: boolean;
    via: Exclude<GitignoreMatch, null>;
  }> = [];

  for (let depth = 0; ; depth++) {
    const gitignore = join(dir, '.gitignore');
    if (existsSync(gitignore)) {
      if (status === 'no-gitignore') status = 'not-covered';
      const relativePath = relative(dir, filePath).split(sep).join('/');
      for (const line of readFileSync(gitignore, 'utf8').split('\n')) {
        const negated = line.startsWith('!');
        const via = gitignoreMatcher(negated ? line.slice(1) : line)?.(
          relativePath
        );
        if (via) verdicts.push({ depth, ignored: !negated, via });
      }
    }
    const atRepoRoot = existsSync(join(dir, '.git'));
    const parent = dirname(dir);
    if (atRepoRoot || parent === dir) break;
    dir = parent;
  }

  // Verdicts arrive nearest-first and in file order, so "nearest file, then
  // last pattern" is the last verdict at the smallest depth.
  const decisive = (candidates: typeof verdicts) =>
    candidates.reduce<(typeof verdicts)[number] | undefined>(
      (best, verdict) =>
        best === undefined || verdict.depth <= best.depth ? verdict : best,
      undefined
    );
  const byDirectory = decisive(verdicts.filter((v) => v.via === 'parent'));
  if (byDirectory?.ignored) return 'covered';
  const overall = decisive(verdicts);
  if (overall === undefined) return status;
  return overall.ignored ? 'covered' : 'not-covered';
}
