import { describe, expect, it, vi } from 'vitest';
import { createSessionCache } from './session-cache';
import type { TigrisSession } from './types';

function makeSession(overrides?: Partial<TigrisSession>): TigrisSession {
  return {
    sessionToken: 'tok-1',
    organizationId: 'org-1',
    ...overrides,
  };
}

describe('createSessionCache', () => {
  it('resolves once and reuses the cached session for subsequent calls', async () => {
    const resolver = vi.fn().mockResolvedValue(makeSession());
    const getSession = createSessionCache(resolver);

    const first = await getSession();
    const second = await getSession();
    const third = await getSession();

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(first.data).toEqual(makeSession());
    expect(second.data).toEqual(makeSession());
    expect(third.data).toEqual(makeSession());
  });

  it('refreshes proactively when within the 60s buffer before expiration', async () => {
    const expiringSoon = makeSession({
      sessionToken: 'tok-old',
      expiration: new Date(Date.now() + 30_000), // 30s — inside the 60s buffer
    });
    const fresh = makeSession({
      sessionToken: 'tok-new',
      expiration: new Date(Date.now() + 3_600_000),
    });

    const resolver = vi
      .fn()
      .mockResolvedValueOnce(expiringSoon)
      .mockResolvedValueOnce(fresh);
    const getSession = createSessionCache(resolver);

    const first = await getSession();
    expect(first.data?.sessionToken).toBe('tok-old');
    expect(resolver).toHaveBeenCalledTimes(1);

    const second = await getSession();
    expect(second.data?.sessionToken).toBe('tok-new');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when expiration is comfortably in the future', async () => {
    const session = makeSession({
      expiration: new Date(Date.now() + 3_600_000), // 1h out
    });
    const resolver = vi.fn().mockResolvedValue(session);
    const getSession = createSessionCache(resolver);

    await getSession();
    await getSession();
    await getSession();

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('treats sessions without expiration as non-expiring', async () => {
    const resolver = vi.fn().mockResolvedValue(makeSession());
    const getSession = createSessionCache(resolver);

    await getSession();
    await getSession();

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent calls into a single in-flight resolve', async () => {
    let resolveResolver: (s: TigrisSession) => void = () => {};
    const resolver = vi.fn().mockImplementation(
      () =>
        new Promise<TigrisSession>((resolve) => {
          resolveResolver = resolve;
        })
    );
    const getSession = createSessionCache(resolver);

    const [p1, p2, p3] = [getSession(), getSession(), getSession()];
    resolveResolver(makeSession());

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(r1.data?.sessionToken).toBe('tok-1');
    expect(r2.data?.sessionToken).toBe('tok-1');
    expect(r3.data?.sessionToken).toBe('tok-1');
  });

  it('returns a TigrisResponse error when the resolver rejects', async () => {
    const resolver = vi.fn().mockRejectedValue(new Error('network down'));
    const getSession = createSessionCache(resolver);

    const result = await getSession();

    expect(result.error?.message).toBe('network down');
    expect(result.data).toBeUndefined();
  });

  it('does not cache failures — next call retries the resolver', async () => {
    const resolver = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce(makeSession({ sessionToken: 'tok-recovered' }));
    const getSession = createSessionCache(resolver);

    const failed = await getSession();
    expect(failed.error?.message).toBe('first failure');

    const recovered = await getSession();
    expect(recovered.data?.sessionToken).toBe('tok-recovered');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('normalizes non-Error resolver rejections via toError', async () => {
    const resolver = vi.fn().mockRejectedValue('string failure');
    const getSession = createSessionCache(resolver);

    const result = await getSession();

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('string failure');
  });
});
