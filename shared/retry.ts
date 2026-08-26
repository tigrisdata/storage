/**
 * Statuses worth another attempt: request timeout, throttling, and transient
 * server-side failures.
 *
 * Deliberately excludes 400 and 403. Both are deterministic for this client —
 * a retry re-sends a byte-identical request and can only fail again. 403 in
 * particular is how `SignatureDoesNotMatch` surfaces (see the SigV4 notes in
 * AGENTS.md), which is the one error we most want to report immediately
 * instead of burying under three attempts' worth of latency.
 */
export const DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

export interface RetryContext {
  method: string;
  /**
   * Scheme, host, and port the request went to. Split from `path` so a
   * consumer can reconstruct the absolute URL as `${origin}${path}` while
   * keeping the default identifier host-independent.
   */
  origin: string;
  /** Request path including query string. */
  path: string;
  /** 1-based index of the attempt that just failed. */
  attempt: number;
  /** Total attempts allowed. */
  attempts: number;
  /** Response status, when the server answered at all. */
  status?: number;
  /** Transport error, when the request never produced a response. */
  error?: Error;
}

export interface RetryOptions {
  /** Total attempts, including the first. Default 3. */
  attempts?: number;
  /** First-retry backoff in ms; doubles per attempt. Default 100. */
  baseDelayMs?: number;
  /** Ceiling for any single backoff, and for a `Retry-After`. Default 2000. */
  maxDelayMs?: number;
  /** Statuses to retry. Default {@link DEFAULT_RETRYABLE_STATUSES}. */
  retryableStatuses?: number[];
  /**
   * Retry transport failures (DNS, connection reset, TLS) where the request
   * never produced a response.
   *
   * Defaults to whether the request method is safe to re-send — `GET` and
   * `HEAD` retry, everything else does not. A transport failure leaves the
   * outcome unknown, so a write may already have landed on the server even
   * though the client saw a failure. Set explicitly to override in either
   * direction; `true` is the escape hatch for an operation the caller knows is
   * safe to repeat.
   */
  retryNetworkErrors?: boolean;
  /**
   * Full override for the retry decision. When supplied, it replaces both
   * `retryableStatuses` and `retryNetworkErrors` — the attempt ceiling still
   * applies.
   *
   * Called once per failed attempt, including the final one, where its result
   * decides whether the failure is reported as `retries_exhausted` rather than
   * a plain error. Keep it pure: it is a classification, not a hook.
   */
  shouldRetry?: (context: RetryContext) => boolean;
}

/** `true` selects the defaults; `false`/omitted disables retry entirely. */
export type RetryConfig = boolean | RetryOptions;

export interface ResolvedRetry {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
  retryNetworkErrors: boolean;
  shouldRetry?: (context: RetryContext) => boolean;
}

const RETRY_DEFAULTS = {
  attempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
} as const;

/**
 * Whether a transport failure on `method` is safe to re-send by default.
 *
 * Keyed on the HTTP method because that is the only thing this layer knows
 * about the operation. It is a deliberately blunt first cut, and it is
 * conservative in the wrong direction for several real operations — in
 * `packages/iam` these are safe to retry but will not be, because they are not
 * `GET`:
 *
 * - `access-key/get.ts`, `access-key/list.ts`, `policy/get.ts`,
 *   `policy/list.ts` — reads issued as `POST ?Action=...`
 * - `access-key/create.ts` — dedupes on the `req_uuid` it sends, making it the
 *   one idempotent write in the package
 *
 * Callers can opt those back in with an explicit `retryNetworkErrors: true`.
 * The intended next iteration is a per-operation `idempotent` flag on
 * `HttpClientRequest`, required so a new operation cannot be added without
 * classifying itself, which would let this rule retire.
 */
