import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  getInstallMethod,
  isBinaryBuild,
} from '../../src/utils/install-method.js';

const SCRATCH = mkdtempSync(join(tmpdir(), 'tigris-install-method-'));
const ORIGINAL_EXEC_PATH = process.execPath;

/** Point process.execPath at a real file so realpathSync() can resolve it. */
function setExecPath(...segments: string[]): void {
  const dir = join(SCRATCH, ...segments);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'tigris');
  writeFileSync(file, '', 'utf8');
  Object.defineProperty(process, 'execPath', {
    value: file,
    configurable: true,
  });
}

function setBinaryBuild(value: boolean): void {
  (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY = value;
}

afterEach(() => {
  Object.defineProperty(process, 'execPath', {
    value: ORIGINAL_EXEC_PATH,
    configurable: true,
  });
  delete (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY;
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

describe('isBinaryBuild', () => {
  it('is false under Node and true in a compiled binary', () => {
    expect(isBinaryBuild()).toBe(false);
    setBinaryBuild(true);
    expect(isBinaryBuild()).toBe(true);
  });
});

describe('getInstallMethod', () => {
  it('reports npm when running under Node', () => {
    expect(getInstallMethod()).toBe('npm');
  });

  // Regression guard: under npm, execPath is Node itself, which is very often
  // Homebrew-installed. The npm check must win or every Homebrew-Node user is
  // misreported as a Homebrew CLI install.
  it('reports npm even when Node itself lives in a Homebrew prefix', () => {
    setExecPath('Cellar', 'node', '22.0.0', 'bin');
    expect(getInstallMethod()).toBe('npm');
  });

  it('reports homebrew for a binary under a Homebrew Cellar prefix', () => {
    setBinaryBuild(true);
    setExecPath('Cellar', 'tigris', '3.7.0', 'bin');
    expect(getInstallMethod()).toBe(
      process.platform === 'win32' ? 'binary' : 'homebrew'
    );
  });

  it('reports homebrew for a binary under a Homebrew Caskroom prefix', () => {
    setBinaryBuild(true);
    setExecPath('Caskroom', 'tigris', '3.7.0', 'bin');
    expect(getInstallMethod()).toBe(
      process.platform === 'win32' ? 'binary' : 'homebrew'
    );
  });

  it('reports binary for a standalone install elsewhere', () => {
    setBinaryBuild(true);
    setExecPath('usr', 'local', 'bin');
    expect(getInstallMethod()).toBe('binary');
  });
});
