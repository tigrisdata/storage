import { describe, expect, it } from 'vitest';

import {
  type CompletionContext,
  computeCompletions,
} from '../src/repl/complete';
import { longestCommonPrefix } from '../src/repl/loop';

/** A spec tree with more in it than the browser build can run. */
function contextFor(available: string[]): CompletionContext {
  const specs = {
    commands: [
      { name: 'buckets', commands: [{ name: 'list' }, { name: 'create' }] },
      { name: 'bundle' },
      {
        name: 'telemetry',
        commands: [{ name: 'enable' }, { name: 'disable' }],
      },
      { name: 'whoami' },
      { name: 'old', removed: true },
    ],
  };
  return {
    engine: {
      cli: { specs: () => specs, commands: () => available },
      bash: { fs: {} },
    },
    session: { shellCommands: ['clear'] },
    cwd: '/home/tigris',
  } as unknown as CompletionContext;
}

describe('computeCompletions', () => {
  // Regression: the whole spec tree was offered, so `tigris bun<Tab>` gave
  // `bundle`, which then failed as not available in the browser.
  it('offers only commands the browser build can run', async () => {
    const [hits, token] = await computeCompletions(
      'tigris ',
      contextFor(['buckets/list', 'buckets/create', 'whoami'])
    );

    expect(hits).toEqual(['buckets', 'whoami']);
    expect(token).toBe('');
  });

  it('filters nested commands the same way', async () => {
    const [hits] = await computeCompletions(
      'tigris buckets ',
      contextFor(['buckets/list', 'whoami'])
    );

    expect(hits).toEqual(['list']);
  });

  it('narrows by the typed prefix', async () => {
    const [hits, token] = await computeCompletions(
      'tigris bu',
      contextFor(['buckets/list', 'whoami'])
    );

    expect(hits).toEqual(['buckets']);
    expect(token).toBe('bu');
  });
});

describe('longestCommonPrefix', () => {
  it('is empty for no candidates', () => {
    expect(longestCommonPrefix([])).toBe('');
  });

  it('is the whole value for a single candidate', () => {
    expect(longestCommonPrefix(['buckets'])).toBe('buckets');
  });

  it('finds the shared prefix', () => {
    expect(longestCommonPrefix(['buckets', 'bundle'])).toBe('bu');
  });

  it('is empty when nothing is shared', () => {
    expect(longestCommonPrefix(['buckets', 'objects'])).toBe('');
  });

  it('stops at the shortest candidate', () => {
    expect(longestCommonPrefix(['ls', 'ls-versions'])).toBe('ls');
  });
});
