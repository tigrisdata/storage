import { describe, expect, it } from 'vitest';

import { beginCapture, endCapture } from '../../src/browser/output';
import { process as processShim } from '../../src/browser/shims/process-global';

describe('process.stdout as a Writable', () => {
  // Regression: `on`/`once`/`end` were no-ops, so `stream.pipeline()` waited
  // forever for a 'finish' that never fired. `objects get` with no --output
  // pipes its download here, and hung rather than failing.
  it('emits finish after end(), so pipeline() can complete', async () => {
    const finished = new Promise<void>((resolve) => {
      processShim.stdout.on('finish', () => resolve());
    });

    beginCapture();
    processShim.stdout.end();
    endCapture();

    await expect(
      Promise.race([
        finished.then(() => 'finished'),
        new Promise((r) => setTimeout(() => r('never fired'), 500)),
      ])
    ).resolves.toBe('finished');
  });

  it('writes a trailing chunk passed to end()', () => {
    beginCapture();
    processShim.stdout.end('last');
    expect(endCapture().stdout).toBe('last');
  });

  it('decodes bytes, since a download arrives as Uint8Array', () => {
    beginCapture();
    processShim.stdout.write(new TextEncoder().encode('binary'));
    expect(endCapture().stdout).toBe('binary');
  });

  it('stops calling a removed listener', () => {
    let calls = 0;
    const listener = () => {
      calls++;
    };

    processShim.stdout.on('finish', listener);
    processShim.stdout.removeListener('finish', listener);
    processShim.stdout.emit('finish');

    expect(calls).toBe(0);
  });

  it('keeps stderr separate', () => {
    beginCapture();
    processShim.stderr.write('to stderr');
    const { stdout, stderr } = endCapture();

    expect(stdout).toBe('');
    expect(stderr).toBe('to stderr');
  });
});
