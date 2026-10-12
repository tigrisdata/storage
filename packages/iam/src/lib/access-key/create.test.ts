import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient, IAM_ENDPOINTS } from '../http-client';
import { createAccessKey } from './create';
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
    data: {
      CreateAccessKeyResult: {
        AccessKey: {
          AccessKeyId: 'tid_new',
          SecretAccessKey: 'tsec_new',
          UserName: 'my-key',
          CreateDate: '2026-10-12T00:00:00Z',
        },
      },
    },
  });
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

describe('createAccessKey', () => {
  it('posts CreateAccessKeyWithBucketsRole with the roles', async () => {
    const result = await createAccessKey('my-key', {
      config,
      bucketsRole: [{ bucket: 'a', role: 'Editor' }],
    });

    const [{ method, path }] = request.mock.calls[0] as [
      { method: string; path: string },
    ];
    expect(method).toBe('POST');
    expect(path).toBe(IAM_ENDPOINTS.createAccessKey);
    expect(sentBody()).toMatchObject({
      name: 'my-key',
      buckets_role: [{ bucket: 'a', role: 'Editor' }],
    });
    expect(result.data).toMatchObject({
      id: 'tid_new',
      secret: 'tsec_new',
      name: 'my-key',
      roles: [{ bucket: 'a', role: 'Editor' }],
    });
  });

  it('leaves the scope to the gateway default unless asked', async () => {
    const result = await createAccessKey('my-key', { config });
    expect(sentBody()).not.toHaveProperty('access_key_scope');
    expect(result.data?.scope).toBe('standard');
  });

  it('sends the numeric scope when one is given', async () => {
    const result = await createAccessKey('my-key', {
      config,
      scope: 'no_default_allow',
    });
    expect(sentBody()).toMatchObject({ access_key_scope: 1 });
    expect(result.data?.scope).toBe('no_default_allow');

    request.mockClear();
    await createAccessKey('my-key', { config, scope: 'standard' });
    expect(sentBody()).toMatchObject({ access_key_scope: 0 });
  });

  it('rejects an unknown scope before any request', async () => {
    const result = await createAccessKey('my-key', {
      config,
      scope: 'no_default_allowed' as AccessKeyScope,
    });
    expect(result.error?.message).toBe(
      'Invalid scope "no_default_allowed". Valid scopes are: standard, no_default_allow'
    );
    expect(request).not.toHaveBeenCalled();
  });

  it("returns the gateway's error", async () => {
    request.mockResolvedValueOnce({ error: new Error('LimitExceeded') });
    const result = await createAccessKey('my-key', { config });
    expect(result.error?.message).toBe('LimitExceeded');
  });
});
