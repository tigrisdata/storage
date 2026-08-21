import { delimiter } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  type AgentTarget,
  buildSkillsArgs,
  defaultsHint,
  rejectedAgents,
  SUPPORTED_EDITORS,
  splitRejectedEditors,
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

describe('buildSkillsArgs', () => {
  it('pins the installer to @latest', () => {
    // A bare `skills` lets npx reuse a cached release that may not know every
    // agent name we pass, which fails the install for every editor at once.
    expect(
      buildSkillsArgs(['tigris-sdk-guide'], ['claude-code'], false)
    ).toEqual([
      '-y',
      'skills@latest',
      'add',
      'github.com/tigrisdata/skills',
      '--skill',
      'tigris-sdk-guide',
      '-a',
      'claude-code',
      '--yes',
    ]);
  });

  it('adds -g for a global install and repeats each skill and agent', () => {
    const args = buildSkillsArgs(['a', 'b'], ['claude-code', 'zed'], true);
    expect(args.filter((a) => a === '--skill')).toHaveLength(2);
    expect(args.filter((a) => a === '-a')).toHaveLength(2);
    expect(args).toContain('-g');
  });
});

describe('rejectedAgents', () => {
  const OURS = ['claude-code', 'cursor', 'zed', 'antigravity-cli'];

  it("picks the agents named on the installer's invalid-agents line", () => {
    // The real failure: an older `skills` release predating Zed support.
    const output = [
      'ERROR Invalid agents: zed',
      'Valid agents: amp, antigravity, claude-code, cline, codex, cursor, roo',
    ].join('\n');
    expect(rejectedAgents(output, OURS)).toEqual(['zed']);
  });

  it('never harvests names from the valid-agents list', () => {
    const output = [
      'Invalid agents: zed',
      'Valid agents: claude-code, cursor, antigravity-cli',
    ].join('\n');
    expect(rejectedAgents(output, OURS)).toEqual(['zed']);
  });

  it('stops at a valid-agents list that shares the line', () => {
    const output = 'Invalid agents: zed. Valid agents: claude-code, cursor';
    expect(rejectedAgents(output, OURS)).toEqual(['zed']);
  });

  it('reads several rejected agents', () => {
    const output = 'Invalid agents: zed, antigravity-cli\n';
    expect(rejectedAgents(output, OURS)).toEqual(['zed', 'antigravity-cli']);
  });

  it('reads the singular form', () => {
    expect(rejectedAgents('Invalid agent: zed', OURS)).toEqual(['zed']);
  });

  it("sees through the installer's colour codes", () => {
    // A colour sequence ends in a letter, so without stripping it the name
    // beside it fails the whole-word check.
    const esc = String.fromCharCode(27);
    const output = `${esc}[31mInvalid agents:${esc}[39m ${esc}[36mzed${esc}[39m`;
    expect(rejectedAgents(output, OURS)).toEqual(['zed']);
  });

  it('matches whole names, so a prefix of one is not the other', () => {
    // `antigravity` (upstream's name) must not condemn our `antigravity-cli`.
    expect(rejectedAgents('Invalid agents: antigravity', OURS)).toEqual([]);
    expect(
      rejectedAgents('Invalid agents: antigravity-cli', ['antigravity-cli'])
    ).toEqual(['antigravity-cli']);
  });

  it('returns nothing for unrelated failures', () => {
    // A network or clone failure must not be read as an unsupported editor —
    // dropping editors then would silently install less than asked.
    for (const output of [
      '',
      'ERROR fatal: could not read from remote repository',
      'Valid agents: claude-code, cursor, zed',
    ]) {
      expect(rejectedAgents(output, OURS)).toEqual([]);
    }
  });
});

describe('splitRejectedEditors', () => {
  const editors = (...ids: AgentTarget[]) =>
    SUPPORTED_EDITORS.filter((e) => ids.includes(e.id));
  const ids = (list: { id: AgentTarget }[]) => list.map((e) => e.id);

  // Verbatim from `skills add -a bogus-editor`; `zed` stands in for the agent an
  // older release doesn't know yet.
  const failure = [
    '✖  Invalid agents: zed',
    '➜  Valid agents: amp, antigravity, antigravity-cli, claude-code, cline, codex, cursor, roo, windsurf, opencode',
  ].join('\n');

  it('keeps the editors the installer supports and drops the rest', () => {
    const { kept, dropped } = splitRejectedEditors(
      editors('claude-code', 'cursor', 'zed'),
      failure
    );
    expect(ids(kept)).toEqual(['claude-code', 'cursor']);
    expect(ids(dropped)).toEqual(['zed']);
  });

  it('drops everything when no selected editor is supported', () => {
    // The caller reports a skip rather than retrying with an empty agent list.
    const { kept, dropped } = splitRejectedEditors(editors('zed'), failure);
    expect(kept).toEqual([]);
    expect(ids(dropped)).toEqual(['zed']);
  });

  it('keeps every editor when the failure has another cause', () => {
    const selected = editors('claude-code', 'zed');
    const { kept, dropped } = splitRejectedEditors(
      selected,
      'ERROR Failed to clone repository: network unreachable'
    );
    expect(kept).toEqual(selected);
    expect(dropped).toEqual([]);
  });
});
