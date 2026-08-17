import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TigrisStorage } from './tigris-storage';

const mockGet = vi.fn();
const mockPut = vi.fn();
const mockHandleClientUpload = vi.fn();

// Named params (not `...args`) so `.length` mirrors the real bare
// functions' arity — bindOperations slices positional args from the
// trailing options object by declared arity, so a rest-param mock
// here would silently break that slicing.
vi.mock('./operations', () => ({
  get: (path: unknown, format: unknown, opts?: unknown) =>
    mockGet(path, format, opts),
  put: (path: unknown, body: unknown, opts?: unknown) =>
    mockPut(path, body, opts),
  handleClientUpload: (request: unknown, config?: unknown) =>
    mockHandleClientUpload(request, config),
  // Non-function export — must not become an instance method.
  BucketTypes: { Regular: 0, Snapshot: 1 },
}));

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ data: 'ok' });
  mockPut.mockReset().mockResolvedValue({ data: { etag: 'e' } });
  mockHandleClientUpload.mockReset().mockResolvedValue({ data: {} });
});

describe('TigrisStorage', () => {
  it('attaches every function export as an instance method', () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    expect(typeof storage.get).toBe('function');
    expect(typeof storage.put).toBe('function');
    expect(typeof storage.handleClientUpload).toBe('function');
  });

  it('does not attach non-function exports', () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    expect(
      (storage as unknown as Record<string, unknown>).BucketTypes
    ).toBeUndefined();
  });

  it('builds config from static credentials and the construct-time bucket', async () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
      bucket: 'my-bucket',
    });

    await storage.get('key', 'string');

    expect(mockGet).toHaveBeenCalledWith('key', 'string', {
      config: expect.objectContaining({
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
        bucket: 'my-bucket',
      }),
    });
  });

  it('overrides the construct-time bucket with a per-call bucket', async () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
      bucket: 'my-bucket',
    });

    await storage.get('key', 'string', { bucket: 'other-bucket' });

    expect(mockGet).toHaveBeenCalledWith('key', 'string', {
      config: expect.objectContaining({ bucket: 'other-bucket' }),
    });
  });

  it('passes a bare config (not wrapped) to handleClientUpload', async () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
      bucket: 'my-bucket',
    });

    await storage.handleClientUpload({ action: 'init' as never, name: 'x' });

    expect(mockHandleClientUpload).toHaveBeenCalledWith(
      { action: 'init', name: 'x' },
      expect.objectContaining({ bucket: 'my-bucket' })
    );
  });

  it('resolves a resolver-function auth into sessionToken/organizationId fields', async () => {
    const resolver = vi.fn().mockResolvedValue({
      sessionToken: 'tok',
      organizationId: 'org_1',
    });
    const storage = new TigrisStorage({ auth: resolver, bucket: 'b' });

    await storage.put('key', 'body');
    await storage.put('key', 'body');

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(mockPut).toHaveBeenCalledWith(
      'key',
      'body',
      expect.objectContaining({
        config: expect.objectContaining({
          sessionToken: 'tok',
          organizationId: 'org_1',
        }),
      })
    );
  });

  it('surfaces an auth resolver failure as { error } instead of calling the underlying function', async () => {
    const resolver = vi
      .fn()
      .mockRejectedValue(new Error('token endpoint down'));
    const storage = new TigrisStorage({ auth: resolver });

    const result = await storage.put('key', 'body');

    expect(result).toEqual({ error: new Error('token endpoint down') });
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('throws synchronously on a malformed auth option', () => {
    expect(
      () =>
        new TigrisStorage({
          auth: { accessKeyId: 'ak' } as never,
        })
    ).toThrow(/requires both fields/);
  });
});
