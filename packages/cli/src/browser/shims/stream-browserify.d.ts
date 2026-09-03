/**
 * `stream-browserify` ships no types and has no `@types/` package.
 * Only the surface this build touches is declared.
 */
declare module 'stream-browserify' {
  export class Readable {
    static from(iterable: AsyncIterable<unknown>): Readable;
    static toWeb?: (stream: {
      [Symbol.asyncIterator](): AsyncIterator<unknown>;
    }) => ReadableStream<Uint8Array>;
    static fromWeb?: (stream: ReadableStream<Uint8Array>) => unknown;
    [Symbol.asyncIterator](): AsyncIterator<unknown>;
  }
  export class Writable {}
  export class PassThrough {
    write(chunk: unknown): boolean;
    end(): void;
    destroy(error?: Error): void;
    once(event: string, listener: () => void): this;
  }
  export class Duplex {}
  export class Transform {}
  export function finished(...args: unknown[]): unknown;
  export function pipeline(...args: unknown[]): unknown;
}
