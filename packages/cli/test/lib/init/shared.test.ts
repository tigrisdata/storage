import { delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  defaultsHint,
  withoutEphemeralBins,
} from '../../../src/lib/init/shared.js';

describe('defaultsHint', () => {
  it('offers to install the CLI when it is missing', () => {
    expect(defaultsHint(false)).toBe(
      'CLI - Global, MCP - Global, Skills - Project'
    );
  });

  it('drops the CLI step once the CLI is installed', () => {
    expect(defaultsHint(true)).toBe('MCP - Global, Skills - Project');
  });

  it('always promises the MCP and skills steps', () => {
    for (const cliInstalled of [true, false]) {
      const hint = defaultsHint(cliInstalled);
      expect(hint).toContain('MCP - Global');
      expect(hint).toContain('Skills - Project');
    }
  });
});

describe('withoutEphemeralBins', () => {
  const path = (...dirs: string[]) => dirs.join(delimiter);
  /**
   * Pattern-only cases: pin the own-bin directory to null so they exercise
   * EPHEMERAL_BIN_DIR alone and don't depend on where the suite runs from.
   */
  const byPattern = (p: string | undefined) => withoutEphemeralBins(p, null);

  it("drops npx's throwaway bin directory", () => {
    // The real shape: `npx tigris init` puts this first on PATH, and it is gone
    // the moment npx exits — so a `tigris` found there is not an install.
    expect(
      byPattern(
        path(
          '/Users/me/.npm/_npx/f753ea211850000b/node_modules/.bin',
          '/usr/local/bin'
        )
      )
    ).toBe('/usr/local/bin');
  });

  it("drops pnpm dlx's cache directory", () => {
    // Measured from a real `pnpm dlx` run: a bare `dlx/` segment, not `dlx-<n>`.
    expect(
      byPattern(
        path(
          '/Users/me/Library/Caches/pnpm/dlx/f9e99c43/19fcbba383c-53a2/node_modules/.bin',
          '/usr/bin'
        )
      )
    ).toBe('/usr/bin');
  });

  it("drops older yarn dlx's temp directory", () => {
    expect(
      byPattern(path('/tmp/dlx-12345/node_modules/.bin', '/usr/bin'))
    ).toBe('/usr/bin');
  });

  it('drops the bin directory this process was launched from', () => {
    // The runner-agnostic guard: whatever cache layout a runner uses, the
    // directory it puts on PATH is the `.bin` beside our own install.
    const own = '/tmp/xfs-9f2a1c/node_modules/.bin'; // yarn berry: no _npx, no dlx
    expect(withoutEphemeralBins(path(own, '/usr/bin'), own)).toBe('/usr/bin');
  });

  it('ignores a trailing separator when matching its own bin directory', () => {
    const own = '/tmp/xfs-9f2a1c/node_modules/.bin';
    expect(withoutEphemeralBins(path(`${own}/`, '/usr/bin'), own)).toBe(
      '/usr/bin'
    );
  });

  it("keeps a global install's bin when its module dir is excluded", () => {
    // ownPackageBinDir names <prefix>/lib/node_modules/.bin, but the real
    // `tigris` is linked into <prefix>/bin — that must survive.
    const own = '/Users/me/.npm-global/lib/node_modules/.bin';
    expect(
      withoutEphemeralBins(path('/Users/me/.npm-global/bin', '/usr/bin'), own)
    ).toBe(path('/Users/me/.npm-global/bin', '/usr/bin'));
  });

  it('keeps real install directories, including npm-global', () => {
    const real = path(
      '/Users/me/.npm-global/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin'
    );
    expect(byPattern(real)).toBe(real);
  });

  it('matches whole path segments, not substrings', () => {
    // `_npxtools` is somebody's real directory, not an npx cache.
    const real = path('/Users/me/_npxtools/bin', '/srv/dlxtools/bin');
    expect(byPattern(real)).toBe(real);
  });

  it('handles Windows-style backslash separators', () => {
    // Drive letter omitted on purpose: `delimiter` is ':' on POSIX, so "C:\..."
    // would split at the colon here. What matters is that '\' reads as a path
    // separator, so `_npx` is matched as a segment on Windows too.
    expect(
      byPattern(
        path(
          '\\Users\\me\\AppData\\npm-cache\\_npx\\abc\\node_modules\\.bin',
          '/usr/bin'
        )
      )
    ).toBe('/usr/bin');
  });

  it('drops empty entries and tolerates an unset PATH', () => {
    expect(byPattern(path('', '/usr/bin', ''))).toBe('/usr/bin');
    expect(byPattern(undefined)).toBe('');
  });
});
