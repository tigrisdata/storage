import type { TigrisResponse, TigrisSession } from './types';
import { toError } from './utils';

/**
 * Refresh `REFRESH_BUFFER_MS` before a session expires, so the token
 * handed to a request always has at least this much validity left.
 * Keeps requests in-flight when the token expires from being signed
 * with a stale value.
 */
const REFRESH_BUFFER_MS = 60_000;

/**
 * Wraps an async session resolver with caching + proactive refresh.
 *
 * - Returns the cached session when present and not within the
 *   refresh buffer of expiration.
 * - On staleness, invokes the resolver and caches the result.
 * - Concurrent callers during a refresh coalesce onto a single
 *   in-flight resolver call.
 * - Failed resolves are not cached — the next call retries.
 *
 * The returned function never throws; resolver rejections come back
 * through the `{ error }` channel.
 */
export function createSessionCache(
  resolver: () => Promise<TigrisSession>
): () => Promise<TigrisResponse<TigrisSession>> {
  let cached: TigrisSession | undefined;
  let inFlight: Promise<TigrisResponse<TigrisSession>> | undefined;

  return async function getSession() {
    const isStale =
      !cached ||
      (cached.expiration !== undefined &&
        cached.expiration.getTime() - REFRESH_BUFFER_MS <= Date.now());

    if (!isStale && cached) {
      return { data: cached };
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = resolver()
      .then((session): TigrisResponse<TigrisSession> => {
        cached = session;
        return { data: session };
      })
      .catch((err): TigrisResponse<TigrisSession> => ({ error: toError(err) }))
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };
}
