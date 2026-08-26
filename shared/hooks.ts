/**
 * Where an error surfaced, so a consumer can tell a one-shot failure from one
 * that survived every retry.
 *
 * - `http_error` — the server answered with a non-2xx that was not retried.
 * - `retries_exhausted` — retried up to the attempt ceiling and still failed.
 * - `network_error` — the request never produced a response.
 */
export type HttpErrorSource =
  | 'http_error'
  | 'retries_exhausted'
  | 'network_error';

export interface HttpErrorContext {
  source: HttpErrorSource;
  method: string;
  /**
   * Scheme, host, and port the request went to. Split from `path` so a consumer
   * can reconstruct the absolute URL as `${origin}${path}` while keeping the
   * default identifier host-independent.
   */
  origin: string;
  /**
   * Request path including query string. Carries no auth material: this client
   * signs via headers, never via query parameters.
   */
  path: string;
  organizationId?: string;
  status?: number;
  /** 1-based index of the attempt that produced this error. */
  attempt: number;
  /** Total attempts allowed for the request. */
  attempts: number;
  message: string;
  error: Error;
}

export interface RetryHookContext extends HttpErrorContext {
  /** Backoff applied before the next attempt, in ms. */
  delayMs: number;
}

export interface TigrisHttpHooks {
  onError?: (context: HttpErrorContext) => void | Promise<void>;
  onRetry?: (context: RetryHookContext) => void | Promise<void>;
}

/**
 * The registry lives on `globalThis`, not in a module-level variable.
 *
 * `shared/` is bundled into each package at build time rather than published
 * as its own module, so a module-level `let` here is duplicated per bundle:
 * `@tigrisdata/storage` and `@tigrisdata/iam` would each hold a private
 * registry, and a consumer registering through one would silently get no
 * telemetry from the other. The CJS and ESM builds of a single package split
 * the same way. A shared global is what makes one `setTigrisHttpHooks` call
 * cover every Tigris SDK package in the process.
 *
 * The key is versioned so a future breaking change to `TigrisHttpHooks` can
 * take a new slot instead of handing an old-shaped object to new code, which
 * matters when two different SDK versions coexist in one dependency tree.
 */
const REGISTRY_KEY = Symbol.for('@tigrisdata/http-hooks.v1');

type HookRegistry = { hooks?: TigrisHttpHooks };

function registry(): HookRegistry {
  const container = globalThis as typeof globalThis & {
    [REGISTRY_KEY]?: HookRegistry;
  };

  let existing = container[REGISTRY_KEY];
  if (!existing) {
    existing = {};
    Object.defineProperty(container, REGISTRY_KEY, {
      value: existing,
      // Non-enumerable so the key stays out of logs and object dumps; still
      // writable/configurable so tooling can reset it if it must.
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }

  return existing;
}

/**
 * Register process-wide observability hooks for the Tigris HTTP client.
 *
 * One call covers every Tigris SDK package in the process — registering
 * through `@tigrisdata/storage` also reports `@tigrisdata/iam` failures.
 *
 * Read at request time rather than captured at client construction, which
 * keeps the client cache in `http-client.ts` intact: a function cannot go into
 * a cache key, so binding hooks per client would mean either skipping the
 * cache or silently serving the first caller's hooks to everyone.
 *
 * Covers requests made through `createTigrisHttpClient` — the bucket, fork,
 * and IAM operations. Object data-plane calls (`put`, `get`, `list`,
 * multipart) go through the AWS SDK's S3 client and are not reported here.
 *
 * Pass `undefined` to clear.
 *
 * @example
 * ```ts
 * import * as Sentry from '@sentry/node';
 *
 * setTigrisHttpHooks({
 *   onError: ({ source, method, origin, path, status, message }) => {
 *     Sentry.captureException(
 *       new Error(`Tigris ${status ?? ''} ${origin}${path}`),
 *       {
 *         tags: { api_error_source: source, api_method: method },
 *         contexts: { error_detail: { message } },
 *       }
 *     );
 *   },
 * });
 * ```
 */
export function setTigrisHttpHooks(hooks: TigrisHttpHooks | undefined): void {
  registry().hooks = hooks;
}

export function getTigrisHttpHooks(): TigrisHttpHooks | undefined {
  return registry().hooks;
}

/**
 * Invoke a hook without letting it affect the request.
 *
 * Hooks are observational, so a consumer's telemetry callback must never be
 * able to fail an otherwise-fine call. Sync throws and rejected promises are
 * both swallowed, and the result is never awaited — a slow reporter should not
 * add latency to the request path.
 */
export function emitHook<T>(
  hook: ((context: T) => void | Promise<void>) | undefined,
  context: T
): void {
  if (!hook) {
    return;
  }

  try {
    const result = hook(context);
    if (result && typeof result.then === 'function') {
      result.then(undefined, () => {});
    }
  } catch {
    // Swallowed by design: see above.
  }
}
