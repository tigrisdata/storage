/**
 * `node:stream/promises` — the promise form of `pipeline`.
 *
 * `stream-browserify` only ships the callback form, so this wraps it. Used by
 * `objects get` and `cp` to drain a download into the virtual filesystem or
 * onto stdout.
 */

import { pipeline as callbackPipeline } from 'stream-browserify';

import { process } from './process-global.js';

interface PipeSource extends AsyncIterable<string | Uint8Array> {
  pipe<Destination>(destination: Destination): Destination;
}

interface Sink {
  write(chunk: string | Uint8Array): boolean;
}

export async function pipeline(...streams: unknown[]): Promise<void> {
  const destination = streams[streams.length - 1];

  // readable-stream's `pipe()` deliberately never calls `end()` on
  // `process.stdout` or `process.stderr` — in Node those outlive any one
  // pipe. Here that meant a pipeline into the captured stdout waited forever
  // for a 'finish' that could not come, and `objects get` of any non-text
  // object hung. Drain the source ourselves and finish when it does.
  if (destination === process.stdout || destination === process.stderr) {
    let source = streams[0] as PipeSource;
    for (const transform of streams.slice(1, -1)) {
      source = source.pipe(transform as PipeSource);
    }
    for await (const chunk of source) {
      (destination as Sink).write(chunk);
    }
    return;
  }

  return new Promise((resolve, reject) => {
    (callbackPipeline as (...args: unknown[]) => unknown)(
      ...streams,
      (error: Error | null) => (error ? reject(error) : resolve())
    );
  });
}

export default { pipeline };
