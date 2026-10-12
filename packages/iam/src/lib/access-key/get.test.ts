import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient } from '../http-client';
import { getAccessKey } from './get';
import { listAccessKeys } from './list';

const request = vi.fn();
const config = { accessKeyId: 'k', secretAccessKey: 's' };

function key(extra: Record<string, unknown> = {}) {
  return {
    access_key_id: 'tid_a',
    created_at: '2026-10-12T00:00:00Z',
    creator: 'c',
    human_creator: 'h',
    namespace_id: 'org-a',
    status: 'active',
    username: 'my-key',
    buckets_role: [{ bucket: 'a', role: 'Editor' }],
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

describe('access key scope in get and list', () => {
  it('maps the numeric scope to its name', async () => {
    request.mockResolvedValueOnce({
      data: {
        IsTruncated: false,
        Marker: '',
        Keys: [key({ access_key_scope: 1 })],
      },
    });
    const got = await getAccessKey('tid_a', { config });
    expect(got.data).toMatchObject({
      id: 'tid_a',
      name: 'my-key',
      roles: [{ bucket: 'a', role: 'Editor' }],
      scope: 'no_default_allow',
    });

    request.mockResolvedValueOnce({
      data: {
        IsTruncated: false,
        Marker: '',
        Keys: [key({ access_key_scope: 0 }), key({ access_key_scope: 1 })],
      },
    });
    const listed = await listAccessKeys({ config });
    expect(listed.data?.accessKeys.map((k) => k.scope)).toEqual([
      'standard',
      'no_default_allow',
    ]);
  });

  it('treats a missing scope as standard, the value the gateway leaves out', async () => {
    request.mockResolvedValueOnce({
      data: { IsTruncated: false, Marker: '', Keys: [key()] },
    });
    const got = await getAccessKey('tid_a', { config });
    expect(got.data?.scope).toBe('standard');
  });

  it('leaves a scope it does not know undefined', async () => {
    request.mockResolvedValueOnce({
      data: {
        IsTruncated: false,
        Marker: '',
        Keys: [key({ access_key_scope: 7 })],
      },
    });
    const got = await getAccessKey('tid_a', { config });
    expect(got.data?.scope).toBeUndefined();
  });
});
