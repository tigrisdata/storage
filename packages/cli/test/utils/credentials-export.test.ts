import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IAM_ENDPOINT,
  DEFAULT_STORAGE_ENDPOINT,
} from '../../src/constants.js';
import {
  credentialVariables,
  formatDotenvValue,
  gitignoreStatus,
  mergeDotenv,
  shellExportLines,
  writeDotenv,
} from '../../src/utils/credentials-export.js';

const defaults = {
  storage: DEFAULT_STORAGE_ENDPOINT,
  iam: DEFAULT_IAM_ENDPOINT,
};
const key = { id: 'tid_AaBb', secret: 'tsec_XxYy', endpoints: defaults };

describe('credentialVariables', () => {
  it('writes the Tigris SDK variables, with the bucket when there is one', () => {
    expect(credentialVariables({ ...key, sdk: 'tigris' })).toEqual([
      ['TIGRIS_STORAGE_ACCESS_KEY_ID', 'tid_AaBb'],
      ['TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tsec_XxYy'],
    ]);
    expect(
      credentialVariables({ ...key, sdk: 'tigris', bucket: 'my-app' })
    ).toEqual([
      ['TIGRIS_STORAGE_ACCESS_KEY_ID', 'tid_AaBb'],
      ['TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tsec_XxYy'],
      ['TIGRIS_STORAGE_BUCKET', 'my-app'],
    ]);
  });

  it('names the Tigris endpoint only when it is not the default', () => {
    const endpoints = { ...defaults, storage: 'https://s3.example.dev' };
    expect(credentialVariables({ ...key, sdk: 'tigris', endpoints })).toEqual([
      ['TIGRIS_STORAGE_ACCESS_KEY_ID', 'tid_AaBb'],
      ['TIGRIS_STORAGE_SECRET_ACCESS_KEY', 'tsec_XxYy'],
      ['TIGRIS_STORAGE_ENDPOINT', 'https://s3.example.dev'],
    ]);
  });

  it('writes everything the AWS SDK needs to reach the same deployment', () => {
    expect(credentialVariables({ ...key, sdk: 'aws', bucket: 'x' })).toEqual([
      ['AWS_ACCESS_KEY_ID', 'tid_AaBb'],
      ['AWS_SECRET_ACCESS_KEY', 'tsec_XxYy'],
      ['AWS_ENDPOINT_URL_S3', 'https://t3.storage.dev'],
      ['AWS_ENDPOINT_URL_IAM', 'https://iam.storageapi.dev'],
      ['AWS_REGION', 'auto'],
    ]);
    const endpoints = {
      storage: 'https://s3.example.dev',
      iam: 'https://iam.example.dev',
    };
    expect(credentialVariables({ ...key, sdk: 'aws', endpoints })).toEqual(
      expect.arrayContaining([
        ['AWS_ENDPOINT_URL_S3', 'https://s3.example.dev'],
        ['AWS_ENDPOINT_URL_IAM', 'https://iam.example.dev'],
      ])
    );
  });
});

describe('formatDotenvValue', () => {
  it('leaves key-like values bare', () => {
    expect(formatDotenvValue('tsec_Ab+/=c.d:e@f-g')).toBe(
      'tsec_Ab+/=c.d:e@f-g'
    );
    expect(formatDotenvValue('')).toBe('');
  });

  it('quotes and escapes anything a parser could misread', () => {
    expect(formatDotenvValue('a b')).toBe('"a b"');
    expect(formatDotenvValue('x#y')).toBe('"x#y"');
    expect(formatDotenvValue('say "hi"\\n')).toBe('"say \\"hi\\"\\\\n"');
    expect(formatDotenvValue('two\nlines')).toBe('"two\\nlines"');
  });
});

describe('mergeDotenv', () => {
  const vars: Array<[string, string]> = [
    ['A', '1'],
    ['B', '2'],
  ];

  it('starts a new file from nothing', () => {
    expect(mergeDotenv('', vars)).toBe('A=1\nB=2\n');
  });

  it('replaces existing assignments in place and appends the rest', () => {
    const before = '# db\nDB=x\nA=old\n\nOTHER="keep me"\n';
    expect(mergeDotenv(before, vars)).toBe(
      '# db\nDB=x\nA=1\n\nOTHER="keep me"\nB=2\n'
    );
  });

  it('keeps an export prefix and surrounding whitespace', () => {
    expect(mergeDotenv('export A = "old" # c\n', vars)).toBe(
      'export A=1\nB=2\n'
    );
  });

  it('rewrites every duplicate, since parsers disagree on which one wins', () => {
    expect(mergeDotenv('A=1st\nB=x\nA=2nd\n', vars)).toBe('A=1\nB=2\nA=1\n');
  });

  it('does not touch keys that merely share a prefix', () => {
    expect(mergeDotenv('AB=1\nA_B=2\n', vars)).toBe('AB=1\nA_B=2\nA=1\nB=2\n');
  });

  it('adds the missing final newline', () => {
    expect(mergeDotenv('X=1', vars)).toBe('X=1\nA=1\nB=2\n');
  });

  it('keeps CRLF line endings in a file that uses them', () => {
    expect(mergeDotenv('A=old\r\nX=1\r\n', vars)).toBe('A=1\r\nX=1\r\nB=2\r\n');
    expect(mergeDotenv('X=1\r\nA=old', vars)).toBe('X=1\r\nA=1\r\nB=2\r\n');
  });

  it('edits a file with mixed line endings line by line', () => {
    // Splitting on CRLF alone would fold "B=old\nC=keep" into one line and
    // drop C when replacing B.
    expect(mergeDotenv('A=0\r\nB=old\nC=keep\r\n', [['B', '1']])).toBe(
      'A=0\r\nB=1\nC=keep\r\n'
    );
  });
});

