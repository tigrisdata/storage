/// <reference path="../src/browser/shims/stream-browserify.d.ts" />

import { readFile } from 'node:fs/promises';
import { getStorageConfig } from '@auth/provider.js';
import { put } from '@tigrisdata/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import * as shim from '../src/browser/shims/node-fs.js';
import { fs, resetVolume } from '../src/browser/volume.js';
import putObject from '../src/lib/objects/put.js';
import type { Specs } from '../src/types.js';
import { setSpecs } from '../src/utils/specs.js';

// Exercise the production handler against the browser's actual memfs and
// stream substitutions. Auth and SDK are inert boundaries, not real login.
vi.mock('node:fs', () => import('../src/browser/shims/node-fs.js'));
vi.mock('node:stream', () => import('../src/browser/shims/node-stream.js'));
vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({
    endpoint: 'https://offline.invalid',
  })),
}));
vi.mock('@tigrisdata/storage', () => ({ put: vi.fn() }));
vi.mock('@utils/exit.js', () => ({
  failWithError: (_context: unknown, error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
  printNextActions: vi.fn(),
}));

const specs = parse(
  await readFile(new URL('../src/specs.yaml', import.meta.url), 'utf8'),
  { schema: 'core' }
) as Specs;
const file = '/tmp/payload.txt';
const limit = 5 * 1024 * 1024;
const options = { bucket: 'bucket', key: 'key', file, ifAbsent: true };

beforeEach(() => {
  resetVolume();
  setSpecs(specs);
  fs.writeFileSync(file, 'ours');
  vi.mocked(put).mockResolvedValue({
    data: {
      path: 'key',
      size: 4,
      contentType: 'text/plain',
      cacheControl: undefined,
      contentDisposition: undefined,
      etag: 'test',
      metadata: undefined,
      modified: new Date(0),
      url: 'https://offline.invalid/key',
    },
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  resetVolume();
});

function expectClosed(close: ReturnType<typeof vi.spyOn>) {
  expect(close).toHaveBeenCalledOnce();
  const fd = close.mock.calls[0][0] as number;
  expect(() => fs.fstatSync(fd)).toThrow();
}

describe('browser conditional-create filesystem compatibility', () => {
  it('exports the actual memfs descriptor API and flags', () => {
    expect(shim).toHaveProperty('constants', fs.constants);
    expect(shim).toHaveProperty('fstatSync', fs.fstatSync);
  });
  it.each([0, 4, limit])(
    'uploads %i bounded bytes and closes the descriptor',
    async (size) => {
      fs.writeFileSync(file, Buffer.alloc(size, 97));
      const close = vi.spyOn(shim, 'closeSync');
      await putObject(options);
      expectClosed(close);
      expect(getStorageConfig).toHaveBeenCalledExactlyOnceWith({
        withCredentialProvider: true,
      });
      expect(put).toHaveBeenCalledOnce();
      const [key, body, config] = vi.mocked(put).mock.calls[0];
      expect(key).toBe('key');
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body).toEqual(Buffer.alloc(size, 97));
      expect(config).toMatchObject({
        ifAbsent: true,
        multipart: false,
        access: 'private',
      });
      expect(config?.partSize).toBeUndefined();
    }
  );
  it.each(['oversize', 'directory', 'missing', 'stdin'])(
    'rejects %s before auth or SDK',
    async (kind) => {
      if (kind === 'oversize') fs.writeFileSync(file, Buffer.alloc(limit + 1));
      if (kind === 'directory') {
        fs.unlinkSync(file);
        fs.mkdirSync(file);
      }
      if (kind === 'missing') fs.unlinkSync(file);
      const close = vi.spyOn(shim, 'closeSync');
      await expect(
        putObject({ ...options, file: kind === 'stdin' ? undefined : file })
      ).rejects.toThrow();
      expect(getStorageConfig).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      if (kind === 'oversize' || kind === 'directory') expectClosed(close);
      else expect(close).not.toHaveBeenCalled();
    }
  );
  it('closes the descriptor on read failure without auth', async () => {
    vi.spyOn(shim, 'readSync').mockImplementation(() => {
      throw new Error('read failure');
    });
    const close = vi.spyOn(shim, 'closeSync');
    await expect(putObject(options)).rejects.toThrow('read failure');
    expectClosed(close);
    expect(getStorageConfig).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('bounds reads when the memfs file grows after fstat', async () => {
    const stat = fs.fstatSync;
    vi.spyOn(shim, 'fstatSync').mockImplementation(((fd: number) => {
      const result = stat(fd);
      fs.writeFileSync(file, Buffer.alloc(limit + 1));
      return result;
    }) as typeof stat);
    const close = vi.spyOn(shim, 'closeSync');
    await expect(putObject(options)).rejects.toThrow('up to 5 MiB');
    expectClosed(close);
    expect(getStorageConfig).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('surfaces conflict without an unconditional retry', async () => {
    vi.mocked(put).mockResolvedValue({
      error: new Error('PreconditionFailed'),
    });
    const close = vi.spyOn(shim, 'closeSync');
    await expect(putObject(options)).rejects.toThrow('PreconditionFailed');
    expectClosed(close);
    expect(put).toHaveBeenCalledOnce();
    expect(vi.mocked(put).mock.calls[0][2]?.ifAbsent).toBe(true);
  });
  it.each([undefined, false])(
    'retains ordinary streaming with flag %s',
    async (ifAbsent) => {
      await putObject({ ...options, ifAbsent });
      const [, body, config] = vi.mocked(put).mock.calls[0];
      expect(Buffer.isBuffer(body)).toBe(false);
      expect(config?.ifAbsent).toBe(false);
      const reader = (body as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      expect(Buffer.concat(chunks).toString()).toBe('ours');
    }
  );
});
