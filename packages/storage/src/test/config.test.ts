import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Path to the actual shared config source. It only depends on `dotenv`, so it
// runs standalone under Node's type stripping — no bundler/alias needed.
const sharedConfig = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../shared/config.ts'
);

/**
 * Runs a probe in a fresh Node process whose cwd is `dir` (so `.env`
 * resolution is isolated from the test runner's own environment), and returns
 * the JSON the probe prints.
 */
function runProbe(dir: string): {
  bucket: string | null;
  leakedTigris: string | null;
  leakedUnrelated: string | null;
} {
  const probe = join(dir, 'probe.mjs');
  writeFileSync(
    probe,
    `import { getEnvVar } from ${JSON.stringify(sharedConfig)};
     process.stdout.write(JSON.stringify({
       bucket: getEnvVar('TIGRIS_STORAGE_BUCKET') ?? null,
       leakedTigris: process.env.TIGRIS_STORAGE_BUCKET ?? null,
       leakedUnrelated: process.env.UNRELATED_SECRET ?? null,
     }));`
  );
  // Strip any TIGRIS_/probe vars the test runner already has in its
  // environment (it injects the repo `.env`) so the child only sees what the
  // temp `.env` provides — otherwise inheritance would mask the behavior.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('TIGRIS_') || key === 'UNRELATED_SECRET') {
      delete env[key];
    }
  }

  return JSON.parse(
    execFileSync(process.execPath, [probe], { cwd: dir, encoding: 'utf8', env })
  );
}

describe('config env loading', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tigris-env-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads TIGRIS_ vars from .env without mutating process.env', () => {
    writeFileSync(
      join(dir, '.env'),
      'TIGRIS_STORAGE_BUCKET=from-dotenv\nUNRELATED_SECRET=leak-me\n'
    );

    const out = runProbe(dir);

    // The value is available to the SDK via getEnvVar...
    expect(out.bucket).toBe('from-dotenv');
    // ...but nothing from .env reaches the global process.env: neither the
    // TIGRIS_ key nor the unrelated secret leaks to the rest of the process.
    expect(out.leakedTigris).toBeNull();
    expect(out.leakedUnrelated).toBeNull();
  });

  it('resolves to undefined when there is no .env', () => {
    const out = runProbe(dir);

    expect(out.bucket).toBeNull();
    expect(out.leakedUnrelated).toBeNull();
  });
});
