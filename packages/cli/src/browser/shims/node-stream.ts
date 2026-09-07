/**
 * `node:stream` — `stream-browserify`, plus `Readable.toWeb`.
 *
 * `toWeb`/`fromWeb` landed in Node 17; `stream-browserify` is built on
 * readable-stream and predates both. `objects put` needs `toWeb` to turn a file
 * read stream into the web `ReadableStream` the storage SDK wants; `objects get`
 * and `cp` need `fromWeb` to drain a download back into the filesystem. They are
 * the only pieces missing between the library and what the CLI calls.
 */

import * as nodeStream from 'stream-browserify';

type NodeReadable = {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
};

function toWeb(stream: NodeReadable): ReadableStream<Uint8Array> {
  const iterator = stream[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();

      if (done) {
        controller.close();
        return;
      }

      controller.enqueue(
        value instanceof Uint8Array
          ? value
          : new TextEncoder().encode(String(value))
      );
    },

    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}

/**
 * Web `ReadableStream` -> Node readable.
 *
 * Built on `PassThrough` rather than `Readable.from`: stream-browserify ships
 * `from` but throws "Readable.from is not available in the browser" from it,
 * so the bytes are pumped across by hand.
 */
function fromWeb(stream: ReadableStream<Uint8Array>): unknown {
  const out = new nodeStream.PassThrough();

  void (async () => {
    const reader = stream.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value === undefined) continue;

        // Respect backpressure: a large download would otherwise be pulled
        // into memory as fast as the network delivers it, regardless of how
        // fast the consumer drains it.
        if (!out.write(value)) {
          await new Promise<void>((resolve) => out.once('drain', resolve));
        }
      }
      out.end();
    } catch (error) {
      out.destroy(error as Error);
    } finally {
      reader.releaseLock();
    }
  })();

  return out;
}

// Augment in place so `Readable` keeps its identity — instanceof checks
// elsewhere in the SDK still hold.
const Readable = nodeStream.Readable as typeof nodeStream.Readable & {
  toWeb?: typeof toWeb;
  fromWeb?: typeof fromWeb;
};

if (typeof Readable.toWeb !== 'function') {
  Readable.toWeb = toWeb;
}

if (typeof Readable.fromWeb !== 'function') {
  Readable.fromWeb = fromWeb;
}

export const { Writable, Duplex, Transform, PassThrough, finished, pipeline } =
  nodeStream;
export { Readable };
export default nodeStream;
