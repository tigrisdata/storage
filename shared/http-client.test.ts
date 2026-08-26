import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTigrisHttpHooks } from './hooks';
import { createTigrisHttpClient, type TigrisHttpClient } from './http-client';

let fetchMock: ReturnType<typeof vi.fn>;
let uniqueSuffix = 0;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setTigrisHttpHooks(undefined);
});

/**
 * Clients are cached module-wide by endpoint and credentials, so each test
 * takes a fresh endpoint to avoid inheriting another test's client.
 */
function makeClient(
  overrides: Partial<Parameters<typeof createTigrisHttpClient>[0]> = {}
): TigrisHttpClient {
  const { data, error } = createTigrisHttpClient({
    baseUrl: `https://t${uniqueSuffix++}.example.com`,
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    ...overrides,
  });

  if (error || !data) {
    throw error ?? new Error('client was not created');
  }

  return data;
}

function json(
  status: number,
  body: unknown,
  init: { statusText?: string; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: init.statusText ?? '',
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

function headerOf(call: unknown[], name: string): string | undefined {
  const headers = (call[1] as { headers: Record<string, string> }).headers;
  const match = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  );
  return match ? headers[match] : undefined;
}

describe('retry', () => {
  it('is off by default — a 500 returns after a single attempt', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.error?.message).toBe('boom');
  });

  it('retries up to the attempt ceiling when enabled', async () => {
    fetchMock.mockImplementation(() => json(503, { Message: 'unavailable' }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    const response = await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(response.error?.message).toBe('unavailable');
  });

  it('stops retrying as soon as an attempt succeeds', async () => {
    fetchMock
      .mockImplementationOnce(() => json(503, { Message: 'unavailable' }))
      .mockImplementationOnce(() => json(200, { ok: true }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    const response = await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.data).toEqual({ ok: true });
  });

  it('does not retry 403, which is how SignatureDoesNotMatch surfaces', async () => {
    fetchMock.mockImplementation(() =>
      json(403, { Message: 'SignatureDoesNotMatch' })
    );

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    const response = await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.error?.message).toBe('SignatureDoesNotMatch');
  });

  it('does not retry 400', async () => {
    fetchMock.mockImplementation(() => json(400, { Message: 'bad request' }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets a per-request false override a retrying client', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x', retry: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets a per-request policy override a non-retrying client', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));

    await makeClient().request({
      method: 'GET',
      path: '/x',
      retry: { attempts: 2, baseDelayMs: 0 },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors a custom shouldRetry predicate', async () => {
    fetchMock.mockImplementation(() => json(403, { Message: 'expired' }));

    const client = makeClient({
      retry: {
        attempts: 2,
        baseDelayMs: 0,
        shouldRetry: (ctx) => ctx.status === 403,
      },
    });
    await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives shouldRetry the same origin/path pair the hooks get', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const seen: Array<{ origin: string; path: string }> = [];

    const client = makeClient({
      retry: {
        attempts: 2,
        baseDelayMs: 0,
        shouldRetry: (ctx) => {
          seen.push({ origin: ctx.origin, path: ctx.path });
          return true;
        },
      },
    });
    await client.request({ method: 'GET', path: '/bucket' });

    expect(seen).toHaveLength(1);
    expect(`${seen[0].origin}${seen[0].path}`).toBe(fetchMock.mock.calls[0][0]);
  });

  it('re-signs every attempt so x-amz-date stays inside its window', async () => {
    fetchMock.mockImplementation(() => json(503, { Message: 'unavailable' }));

    const client = makeClient({ retry: { attempts: 2, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(headerOf(call, 'authorization')).toBeTruthy();
      expect(headerOf(call, 'x-amz-date')).toBeTruthy();
    }
  });

  it('re-sends identical bytes on retry, preserving server-side dedup keys', async () => {
    fetchMock.mockImplementation(() => json(503, { Message: 'unavailable' }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    await client.request({
      method: 'POST',
      path: '/x',
      body: { req_uuid: 'fixed-uuid', name: 'ci' },
    });

    const bodies = fetchMock.mock.calls.map(
      (call) => (call[1] as { body?: string }).body
    );
    expect(bodies).toHaveLength(3);
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain('fixed-uuid');
  });

  it('waits the Retry-After the server asked for', async () => {
    fetchMock
      .mockImplementationOnce(() =>
        json(429, { Message: 'slow down' }, { headers: { 'retry-after': '1' } })
      )
      .mockImplementationOnce(() => json(200, { ok: true }));

    const client = makeClient({
      retry: { attempts: 2, baseDelayMs: 5, maxDelayMs: 10_000 },
    });

    const started = Date.now();
    await client.request({ method: 'GET', path: '/x' });
    const elapsed = Date.now() - started;

    // 1s from the header, not the 5ms the backoff would have produced.
    expect(elapsed).toBeGreaterThanOrEqual(900);
  });
});

describe('transport failures', () => {
  it('propagates as a throw, preserving the pre-retry contract', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      makeClient().request({ method: 'GET', path: '/x' })
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still throws after exhausting retries', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toThrow(
      'fetch failed'
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries an abort — that is the caller cancelling', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' })
    );

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toThrow(
      'aborted'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries once the caller signal is aborted, whatever the error shape', async () => {
    const controller = new AbortController();
    controller.abort();
    // A runtime whose abort rejection is not an `Error` subclass at all.
    fetchMock.mockRejectedValue({ name: 'AbortError', message: 'aborted' });

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });

    await expect(
      client.request({ method: 'GET', path: '/x', signal: controller.signal })
    ).rejects.toEqual({ name: 'AbortError', message: 'aborted' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rethrows the original error object so callers can match on its fields', async () => {
    const original = Object.assign(new TypeError('fetch failed'), {
      code: 'ECONNRESET',
    });
    fetchMock.mockRejectedValue(original);

    const client = makeClient({ retry: { attempts: 2, baseDelayMs: 0 } });

    await expect(client.request({ method: 'GET', path: '/x' })).rejects.toBe(
      original
    );
  });

  it('forwards an AbortSignal to fetch', async () => {
    fetchMock.mockImplementation(() => json(200, { ok: true }));
    const controller = new AbortController();

    await makeClient().request({
      method: 'GET',
      path: '/x',
      signal: controller.signal,
    });

    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(
      controller.signal
    );
  });

  it('retries a GET transport failure under retry: true', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });

    await expect(
      client.request({ method: 'GET', path: '/x' })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-idempotent transport failure under retry: true', async () => {
    // The write may already have landed on the server, so re-sending could
    // double-apply it. Status-code retries still apply to these methods.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      fetchMock.mockClear();
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });

      await expect(client.request({ method, path: '/x' })).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a POST transport failure when explicitly opted in', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const client = makeClient({
      retry: { attempts: 3, baseDelayMs: 0, retryNetworkErrors: true },
    });

    await expect(
      client.request({ method: 'POST', path: '/x' })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('still retries a POST on a retryable status', async () => {
    fetchMock.mockImplementation(() => json(503, { Message: 'unavailable' }));

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    await client.request({ method: 'POST', path: '/x' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry transport errors when retryNetworkErrors is off', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const client = makeClient({
      retry: { attempts: 3, baseDelayMs: 0, retryNetworkErrors: false },
    });

    await expect(
      client.request({ method: 'GET', path: '/x' })
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('body parsing', () => {
  it('treats an empty JSON body as {} instead of throwing', async () => {
    // `POST ?restore` answers 200 with no payload while still advertising JSON.
    fetchMock.mockImplementation(
      () =>
        new Response('', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );

    const response = await makeClient().request({
      method: 'POST',
      path: '/bucket?restore',
    });

    expect(response.error).toBeUndefined();
    expect(response.data).toEqual({});
  });

  it('returns non-JSON bodies as text', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response('<xml/>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        })
    );

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.data).toBe('<xml/>');
  });

  it('falls back to status text when an error body is not JSON', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response('gateway exploded', {
          status: 502,
          statusText: 'Bad Gateway',
        })
    );

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.error?.message).toBe('Bad Gateway');
  });

  it('never constructs an error with an empty message', async () => {
    fetchMock.mockImplementation(() => new Response('', { status: 500 }));

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.error?.message).toBe('Unknown error');
  });

  it('falls through a JSON body with no usable message', async () => {
    // HTTP/2 has no reason phrase, so `statusText` is empty there — with a
    // JSON error body that carries no `Message`, there is nothing to report
    // but the fallback.
    fetchMock.mockImplementation(
      () =>
        new Response(JSON.stringify({ foo: 1 }), {
          status: 500,
          statusText: '',
          headers: { 'content-type': 'application/json' },
        })
    );

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.error?.message).toBe('Unknown error');
  });

  it('prefers statusText when the JSON body has an empty message', async () => {
    fetchMock.mockImplementation(
      () =>
        new Response(JSON.stringify({ Message: '' }), {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'application/json' },
        })
    );

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.error?.message).toBe('Bad Gateway');
  });
});