function methodIsSafeToReplay(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/** A resolved config that performs exactly one attempt. */
const NO_RETRY: ResolvedRetry = {
  attempts: 1,
  baseDelayMs: 0,
  maxDelayMs: 0,
  retryableStatuses: [],
  retryNetworkErrors: false,
};

/**
 * Resolve a `retry` config into concrete numbers for a request.
 *
 * Retry is opt-in: an omitted or `false` config yields a single attempt, which
 * is what this client has always done. Nothing retries unless a consumer asks
 * for it.
 *
 * `method` only affects `retryNetworkErrors`. Status-code retries are
 * method-independent: a `503` means the server is telling you it did not
 * process the request, so re-sending is safe whatever the operation.
 */
export function resolveRetry(
  config: RetryConfig | undefined,
  method: string
): ResolvedRetry {
  if (config === undefined || config === false) {
    return NO_RETRY;
  }

  const options = config === true ? {} : config;

  return {
    attempts: Math.max(
      1,
      Math.floor(options.attempts ?? RETRY_DEFAULTS.attempts)
    ),
    baseDelayMs: Math.max(0, options.baseDelayMs ?? RETRY_DEFAULTS.baseDelayMs),
    maxDelayMs: Math.max(0, options.maxDelayMs ?? RETRY_DEFAULTS.maxDelayMs),
    retryableStatuses: options.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES,
    retryNetworkErrors:
      options.retryNetworkErrors ?? methodIsSafeToReplay(method),
    shouldRetry: options.shouldRetry,
  };
}

/**
 * Whether the failure described by `context` is retryable *by policy*,
 * ignoring how many attempts are left.
 *
 * Kept separate from the attempt ceiling so a caller can tell the two reasons
 * for giving up apart: a retryable failure that ran out of attempts is
 * `retries_exhausted`, while a failure that was never retryable is not — even
 * when it happens on a later attempt. Conflating them reports an exhausted
 * budget for, say, a `503` followed by a `403`.
 */
export function isRetryableFailure(
  retry: ResolvedRetry,
  context: RetryContext
): boolean {
  if (retry.shouldRetry) {
    return retry.shouldRetry(context);
  }

  if (context.status !== undefined) {
    return retry.retryableStatuses.includes(context.status);
  }

  return retry.retryNetworkErrors;
}

/**
 * Parse a `Retry-After` value into milliseconds. The header comes in two
 * shapes per RFC 9110 — delay-seconds, or an HTTP-date.
 */
export function parseRetryAfter(
  value: string | null | undefined
): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (trimmed !== '' && Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) {
    return undefined;
  }

  return Math.max(0, date - Date.now());
}

/**
 * Full-jitter exponential backoff, mirroring the AWS SDK's `standard` retry
 * mode so the two client paths in this SDK behave alike.
 *
 * A `Retry-After` wins when the server sends one — that is the server telling
 * us exactly how long to wait. It is still clamped to `maxDelayMs` so a large
 * or hostile value cannot stall the caller; raise `maxDelayMs` to honor long
 * throttling windows in full.
 */
export function computeRetryDelay(
  retry: ResolvedRetry,
  attempt: number,
  retryAfter?: string | null,
  random: () => number = Math.random
): number {
  const serverDelay = parseRetryAfter(retryAfter);
  if (serverDelay !== undefined) {
    return Math.min(serverDelay, retry.maxDelayMs);
  }

  const exponential = Math.min(
    retry.baseDelayMs * 2 ** (attempt - 1),
    retry.maxDelayMs
  );

  return Math.round(random() * exponential);
}

/** The value a runtime would reject an aborted operation with. */
function abortReason(signal: AbortSignal): unknown {
  return (
    signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  );
}

/**
 * Wait `ms`, rejecting early if `signal` aborts.
 *
 * Backoff has to observe cancellation: a `Retry-After` can hold the caller for
 * the whole of `maxDelayMs`, and without this an abort would wait that out and
 * then burn a signing pass and a `fetch` that is going to reject anyway.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortReason(signal));
  }

  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
