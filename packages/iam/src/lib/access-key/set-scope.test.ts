import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { setAccessKeyScope } from './set-scope';
import type { AccessKeyScope } from './types';

const request = vi.fn();
const config = { accessKeyId: 'k', secretAccessKey: 's' };

function sentBody() {
  const [{ body }] = request.mock.calls[0] as [{ body: URLSearchParams }];
  return JSON.parse(body.get('Req') ?? '{}');
}

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({
    data: { status: 'success', operation: 'update', message: '' },
  });
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

describe('setAccessKeyScope', () => {
  it('sends the numeric scope and nothing about roles', async () => {
    const result = await setAccessKeyScope('tid_a', 'no_default_allow', {
      config,
    });

    expect(result).toEqual({ data: undefined });
    expect(createIAMClient).toHaveBeenCalledWith(config);
    const [{ method, path }] = request.mock.calls[0] as [
      { method: string; path: string },
    ];
    expect(method).toBe('POST');
    expect(path).toBe(IAM_ENDPOINTS.assignAccessKeys);
    // No buckets_role key at all: the gateway keeps the existing roles.
    expect(sentBody()).toEqual({ id: 'tid_a', access_key_scope: 1 });
  });

  it('encodes standard as 0', async () => {
    await setAccessKeyScope('tid_a', 'standard', { config });
    expect(sentBody()).toEqual({ id: 'tid_a', access_key_scope: 0 });
  });

  it('rejects an unknown scope before any request', async () => {
    const result = await setAccessKeyScope('tid_a', 'admin' as AccessKeyScope, {
      config,
    });
    expect(result.error?.message).toBe(
      'Invalid scope "admin". Valid scopes are: standard, no_default_allow'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('requires an id', async () => {
    const result = await setAccessKeyScope('', 'standard', { config });
    expect(result.error?.message).toBe('Access key ID is required');
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the gateway's failure message", async () => {
    request.mockResolvedValueOnce({
      data: { status: 'error', operation: 'update', message: 'key not found' },
    });
    const result = await setAccessKeyScope('tid_a', 'standard', { config });
    expect(result.error?.message).toBe('key not found');
  });

  it('returns a transport failure as { error } instead of throwing', async () => {
    request.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await setAccessKeyScope('tid_a', 'standard', { config });
    expect(result.error?.message).toBe('fetch failed');
  });
});
