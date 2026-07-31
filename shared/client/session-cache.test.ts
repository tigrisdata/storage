import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TigrisResolvedSession } from './init-types';
import { createSessionCache } from './session-cache';

function session(expiresInMs?: number): TigrisResolvedSession {
  return {
    sessionToken: 'token',
    organizationId: 'org_1',
    ...(expiresInMs !== undefined && {
      expiration: new Date(Date.now() + expiresInMs),
    }),
  };
}

describe('createSessionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves from the resolver on first call', async () => {
    const resolver = vi.fn().mockResolvedValue(session());
    const getSession = createSessionCache(resolver);

    const result = await getSession();

    expect(result).toEqual({ data: session() });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('returns the cached session without a session that never expires', async () => {
    const resolver = vi.fn().mockResolvedValue(session());
    const getSession = createSessionCache(resolver);

    await getSession();
    await getSession();
    await getSession();

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('returns the cached session while still within its validity window', async () => {
    const resolver = vi.fn().mockResolvedValue(session(5 * 60_000));
    const getSession = createSessionCache(resolver);

    await getSession();
    vi.advanceTimersByTime(2 * 60_000);
    await getSession();

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('refreshes proactively once within the 60s buffer of expiration', async () => {
    const resolver = vi
      .fn()
      .mockResolvedValueOnce(session(90_000))
      .mockResolvedValueOnce(session(5 * 60_000));
    const getSession = createSessionCache(resolver);

    await getSession();
    // 90s session, 60s buffer — still fresh at +20s.
    vi.advanceTimersByTime(20_000);
    await getSession();
    expect(resolver).toHaveBeenCalledTimes(1);

    // At +40s (60s left), inside the refresh buffer — should refetch.
    vi.advanceTimersByTime(20_000);
    await getSession();
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent calls onto a single in-flight resolve', async () => {
    let resolveFn: (s: TigrisResolvedSession) => void = () => {};
    const resolver = vi.fn().mockReturnValue(
      new Promise<TigrisResolvedSession>((resolve) => {
        resolveFn = resolve;
      })
    );
    const getSession = createSessionCache(resolver);

    const first = getSession();
    const second = getSession();
    resolveFn(session());
    const [a, b] = await Promise.all([first, second]);

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ data: session() });
    expect(b).toEqual({ data: session() });
  });

  it('does not cache a failed resolve, retries on next call', async () => {
    const resolver = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(session());
    const getSession = createSessionCache(resolver);

    const first = await getSession();
    expect(first.error?.message).toBe('network down');

    const second = await getSession();
    expect(second).toEqual({ data: session() });
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('wraps a non-Error rejection into an Error', async () => {
    const resolver = vi.fn().mockRejectedValue('plain string failure');
    const getSession = createSessionCache(resolver);

    const result = await getSession();

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('plain string failure');
  });
});
