import { describe, expect, it } from 'vitest';

import { Readable } from '../../src/browser/shims/node-stream';

function webStreamOf(
  chunkSize: number,
  chunks: number
): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(chunkSize).fill(sent % 256));
      sent++;
    },
  });
}

function collect(readable: unknown): Promise<number> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const r = readable as {
      on(event: string, fn: (arg?: unknown) => void): unknown;
    };
    r.on('data', (chunk) => {
      total += (chunk as Uint8Array).length;
    });
    r.on('end', () => resolve(total));
    r.on('error', reject);
  });
}

describe('Readable.fromWeb', () => {
  it('delivers a stream smaller than the buffer', async () => {
    const readable = Readable.fromWeb?.(webStreamOf(1024, 4));
    expect(await collect(readable)).toBe(4096);
  });

  it('delivers a stream far larger than the highWaterMark without stalling', async () => {
    // Regression: honouring backpressure meant awaiting 'drain' once the
    // 16 KB PassThrough buffer filled — and a 4.8 MB `objects get` hung
    // forever, because that event never arrived.
    const readable = Readable.fromWeb?.(webStreamOf(64 * 1024, 80)); // 5 MB

    const result = await Promise.race([
      collect(readable),
      new Promise<string>((r) => setTimeout(() => r('STALLED'), 4000)),
    ]);

    expect(result).toBe(80 * 64 * 1024);
  });
});

describe('pipeline into process.stdout', () => {
  it('drains a large download instead of stalling', async () => {
    // The exact shape of `objects get` with no --output. readable-stream's
    // pipe() never ends a destination that *is* process.stdout, so the shim
    // must not wait on 'finish'. Note: under vitest `process` is real Node,
    // so this exercises the shim's own stdout path but cannot reproduce the
    // bundle-level hang on its own — that needs the built bundle.
    const { pipeline } = await import(
      '../../src/browser/shims/node-stream-promises'
    );
    const { process: shim } = await import(
      '../../src/browser/shims/process-global'
    );
    const { beginCapture, endCapture } = await import(
      '../../src/browser/output'
    );

    beginCapture();
    const result = await Promise.race([
      pipeline(
        Readable.fromWeb?.(webStreamOf(64 * 1024, 80)),
        shim.stdout
      ).then(() => 'finished'),
      new Promise<string>((r) => setTimeout(() => r('STALLED'), 4000)),
    ]);
    const captured = endCapture();

    expect(result).toBe('finished');
    expect(captured.stdoutKind).toBe('bytes');
    expect(captured.stdout.length).toBe(80 * 64 * 1024);
  });
});
