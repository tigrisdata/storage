import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeRetryDelay,
  DEFAULT_RETRYABLE_STATUSES,
  isRetryableFailure,
  parseRetryAfter,
  resolveRetry,
} from './retry';

const context = (
  overrides: Partial<Parameters<typeof isRetryableFailure>[1]>
) => ({
  method: 'POST',
  origin: 'https://t3.storage.dev',
  path: '/bucket',
  attempt: 1,
  attempts: 3,
  ...overrides,
});

describe('resolveRetry', () => {
  it('resolves an omitted config to a single attempt', () => {
    const retry = resolveRetry(undefined, 'GET');

    expect(retry.attempts).toBe(1);
    expect(retry.retryNetworkErrors).toBe(false);
    expect(retry.retryableStatuses).toEqual([]);
  });

  it('resolves false to a single attempt', () => {
    expect(resolveRetry(false, 'GET').attempts).toBe(1);
  });

  it('resolves true to the defaults', () => {
    const retry = resolveRetry(true, 'GET');

    expect(retry.attempts).toBe(3);
    expect(retry.baseDelayMs).toBe(100);
    expect(retry.maxDelayMs).toBe(2000);
    expect(retry.retryableStatuses).toEqual(DEFAULT_RETRYABLE_STATUSES);
  });

  it('derives retryNetworkErrors from the method when unset', () => {
    // Safe to re-send: the request carries no side effect.
    expect(resolveRetry(true, 'GET').retryNetworkErrors).toBe(true);
    expect(resolveRetry(true, 'HEAD').retryNetworkErrors).toBe(true);

    // A transport failure leaves these with an unknown outcome, so the write
    // may already have landed.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(resolveRetry(true, method).retryNetworkErrors).toBe(false);
    }
  });

  it('lets an explicit retryNetworkErrors override the method default', () => {
    // The escape hatch for a write the caller knows is safe to repeat —
    // `createAccessKey` dedupes on the `req_uuid` it sends.
    expect(
      resolveRetry({ retryNetworkErrors: true }, 'POST').retryNetworkErrors
    ).toBe(true);

    expect(
      resolveRetry({ retryNetworkErrors: false }, 'GET').retryNetworkErrors
    ).toBe(false);
  });

  it('keeps caller overrides', () => {
    const retry = resolveRetry(
      {
        attempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 50,
        retryableStatuses: [503],
        retryNetworkErrors: false,
      },
      'GET'
    );

    expect(retry).toMatchObject({
      attempts: 5,
      baseDelayMs: 10,
      maxDelayMs: 50,
      retryableStatuses: [503],
      retryNetworkErrors: false,
    });
  });

  it('floors attempts at one so a bad value cannot skip the request', () => {
    expect(resolveRetry({ attempts: 0 }, 'GET').attempts).toBe(1);
    expect(resolveRetry({ attempts: -3 }, 'GET').attempts).toBe(1);
  });
});

describe('isRetryableFailure', () => {
  it('retries the default transient statuses', () => {
    const retry = resolveRetry(true, 'GET');

    for (const status of DEFAULT_RETRYABLE_STATUSES) {
      expect(isRetryableFailure(retry, context({ status }))).toBe(true);
    }
  });

  it('never retries 400 or 403', () => {
    const retry = resolveRetry(true, 'GET');

    expect(isRetryableFailure(retry, context({ status: 400 }))).toBe(false);
    expect(isRetryableFailure(retry, context({ status: 403 }))).toBe(false);
  });

  it('retries statuses identically for every method', () => {
    // A 503 means the server is telling you it did not process the request,
    // so re-sending is safe whatever the operation. Only transport failures,
    // where the outcome is unknown, are method-sensitive.
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const retry = resolveRetry(true, method);

      expect(isRetryableFailure(retry, context({ method, status: 503 }))).toBe(
        true
      );
      expect(isRetryableFailure(retry, context({ method, status: 429 }))).toBe(
        true
      );
      expect(isRetryableFailure(retry, context({ method, status: 403 }))).toBe(
        false
      );
    }
  });

  it('ignores the attempt ceiling — that is the caller"s check', () => {
    // Separating the two lets the caller tell "ran out of attempts" from
    // "was never retryable", which is what the reported source depends on.
    const retry = resolveRetry({ attempts: 2 }, 'GET');

    expect(
      isRetryableFailure(retry, context({ status: 500, attempt: 1 }))
    ).toBe(true);
    expect(
      isRetryableFailure(retry, context({ status: 500, attempt: 9 }))
    ).toBe(true);
  });

  it('retries transport errors only when enabled', () => {
    const error = new Error('connection reset');

    expect(
      isRetryableFailure(resolveRetry(true, 'GET'), context({ error }))
    ).toBe(true);
    expect(
      isRetryableFailure(
        resolveRetry({ retryNetworkErrors: false }, 'GET'),
        context({ error })
      )
    ).toBe(false);
  });

  it('lets shouldRetry replace the status and network defaults', () => {
    const retry = resolveRetry(
      { shouldRetry: (ctx) => ctx.status === 403 },
      'GET'
    );

    expect(isRetryableFailure(retry, context({ status: 403 }))).toBe(true);
    expect(isRetryableFailure(retry, context({ status: 500 }))).toBe(false);
  });

  it('defers to a custom shouldRetry regardless of attempt', () => {
    const retry = resolveRetry({ attempts: 2, shouldRetry: () => true }, 'GET');

    expect(isRetryableFailure(retry, context({ attempt: 2 }))).toBe(true);
  });
});

describe('parseRetryAfter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads delay-seconds', () => {
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(' 0 ')).toBe(0);
  });

  it('reads an HTTP-date relative to now', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:05 GMT')).toBe(5000);
  });

  it('clamps a past date to zero rather than going negative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));

    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT')).toBe(0);
  });

  it('returns undefined for missing or unparseable values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('computeRetryDelay', () => {
  it('grows exponentially and applies full jitter', () => {
    const retry = resolveRetry({ baseDelayMs: 100, maxDelayMs: 10_000 }, 'GET');

    expect(computeRetryDelay(retry, 1, null, () => 1)).toBe(100);
    expect(computeRetryDelay(retry, 2, null, () => 1)).toBe(200);
    expect(computeRetryDelay(retry, 3, null, () => 1)).toBe(400);
    // Full jitter samples the whole [0, exponential] window.
    expect(computeRetryDelay(retry, 3, null, () => 0)).toBe(0);
    expect(computeRetryDelay(retry, 3, null, () => 0.5)).toBe(200);
  });

  it('caps the exponential at maxDelayMs', () => {
    const retry = resolveRetry({ baseDelayMs: 100, maxDelayMs: 250 }, 'GET');

    expect(computeRetryDelay(retry, 10, null, () => 1)).toBe(250);
  });

  it('prefers Retry-After over the computed backoff', () => {
    const retry = resolveRetry({ baseDelayMs: 100, maxDelayMs: 10_000 }, 'GET');

    expect(computeRetryDelay(retry, 1, '3', () => 1)).toBe(3000);
  });

  it('clamps Retry-After to maxDelayMs so a large value cannot stall the caller', () => {
    const retry = resolveRetry({ baseDelayMs: 100, maxDelayMs: 2000 }, 'GET');

    expect(computeRetryDelay(retry, 1, '600', () => 1)).toBe(2000);
  });
});
