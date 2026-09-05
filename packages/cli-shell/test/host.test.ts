import { describe, expect, it, vi } from 'vitest';

import { createReplHost } from '../src/repl/host';
import {
  createDeferredIO,
  PROMPT_CANCELLED,
  type ReplIO,
} from '../src/repl/io';

function makeIO(answers: string[]): ReplIO & {
  written: string[];
  asked: Array<{ message: string; password: boolean }>;
} {
  const queue = [...answers];
  const written: string[] = [];
  const asked: Array<{ message: string; password: boolean }> = [];
  return {
    written,
    asked,
    write: (text) => written.push(text),
    prompt: async (message, options) => {
      asked.push({ message, password: options?.password === true });
      return queue.shift() ?? '';
    },
  };
}

describe('createReplHost', () => {
  it('treats y and yes as confirmation, case-insensitively', async () => {
    for (const answer of ['y', 'Y', 'yes', 'YES', ' y ']) {
      const host = createReplHost({ io: makeIO([answer]) });
      expect(await host.confirm('Delete?')).toBe(true);
    }
  });

  it('treats anything else as refusal, including empty input', async () => {
    for (const answer of ['', 'n', 'no', 'nope', 'yep']) {
      const host = createReplHost({ io: makeIO([answer]) });
      expect(await host.confirm('Delete?')).toBe(false);
    }
  });

  it('takes the confirm default on empty input, and shows it', async () => {
    // Enquirer semantics: `buckets create` asks "Enable snapshots?" with a
    // default of yes, so Enter must mean yes there — and no where the CLI
    // says no.
    const yes = makeIO(['']);
    expect(
      await createReplHost({ io: yes }).confirm('Enable snapshots?', {
        initial: true,
      })
    ).toBe(true);
    expect(yes.asked[0]?.message).toBe('Enable snapshots? (Y/n) ');

    const no = makeIO(['']);
    expect(
      await createReplHost({ io: no }).confirm('Delete?', { initial: false })
    ).toBe(false);
    expect(no.asked[0]?.message).toBe('Delete? (y/N) ');
  });

  it('lets a typed answer override the confirm default', async () => {
    const host = createReplHost({ io: makeIO(['n']) });
    expect(await host.confirm('Enable snapshots?', { initial: true })).toBe(
      false
    );
  });

  it('shows no default hint when the prompt text carries its own', async () => {
    // The readline path asks "... (y/N): " itself and passes no default.
    const io = makeIO(['']);
    await createReplHost({ io }).confirm('Delete? (y/N):');
    expect(io.asked[0]?.message).toBe('Delete? (y/N): ');
  });

  it('defaults a select to the initial index on empty input', async () => {
    const io = makeIO(['']);
    const value = await createReplHost({ io }).select(
      'Tier:',
      [
        { value: 'STANDARD', label: 'Standard' },
        { value: 'IA', label: 'Infrequent Access' },
      ],
      { initial: 1 }
    );

    expect(value).toBe('IA');
    expect(io.asked[0]?.message).toBe('Select [2]: ');
  });

  it('resolves a select default given as a choice value', async () => {
    const value = await createReplHost({ io: makeIO(['']) }).select(
      'Tier:',
      [
        { value: 'STANDARD', label: 'Standard' },
        { value: 'IA', label: 'Infrequent Access' },
      ],
      { initial: 'IA' }
    );
    expect(value).toBe('IA');
  });

  it('falls back to the first choice for a default that does not resolve', async () => {
    const choices = [{ value: 'a', label: 'A' }];
    expect(
      await createReplHost({ io: makeIO(['']) }).select('Pick:', choices, {
        initial: 7,
      })
    ).toBe('a');
    expect(
      await createReplHost({ io: makeIO(['']) }).select('Pick:', choices, {
        initial: 'nope',
      })
    ).toBe('a');
  });

  it('renders a numbered menu and resolves the chosen value', async () => {
    const io = makeIO(['2']);
    const host = createReplHost({ io });

    const value = await host.select('Pick a tier:', [
      { value: 'STANDARD', label: 'Standard' },
      { value: 'IA', label: 'Infrequent Access' },
    ]);

    expect(value).toBe('IA');
    expect(io.written.join('')).toContain('1) Standard');
    expect(io.written.join('')).toContain('2) Infrequent Access');
  });

  it('defaults to the first choice on empty input', async () => {
    const host = createReplHost({ io: makeIO(['']) });
    const value = await host.select('Pick:', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);
    expect(value).toBe('a');
  });

  it('accepts a choice by value or label', async () => {
    const byValue = createReplHost({ io: makeIO(['b']) });
    expect(
      await byValue.select('Pick:', [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ])
    ).toBe('b');

    const byLabel = createReplHost({ io: makeIO(['B']) });
    expect(
      await byLabel.select('Pick:', [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ])
    ).toBe('b');
  });

  it('re-asks instead of silently picking the first choice', async () => {
    const io = makeIO(['banana', '1']);
    const host = createReplHost({ io });

    const value = await host.select('Pick:', [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]);

    expect(value).toBe('a');
    expect(io.written.join('')).toContain('Not one of the choices: banana');
  });

  it('marks secret prompts so the terminal masks them', async () => {
    // Regression: the password flag was dropped, so access-key secrets were
    // echoed into terminal scrollback in clear text.
    const io = makeIO(['shh']);
    const host = createReplHost({ io });

    await host.input('Secret Access Key:', { password: true });

    expect(io.asked.map((ask) => ask.password)).toEqual([true]);
  });

  it('does not mark ordinary prompts as secret', async () => {
    const io = makeIO(['my-bucket']);
    const host = createReplHost({ io });

    await host.input('Bucket:');

    expect(io.asked.map((ask) => ask.password)).toEqual([false]);
  });

  describe('cancellation', () => {
    // Regression: a cancelled prompt resolved '' and empty meant "take the
    // default", so Ctrl+C on the login picker silently started OAuth.
    it('aborts a select instead of taking the first choice', async () => {
      const host = createReplHost({ io: makeIO([PROMPT_CANCELLED]) });

      await expect(
        host.select('Choose login method:', [
          { value: 'user', label: 'As a user' },
          { value: 'machine', label: 'As a machine' },
        ])
      ).rejects.toThrow(/cancelled/i);
    });

    it('aborts an input instead of returning empty', async () => {
      const host = createReplHost({ io: makeIO([PROMPT_CANCELLED]) });

      await expect(host.input('Access Key ID:')).rejects.toThrow(/cancelled/i);
    });

    it('aborts a confirm instead of answering no', async () => {
      // "Enable snapshots?" sits inside the `buckets create` wizard; a "no"
      // here would let the wizard finish and create the bucket anyway.
      const host = createReplHost({ io: makeIO([PROMPT_CANCELLED]) });

      await expect(
        host.confirm('Enable snapshots?', { initial: true })
      ).rejects.toThrow(/cancelled/i);
    });

    it('still takes the default on genuinely empty input', async () => {
      const host = createReplHost({ io: makeIO(['']) });

      expect(
        await host.select('Pick:', [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ])
      ).toBe('a');
    });
  });

  it('routes refreshSession to the supplied handler', async () => {
    const refreshSession = vi.fn(async () => {});
    const host = createReplHost({ io: makeIO([]), refreshSession });

    await host.refreshSession?.();

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('routes login to the supplied handler', async () => {
    const login = vi.fn(async () => {});
    const host = createReplHost({ io: makeIO([]), login });
    await host.login?.();
    expect(login).toHaveBeenCalledOnce();
  });

  it('gives the CLI its own not-authenticated wording when login is absent', async () => {
    const host = createReplHost({ io: makeIO([]) });
    // classifyError() pattern-matches this string to produce exit code 2.
    await expect(host.login?.()).rejects.toThrow(/Not authenticated/);
  });
});

describe('createDeferredIO', () => {
  it('forwards prompt options to the eventual IO', async () => {
    // Regression: the component wrote this wrapper inline and dropped the
    // second argument, so `password: true` never reached the terminal and
    // secrets were echoed — while every layer below handled masking correctly.
    const seen: Array<{ message: string; password?: boolean }> = [];
    const real: ReplIO = {
      write: () => {},
      prompt: async (message, options) => {
        seen.push({ message, ...(options ?? {}) });
        return 'answer';
      },
    };

    const io = createDeferredIO(() => real);
    expect(await io.prompt('Secret:', { password: true })).toBe('answer');
    expect(seen).toEqual([{ message: 'Secret:', password: true }]);
  });

  it('forwards writes', () => {
    const written: string[] = [];
    const io = createDeferredIO(() => ({
      write: (text) => written.push(text),
      prompt: async () => '',
    }));

    io.write('hello');
    expect(written).toEqual(['hello']);
  });

  it('degrades quietly before the target exists', async () => {
    const io = createDeferredIO(() => undefined);

    expect(() => io.write('dropped')).not.toThrow();
    expect(await io.prompt('anything?')).toBe('');
  });
});
