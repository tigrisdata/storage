import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStorageConfig } from '@auth/provider.js';
import { put } from '@tigrisdata/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { createProgram } from '../src/cli-core.js';
import putObject from '../src/lib/objects/put.js';
import type { Specs } from '../src/types.js';
import { setSpecs } from '../src/utils/specs.js';

vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({
    endpoint: 'https://offline.invalid',
  })),
}));
vi.mock('@tigrisdata/storage', () => ({ put: vi.fn() }));
vi.mock('@utils/analytics.js', () => ({ trackCommand: vi.fn() }));
vi.mock('@utils/telemetry.js', () => ({
  captureError: vi.fn(),
  flushTelemetry: vi.fn(),
  initTelemetry: vi.fn(),
}));
vi.mock('@utils/exit.js', () => ({
  failWithError: (_context: unknown, error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
  printNextActions: vi.fn(),
  exitWithError: vi.fn(),
}));

const specs = parse(
  readFileSync(new URL('../src/specs.yaml', import.meta.url), 'utf8'),
  { schema: 'core' }
) as Specs;
let dir: string;
let file: string;
beforeEach(() => {
  setSpecs(specs);
  dir = mkdtempSync(join(tmpdir(), 'tigris-conditional-unit-'));
  file = join(dir, 'payload.txt');
  writeFileSync(file, 'ours');
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
  rmSync(dir, { recursive: true, force: true });
});

async function dispatch(args: string[]) {
  const program = createProgram({
    specs,
    version: 'offline-test',
    hasImplementation: (parts) => parts.join('/') === 'objects/put',
    loadModule: async (parts) => {
      expect(parts).toEqual(['objects', 'put']);
      return { module: { default: putObject }, error: null };
    },
  });
  await program.parseAsync(args, { from: 'user' });
}

describe('native specs and Commander conditional-create dispatch', () => {
  it.each([
    ['objects', 'put', 'bucket', 'key'],
    ['objects', 'put', 'bucket/key'],
  ])(
    'passes boolean ifAbsent and bounded file bytes through %s',
    async (...prefix) => {
      await dispatch([...prefix, file, '--if-absent']);
      expect(getStorageConfig).toHaveBeenCalledExactlyOnceWith({
        withCredentialProvider: true,
      });
      expect(put).toHaveBeenCalledOnce();
      const [key, body, options] = vi.mocked(put).mock.calls[0];
      expect(key).toBe('key');
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body.toString()).toBe('ours');
      expect(options).toMatchObject({
        ifAbsent: true,
        access: 'private',
        multipart: false,
        config: { bucket: 'bucket' },
      });
      expect(options?.partSize).toBeUndefined();
    }
  );
  it('preserves omitted-flag streaming behavior', async () => {
    await dispatch(['objects', 'put', 'bucket', 'key', file]);
    const [, body, options] = vi.mocked(put).mock.calls[0];
    expect(options?.ifAbsent).toBe(false);
    expect(Buffer.isBuffer(body)).toBe(false);
    await (body as ReadableStream).cancel();
  });
  it('accepts an exact 5 MiB regular file', async () => {
    writeFileSync(file, Buffer.alloc(5 * 1024 * 1024));
    await dispatch(['objects', 'put', 'bucket', 'key', file, '--if-absent']);
    expect((vi.mocked(put).mock.calls[0][1] as Buffer).length).toBe(
      5 * 1024 * 1024
    );
    expect(vi.mocked(put).mock.calls[0][2]?.partSize).toBeUndefined();
  });
  it.each(['oversize', 'directory', 'missing', 'fifo', 'stdin'])(
    'rejects %s before auth or SDK access',
    async (kind) => {
      let input: string | undefined = file;
      if (kind === 'oversize')
        writeFileSync(file, Buffer.alloc(5 * 1024 * 1024 + 1));
      if (kind === 'directory') {
        input = join(dir, 'directory');
        mkdirSync(input);
      }
      if (kind === 'missing') input = join(dir, 'missing');
      if (kind === 'fifo') {
        input = join(dir, 'fifo');
        execFileSync('/usr/bin/mkfifo', [input]);
      }
      if (kind === 'stdin') input = undefined;
      await expect(
        dispatch([
          'objects',
          'put',
          'bucket',
          'key',
          ...(input ? [input] : []),
          '--if-absent',
        ])
      ).rejects.toThrow();
      expect(getStorageConfig).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
    }
  );
  it('surfaces a conflict without retrying the SDK boundary', async () => {
    vi.mocked(put).mockResolvedValue({
      error: new Error('PreconditionFailed'),
    });
    await expect(
      dispatch(['objects', 'put', 'bucket', 'key', file, '--if-absent'])
    ).rejects.toThrow('PreconditionFailed');
    expect(put).toHaveBeenCalledOnce();
  });
});
