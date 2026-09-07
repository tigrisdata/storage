import type { BrowserCli } from '@tigrisdata/cli/browser';
import { createCommandContext, InMemoryFs } from 'just-bash';
import { describe, expect, it, vi } from 'vitest';

import { createTigrisCommands } from '../src/commands/tigris';

type RunResult = Awaited<ReturnType<BrowserCli['run']>>;

function fakeCli(result: Partial<RunResult> = {}) {
  const run = vi.fn(
    async (): Promise<RunResult> => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      stdoutKind: 'text',
      ...result,
    })
  );
  const cli = { run, commands: () => [], specs: () => ({}) };
  return cli as unknown as BrowserCli & { run: typeof run };
}

function context(cwd = '/home/tigris') {
  return createCommandContext({ fs: new InMemoryFs(), cwd });
}

describe('tigris command', () => {
  it('forwards stdoutKind so a binary download survives a redirect', async () => {
    // Regression: the kind was dropped, so just-bash treated latin1-shaped
    // bytes as UTF-8 text and `objects get ... > file` wrote a corrupted file.
    const latin1 = String.fromCharCode(0x89, 0x50, 0xff, 0x00);
    const cli = fakeCli({ stdout: latin1, stdoutKind: 'bytes' });
    const [tigris] = createTigrisCommands(cli);

    const result = await tigris.execute(['objects', 'get'], context());

    expect(result.stdoutKind).toBe('bytes');
    expect(result.stdout).toBe(latin1);
  });

  it('forwards the shell cwd', async () => {
    const cli = fakeCli();
    const [tigris] = createTigrisCommands(cli);

    await tigris.execute(['ls'], context('/home/tigris/work'));

    expect(cli.run).toHaveBeenCalledWith(
      ['ls'],
      expect.objectContaining({ cwd: '/home/tigris/work' })
    );
  });

  it('registers both aliases by default', () => {
    expect(createTigrisCommands(fakeCli()).map((c) => c.name)).toEqual([
      'tigris',
      't3',
    ]);
  });
});
