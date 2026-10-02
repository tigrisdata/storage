import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../http-client')>()),
  createIAMClient: vi.fn(),
}));

import { createIAMClient } from '../http-client';
import { removeAccessKey } from './remove';

const request = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({ data: {} });
  vi.mocked(createIAMClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createIAMClient>);
});

describe('removeAccessKey', () => {
  it('posts DeleteAccessKey for the key', async () => {
    const result = await removeAccessKey('tid_a', {
      config: { accessKeyId: 'k', secretAccessKey: 's' },
    });

    expect(result).toEqual({ data: undefined });
    const [{ method, body }] = request.mock.calls[0] as [
      { method: string; body: URLSearchParams },
    ];
    expect(method).toBe('POST');
    expect(body.get('Action')).toBe('DeleteAccessKey');
    expect(body.get('AccessKeyId')).toBe('tid_a');
  });

  it("returns the gateway's error", async () => {
    request.mockResolvedValueOnce({ error: new Error('NoSuchEntity') });
    const result = await removeAccessKey('tid_a');
    expect(result.error?.message).toBe('NoSuchEntity');
  });

  it('returns a transport failure as { error } instead of throwing', async () => {
    request.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await removeAccessKey('tid_a');
    expect(result.error?.message).toBe('fetch failed');
  });
});