describe('shellExportLines', () => {
  it('single-quotes values, escaping embedded quotes', () => {
    expect(
      shellExportLines([
        ['A', 'plain'],
        ['B', "it's $HOME"],
      ])
    ).toEqual(["export A='plain'", "export B='it'\\''s $HOME'"]);
  });
});

describe('writeDotenv', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'tigris-dotenv-'));

  it('creates the file readable by the owner only', () => {
    const file = join(dir(), '.env');
    expect(writeDotenv(file, [['A', '1']])).toEqual({ created: true });
    expect(readFileSync(file, 'utf8')).toBe('A=1\n');
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('merges into an existing file and leaves its permissions alone', () => {
    const file = join(dir(), '.env');
    writeFileSync(file, 'A=old\nKEEP=1\n', { mode: 0o644 });
    expect(writeDotenv(file, [['A', '1']])).toEqual({ created: false });
    expect(readFileSync(file, 'utf8')).toBe('A=1\nKEEP=1\n');
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o644);
    }
  });

  it('surfaces the filesystem error rather than swallowing it', () => {
    expect(() =>
      writeDotenv(join(dir(), 'missing', '.env'), [['A', '1']])
    ).toThrow(/ENOENT/);
  });

  it('leaves the existing file untouched when the new content cannot be written', () => {
    if (process.platform === 'win32' || process.getuid?.() === 0) return;
    const folder = dir();
    const file = join(folder, '.env');
    writeFileSync(file, 'KEEP=1\n');
    // The file itself is writable, but the temporary file beside it cannot
    // be created, which is where a truncating write would have lost KEEP.
    chmodSync(folder, 0o500);
    try {
      expect(() => writeDotenv(file, [['A', '1']])).toThrow(/EACCES/);
      expect(readFileSync(file, 'utf8')).toBe('KEEP=1\n');
      expect(readdirSync(folder)).toEqual(['.env']);
    } finally {
      chmodSync(folder, 0o700);
    }
  });

  it('writes through a symlink instead of replacing it', () => {
    if (process.platform === 'win32') return;
    const folder = dir();
    const real = join(folder, 'real.env');
    const link = join(folder, '.env');
    writeFileSync(real, 'A=old\n');
    symlinkSync(real, link);
    writeDotenv(link, [['A', '1']]);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(real, 'utf8')).toBe('A=1\n');
  });
});

describe('gitignoreStatus', () => {
  function repo(gitignore?: string, ...dirs: string[]): string {
    const root = mkdtempSync(join(tmpdir(), 'tigris-gitignore-'));
    mkdirSync(join(root, '.git'));
    if (gitignore !== undefined)
      writeFileSync(join(root, '.gitignore'), gitignore);
    for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true });
    return root;
  }

  it('reports when there is no .gitignore to check', () => {
    expect(gitignoreStatus(join(repo(), '.env'))).toBe('no-gitignore');
  });

  it.each([
    ['.env', '.env', 'covered'],
    ['.env*', '.env.local', 'covered'],
    ['*.env', 'prod.env', 'covered'],
    ['/.env', '.env', 'covered'],
    ['**/.env', '.env', 'covered'],
    ['.env/', '.env', 'not-covered'],
    ['.env.local', '.env', 'not-covered'],
    ['# .env', '.env', 'not-covered'],
    ['.env\n!.env', '.env', 'not-covered'],
    ['!.env\n.env', '.env', 'covered'],
  ])('pattern %j vs %s → %s', (pattern, file, status) => {
    expect(gitignoreStatus(join(repo(pattern), file))).toBe(status);
  });

  it.each([
    // [pattern, file, status] — files live under app/ or app/config/
    ['.env', 'app/.env', 'covered'],
    ['**/.env', 'app/config/.env', 'covered'],
    ['/.env', 'app/.env', 'not-covered'],
    ['app/.env', 'app/.env', 'covered'],
    ['app/**/.env', 'app/.env', 'covered'],
    ['app/**/.env', 'app/config/.env', 'covered'],
    ['app/**', 'app/config/.env', 'covered'],
    ['config/.env', 'app/config/.env', 'not-covered'],
    ['**/config/.env', 'app/config/.env', 'covered'],
    // A pattern matching a parent directory ignores everything inside it.
    ['app/', 'app/config/.env', 'covered'],
    ['app', 'app/config/.env', 'covered'],
    ['config/', 'app/config/.env', 'covered'],
    ['/config/', 'app/config/.env', 'not-covered'],
    // ...and nothing re-includes a file under an excluded directory.
    ['app/\n!app/config/.env', 'app/config/.env', 'covered'],
    ['app/\n!app/', 'app/config/.env', 'not-covered'],
  ])('nested pattern %j vs %s → %s', (pattern, file, status) => {
    const root = repo(pattern, 'app/config');
    expect(gitignoreStatus(join(root, file))).toBe(status);
  });

  it('lets the nearest .gitignore have the final say', () => {
    const root = repo('.env', 'app');
    writeFileSync(join(root, 'app', '.gitignore'), '!.env\n');
    expect(gitignoreStatus(join(root, 'app', '.env'))).toBe('not-covered');
  });
});