describe('hooks', () => {
  it('reports a non-retried failure as http_error', async () => {
    fetchMock.mockImplementation(() =>
      json(404, { Message: 'no such bucket' })
    );
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    await makeClient().request({ method: 'GET', path: '/missing' });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({
      source: 'http_error',
      method: 'GET',
      path: '/missing',
      status: 404,
      attempt: 1,
      message: 'no such bucket',
    });
  });

  it('reports an exhausted retry budget as retries_exhausted', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const onError = vi.fn();
    const onRetry = vi.fn();
    setTigrisHttpHooks({ onError, onRetry });

    const client = makeClient({ retry: { attempts: 3, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({
      source: 'retries_exhausted',
      attempt: 3,
      attempts: 3,
      status: 500,
    });
  });

  it('reports a transport failure as network_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    await expect(
      makeClient().request({ method: 'GET', path: '/x' })
    ).rejects.toThrow();

    expect(onError.mock.calls[0][0]).toMatchObject({
      source: 'network_error',
    });
    // A request that never reached the server has no status to report.
    expect(onError.mock.calls[0][0].status).toBeUndefined();
  });

  it('passes the backoff it is about to wait to onRetry', async () => {
    fetchMock
      .mockImplementationOnce(() => json(503, { Message: 'unavailable' }))
      .mockImplementationOnce(() => json(200, { ok: true }));
    const onRetry = vi.fn();
    setTigrisHttpHooks({ onRetry });

    const client = makeClient({ retry: { attempts: 2, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({ delayMs: 0, attempt: 1 });
  });

  it('stays quiet when a retry recovers the request', async () => {
    fetchMock
      .mockImplementationOnce(() => json(503, { Message: 'unavailable' }))
      .mockImplementationOnce(() => json(200, { ok: true }));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    const client = makeClient({ retry: { attempts: 2, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an origin that recomposes into the URL fetch received', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    await makeClient().request({
      method: 'GET',
      path: '/bucket',
      query: { prefix: 'a/b' },
    });

    const { origin, path } = onError.mock.calls[0][0];
    expect(origin).toMatch(/^https:\/\/t\d+\.example\.com$/);
    // The contract consumers rely on: `${origin}${path}` is the absolute URL.
    expect(`${origin}${path}`).toBe(fetchMock.mock.calls[0][0]);
  });

  it('reports the same origin on the onRetry path', async () => {
    fetchMock
      .mockImplementationOnce(() => json(503, { Message: 'unavailable' }))
      .mockImplementationOnce(() => json(200, { ok: true }));
    const onRetry = vi.fn();
    setTigrisHttpHooks({ onRetry });

    const client = makeClient({ retry: { attempts: 2, baseDelayMs: 0 } });
    await client.request({ method: 'GET', path: '/x' });

    const { origin, path } = onRetry.mock.calls[0][0];
    expect(origin).toBeTruthy();
    expect(`${origin}${path}`).toBe(fetchMock.mock.calls[0][0]);
  });

  it('keeps the port in the origin', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    const client = makeClient({ baseUrl: 'http://localhost:9000' });
    await client.request({ method: 'GET', path: '/bucket' });

    expect(onError.mock.calls[0][0]).toMatchObject({
      origin: 'http://localhost:9000',
      path: '/bucket',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:9000/bucket');
  });

  it('includes the organization id when the client has one', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    const client = makeClient({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      sessionToken: 'token',
      organizationId: 'org_123',
    });
    await client.request({ method: 'GET', path: '/x' });

    expect(onError.mock.calls[0][0]).toMatchObject({
      organizationId: 'org_123',
    });
  });

  it('carries the query string on the reported path', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    const onError = vi.fn();
    setTigrisHttpHooks({ onError });

    await makeClient().request({
      method: 'GET',
      path: '/bucket',
      query: { prefix: 'a/b' },
    });

    expect(onError.mock.calls[0][0].path).toBe('/bucket?prefix=a%2Fb');
  });

  it('does not let a throwing hook fail the request', async () => {
    fetchMock.mockImplementation(() => json(500, { Message: 'boom' }));
    setTigrisHttpHooks({
      onError: () => {
        throw new Error('sentry is down');
      },
    });

    const response = await makeClient().request({ method: 'GET', path: '/x' });

    expect(response.error?.message).toBe('boom');
  });
});

describe('client caching', () => {
  const base = 'https://cache-test.example.com';

  it('reuses a client for identical options', () => {
    const first = createTigrisHttpClient({
      baseUrl: base,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      retry: { attempts: 4 },
    });
    const second = createTigrisHttpClient({
      baseUrl: base,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      retry: { attempts: 4 },
    });

    expect(first.data).toBe(second.data);
  });

  it('does not share a client across different retry policies', () => {
    const relaxed = createTigrisHttpClient({
      baseUrl: base,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      retry: { attempts: 2 },
    });
    const aggressive = createTigrisHttpClient({
      baseUrl: base,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      retry: { attempts: 9 },
    });

    expect(relaxed.data).not.toBe(aggressive.data);
  });

  it('skips the cache when shouldRetry makes the config unkeyable', () => {
    const options = {
      baseUrl: base,
      accessKeyId: 'AKIA',
      secretAccessKey: 'secret',
      retry: { shouldRetry: () => true },
    };

    expect(createTigrisHttpClient(options).data).not.toBe(
      createTigrisHttpClient(options).data
    );
  });
});
