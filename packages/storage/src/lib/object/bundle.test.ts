import { describe, expect, it, vi, afterEach } from 'vitest';
import { bundle } from './bundle';

describe('bundle', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns error when bucket is not configured', async () => {
    const result = await bundle(['key1'], {
      config: {
        bucket: '',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for empty keys', async () => {
    const result = await bundle([], {
      config: {
        bucket: 'my-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('At least one key is required');
  });

  it('returns error for undefined keys', async () => {
    const result = await bundle(undefined as unknown as string[], {
      config: {
        bucket: 'my-bucket',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('At least one key is required');
  });

  it('sends correct request with defaults', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return new Response(new ReadableStream(), {
        status: 200,
        headers: { 'content-type': 'application/x-tar' },
      });
    }) as typeof fetch;

    const result = await bundle(['a.jpg', 'b.jpg'], {
      config: {
        bucket: 'my-bucket',
        endpoint: 'https://test.endpoint.dev',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();

    // Verify URL.
    expect(capturedUrl).toContain('/my-bucket');
    expect(capturedUrl).toContain('bundle=');

    // Verify method.
    expect(capturedInit?.method).toBe('POST');

    // Verify body contains keys.
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.keys).toEqual(['a.jpg', 'b.jpg']);

    // Verify headers.
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['X-Tigris-Bundle-Format']).toBe('tar');
    expect(headers['X-Tigris-Bundle-Compression']).toBe('none');
    expect(headers['X-Tigris-Bundle-On-Error']).toBe('skip');
    expect(headers['Content-Type']).toBe('application/json');

    // SigV4 should have added Authorization header.
    expect(headers['authorization']).toBeDefined();

    expect(result.data?.contentType).toBe('application/x-tar');
  });

  it('returns a ReadableStream body', async () => {
    const stream = new ReadableStream();

    globalThis.fetch = vi.fn(async () => {
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'application/x-tar' },
      });
    }) as typeof fetch;

    const result = await bundle(['a.jpg'], {
      config: {
        bucket: 'my-bucket',
        endpoint: 'https://test.endpoint.dev',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.body).toBeInstanceOf(ReadableStream);
    expect(result.data?.body.getReader).toBeDefined();
  });

  it('sends custom compression and error mode', async () => {
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(new ReadableStream(), {
        status: 200,
        headers: { 'content-type': 'application/gzip' },
      });
    }) as typeof fetch;

    const result = await bundle(['x.txt'], {
      compression: 'gzip',
      onError: 'fail',
      config: {
        bucket: 'my-bucket',
        endpoint: 'https://test.endpoint.dev',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    expect(result.error).toBeUndefined();

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['X-Tigris-Bundle-Compression']).toBe('gzip');
    expect(headers['X-Tigris-Bundle-On-Error']).toBe('fail');
    expect(result.data?.contentType).toBe('application/gzip');
  });

  it('returns error on HTTP failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ Message: 'Invalid request' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await bundle(['a.jpg'], {
      config: {
        bucket: 'my-bucket',
        endpoint: 'https://test.endpoint.dev',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
      },
    });

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('uses session token auth when provided', async () => {
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(new ReadableStream(), {
        status: 200,
        headers: { 'content-type': 'application/x-tar' },
      });
    }) as typeof fetch;

    await bundle(['a.jpg'], {
      config: {
        bucket: 'my-bucket',
        endpoint: 'https://test.endpoint.dev',
        sessionToken: 'my-session-token',
        organizationId: 'my-org',
      },
    });

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers['x-amz-security-token']).toBe('my-session-token');
    expect(headers['X-Tigris-Namespace']).toBe('my-org');
    // Should NOT have SigV4 Authorization.
    expect(headers['authorization']).toBeUndefined();
  });
});
