import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Captures what `installSkills` reports, in place of clack's terminal output.
 * Hoisted because the module factory below is lifted above the imports.
 */
const { logged } = vi.hoisted(() => ({
  logged: {
    warn: [] as string[],
    info: [] as string[],
    success: [] as string[],
    error: [] as string[],
  },
}));

vi.mock('@clack/prompts', () => ({
  log: {
    warn: (m: string) => logged.warn.push(m),
    info: (m: string) => logged.info.push(m),
    success: (m: string) => logged.success.push(m),
    error: (m: string) => logged.error.push(m),
  },
}));

import { installSkills } from '../../../src/lib/init/interactive.js';
import {
  type AgentTarget,
  SUPPORTED_EDITORS,
} from '../../../src/lib/init/shared.js';

/** Verbatim shape of a real `skills add` rejection, for `zed` specifically. */
const REJECTS_ZED = [
  '✖  Invalid agents: zed',
  '➜  Valid agents: amp, antigravity, claude-code, cline, codex, cursor, roo',
].join('\n');

describe('installSkills', () => {
  const CWD = '/repo';
  const HOME = '/home/tester';
  const SKILLS = ['tigris-sdk-guide', 'tigris-agent-kit'];

  const editors = (...ids: AgentTarget[]) =>
    SUPPORTED_EDITORS.filter((e) => ids.includes(e.id));

  /**
   * A stand-in runner that answers each call from `results` in order (and `ok`
   * once they run out), recording what it was asked to run.
   */
  function runner(...results: { ok: boolean; output?: string }[]) {
    const calls: { cmd: string; args: string[]; startMsg: string }[] = [];
    const run = (cmd: string, args: string[], startMsg: string) => {
      calls.push({ cmd, args, startMsg });
      return results[calls.length - 1] ?? { ok: true };
    };
    return { calls, run };
  }

  /** The `-a <agent>` names of one recorded invocation. */
  const agentsOf = (args: string[]) =>
    args.filter((_, i) => args[i - 1] === '-a');

  beforeEach(() => {
    for (const list of Object.values(logged)) list.length = 0;
  });

  it('installs once and reports every destination when nothing is rejected', () => {
    const { calls, run } = runner({ ok: true });

    installSkills(
      editors('claude-code', 'zed'),
      SKILLS,
      'project',
      CWD,
      HOME,
      run
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('npx');
    expect(calls[0].args).toContain('skills@latest');
    expect(agentsOf(calls[0].args)).toEqual(['claude-code', 'zed']);
    expect(logged.success).toEqual([
      'Skills → /repo/.claude/skills',
      'Skills → /repo/.agents/skills',
    ]);
    expect(logged.warn).toEqual([]);
    expect(logged.error).toEqual([]);
  });

  it('retries without the rejected editor and reports only what was installed', () => {
    // The reported failure: an installer that predates Zed support must not cost
    // Claude Code its skills.
    const { calls, run } = runner(
      { ok: false, output: REJECTS_ZED },
      { ok: true }
    );

    installSkills(
      editors('claude-code', 'zed'),
      SKILLS,
      'project',
      CWD,
      HOME,
      run
    );

    expect(calls).toHaveLength(2);
    expect(agentsOf(calls[0].args)).toEqual(['claude-code', 'zed']);
    expect(agentsOf(calls[1].args)).toEqual(['claude-code']);
    // Same skills, still non-interactive, on the retry.
    expect(calls[1].args.filter((a) => a === '--skill')).toHaveLength(2);
    expect(calls[1].args).toContain('--yes');
    expect(logged.warn).toEqual([
      'Skills: installer has no support for Zed — skipped.',
    ]);
    // Zed's directory (.agents/skills) is not claimed as installed.
    expect(logged.success).toEqual(['Skills → /repo/.claude/skills']);
    expect(logged.error).toEqual([]);
  });

  it('skips the step without a second attempt when every editor is rejected', () => {
    const { calls, run } = runner({ ok: false, output: REJECTS_ZED });

    installSkills(editors('zed'), SKILLS, 'project', CWD, HOME, run);

    expect(calls).toHaveLength(1);
    expect(logged.warn).toEqual([
      'Skills: installer has no support for Zed — skipped.',
    ]);
    expect(logged.info).toEqual([
      'Agent skills: skipped (no supported editor selected)',
    ]);
    expect(logged.success).toEqual([]);
    // Nothing was installed, but nothing failed either — no error dump.
    expect(logged.error).toEqual([]);
  });

  it('reports a failure with another cause as-is, dropping no editor', () => {
    // Reading a network failure as an unsupported editor would silently install
    // less than the user asked for.
    const { calls, run } = runner({
      ok: false,
      output: 'ERROR Failed to clone repository: network unreachable',
    });

    installSkills(
      editors('claude-code', 'zed'),
      SKILLS,
      'project',
      CWD,
      HOME,
      run
    );

    expect(calls).toHaveLength(1);
    expect(logged.warn).toEqual([]);
    expect(logged.success).toEqual([]);
    expect(logged.error).toEqual([
      'ERROR Failed to clone repository: network unreachable',
    ]);
  });

  it('surfaces a retry that fails for its own reason', () => {
    const { calls, run } = runner(
      { ok: false, output: REJECTS_ZED },
      { ok: false, output: 'ERROR EACCES: permission denied' }
    );

    installSkills(
      editors('claude-code', 'zed'),
      SKILLS,
      'project',
      CWD,
      HOME,
      run
    );

    expect(calls).toHaveLength(2);
    expect(logged.warn).toHaveLength(1);
    expect(logged.success).toEqual([]);
    expect(logged.error).toEqual(['ERROR EACCES: permission denied']);
  });

  it('trims a long failure to its last lines', () => {
    const { run } = runner({
      ok: false,
      output: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n'),
    });

    installSkills(editors('claude-code'), SKILLS, 'project', CWD, HOME, run);

    expect(logged.error).toEqual([
      ['line 15', 'line 16', 'line 17', 'line 18', 'line 19', 'line 20'].join(
        '\n'
      ),
    ]);
  });

  it('asks for a user-level install at global scope', () => {
    const { calls, run } = runner({ ok: true });

    installSkills(editors('claude-code'), SKILLS, 'global', CWD, HOME, run);

    expect(calls[0].args).toContain('-g');
    // Global destinations sit outside the fake home, so they print in full.
    expect(logged.success).toHaveLength(1);
    expect(logged.success[0]).not.toContain('/repo');
  });

  it('passes each agent once when editors share one', () => {
    // Cursor, Codex and Zed all install through `.agents/skills`, but each has
    // its own installer name; a repeated name would be a wasted `-a`.
    const { calls, run } = runner({ ok: true });

    installSkills(
      editors('cursor', 'codex', 'zed'),
      SKILLS,
      'project',
      CWD,
      HOME,
      run
    );

    const agents = agentsOf(calls[0].args);
    expect(agents).toEqual([...new Set(agents)]);
    // One shared destination, reported once.
    expect(logged.success).toEqual(['Skills → /repo/.agents/skills']);
  });
});
