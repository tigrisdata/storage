import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';
import { TigrisHeaders } from './headers';
import {
  emitHook,
  getTigrisHttpHooks,
  type HttpErrorContext,
  type HttpErrorSource,
} from './hooks';
import {
  computeRetryDelay,
  isRetryableFailure,
  type ResolvedRetry,
  type RetryConfig,
  resolveRetry,
  sleep,
} from './retry';
import type { TigrisResponse } from './types';
import { toError } from './utils';

export interface HttpClientRequest<T = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path: string;
  headers?: Record<string, string>;
  body?: T;
  query?: Record<string, string | number | boolean>;
  /** Return the raw response body as a ReadableStream instead of parsing it. */
  stream?: boolean;
  /**
   * Retry policy for this request, overriding the client's. Pass `false` to
   * opt a single call out of a client that has retry enabled.
   */
  retry?: RetryConfig;
  /** Forwarded to `fetch`; aborts the in-flight attempt. */
  signal?: AbortSignal;
}

export type HttpClientResponse<T = unknown> =
  | {
      status: number;
      statusText: string;
      headers: Headers;
      data: T;
      error?: never;
    }
  | {
      status: number;
      statusText: string;
      headers: Headers;
      error: Error;
      data?: never;
    };

export interface TigrisHttpClient {
  request<TRequest = unknown, TResponse = unknown>(
    req: HttpClientRequest<TRequest>
  ): Promise<HttpClientResponse<TResponse>>;
}

export interface CreateHttpClientOptions {
  baseUrl: string;
  sessionToken?: string;
  organizationId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /**
   * Default retry policy for every request from this client. Omitted or
   * `false` means a single attempt — retry never engages unless asked for.
   */
  retry?: RetryConfig;
}

const cachedHttpClients = new Map<string, TigrisHttpClient>();

/**
 * Generate AWS Signature V4 headers for a request
 */
async function generateSignatureHeaders(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: string | undefined,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const signer = new SignatureV4({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region: 'auto',
    service: 's3',
    sha256: Sha256,
    // S3 uses single-encoding for the canonical path; the default
    // (`true`) is the AWS-standard double-encoding scheme and produces
    // `SignatureDoesNotMatch` whenever a path segment contains
    // characters that need percent-encoding (space, `?`, `=`, etc.).
    uriEscapePath: false,
  });

  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const request = {
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? parseInt(url.port, 10) : undefined,
    path: url.pathname,
    ...(Object.keys(query).length > 0 && { query }),
    headers: {
      ...headers,
      host: url.host,
    },
    body,
  };

  const signedRequest = await signer.sign(request);
  return signedRequest.headers as Record<string, string>;
}

/**
 * Stable cache-key fragment for a retry config, or `undefined` when the
 * config cannot be keyed.
 *
 * A `shouldRetry` callback is an opaque function, so two clients with
 * different predicates would collide on the same key and the first one built
 * would be served to both. `tigris-client.ts` skips its cache for
 * `credentialProvider` for the same reason.
 */
function retryCacheKey(config: RetryConfig | undefined): string | undefined {
  if (config === undefined || config === false) {
    return 'noretry';
  }

  if (config !== true && config.shouldRetry) {
    return undefined;
  }

  const options = config === true ? {} : config;
  // The method here only normalizes the numeric fields; the resolved
  // `retryNetworkErrors` is deliberately not used below.
  const retry = resolveRetry(config, 'GET');
  return [
    'retry',
    retry.attempts,
    retry.baseDelayMs,
    retry.maxDelayMs,
    // Tri-state, not the resolved boolean: an unset `retryNetworkErrors` is
    // derived from each request's method, so it varies within one client and
    // cannot be baked into a client-level key.
    options.retryNetworkErrors === undefined
      ? 'auto'
      : options.retryNetworkErrors
        ? 1
        : 0,
    retry.retryableStatuses.join('.'),
  ].join(':');
}

/** Read a body without letting a mid-stream failure mask the real error. */
async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/**
 * Mirror the pre-retry error-message extraction: a JSON body's `Message`
 * field, else the status text.
 */
function extractErrorMessage(text: string, statusText: string): string {
  if (text) {
    try {
      const parsed = JSON.parse(text) as { Message?: string };
      // `||`, not `??`: an empty `Message` or an empty `statusText` should
      // fall through rather than produce `new Error('')`. `fetch` leaves
      // `statusText` empty for HTTP/2 responses, which have no reason phrase.
      return parsed?.Message || statusText || 'Unknown error';
    } catch {
      // Not JSON — fall through to the status text, as before.
    }
  }

  return statusText || 'Unknown error';
}

export function createTigrisHttpClient(
  options: CreateHttpClientOptions
): TigrisResponse<TigrisHttpClient, Error> {
  const {
    baseUrl,
    sessionToken,
    organizationId,
    accessKeyId,
    secretAccessKey,
    retry: clientRetry,
  } = options;

  const retryKey = retryCacheKey(clientRetry);

  let key: string | undefined = `${baseUrl}`;

  if (organizationId) {
    key = `${key}-${organizationId}`;
  }

  if (sessionToken) {
    key = `${key}-${sessionToken}`;
  }

  if (accessKeyId) {
    key = `${key}-${accessKeyId}`;
  }

  if (retryKey === undefined) {
    key = undefined;
  } else {
    key = `${key}-${retryKey}`;
  }

  if (key !== undefined) {
    const cachedClient = cachedHttpClients.get(key);
    if (cachedClient !== undefined) {
      return { data: cachedClient };
    }
  }

  const client: TigrisHttpClient = {
    async request<TRequest = unknown, TResponse = unknown>(
      req: HttpClientRequest<TRequest>
    ): Promise<HttpClientResponse<TResponse>> {
      const url = new URL(req.path, baseUrl);

      if (req.query) {
        Object.entries(req.query).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      // Prepare body for signing. Deterministic, so it is built once and
      // reused across attempts — a retry must re-send the same bytes (and, for
      // `createAccessKey`, the same `req_uuid`) for server-side dedup to work.
      let bodyString: string | undefined;
      if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body instanceof URLSearchParams) {
          bodyString = req.body.toString();
        } else {
          bodyString = JSON.stringify(req.body);
        }
      }

      const retry: ResolvedRetry = resolveRetry(
        req.retry ?? clientRetry,
        req.method
      );
      const target = `${url.pathname}${url.search}`;
      const requestOrigin = url.origin;

      const emitError = (
        source: HttpErrorSource,
        attempt: number,
        message: string,
        error: Error,
        status?: number
      ): void => {
        const context: HttpErrorContext = {
          source,
          method: req.method,
          origin: requestOrigin,
          path: target,
          attempt,
          attempts: retry.attempts,
          message,
          error,
          ...(organizationId !== undefined && { organizationId }),
          ...(status !== undefined && { status }),
        };
        emitHook(getTigrisHttpHooks()?.onError, context);
      };

      const emitRetry = (
        attempt: number,
        delayMs: number,
        message: string,
        error: Error,
        status?: number
      ): void => {
        emitHook(getTigrisHttpHooks()?.onRetry, {
          source:
            status === undefined
              ? ('network_error' as const)
              : ('http_error' as const),
          method: req.method,
          origin: requestOrigin,
          path: target,
          attempt,
          attempts: retry.attempts,
          message,
          error,
          delayMs,
          ...(organizationId !== undefined && { organizationId }),
          ...(status !== undefined && { status }),
        });
      };

      for (let attempt = 1; ; attempt++) {
        let headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...req.headers,
        };

        // Signed per attempt, not once up front: `x-amz-date` stays inside its
        // validity window on a retried request, and a future credential
        // provider would get a chance to refresh between attempts.
        if (accessKeyId && secretAccessKey && !sessionToken) {
          headers = await generateSignatureHeaders(
            req.method,
            url,
            headers,
            bodyString,
            accessKeyId,
            secretAccessKey
          );
        } else {
          // Use session token or pre-generated authorization
          if (sessionToken) {
            headers[TigrisHeaders.SESSION_TOKEN] = sessionToken;
          }

          if (organizationId) {
            headers[TigrisHeaders.NAMESPACE] = organizationId;
          }
        }

        const fetchOptions: RequestInit = {
          method: req.method,
          headers,
        };

        if (bodyString) {
          fetchOptions.body = bodyString;
        }

        if (req.signal) {
          fetchOptions.signal = req.signal;
        }

        let response: Response;
        try {
          response = await fetch(url.toString(), fetchOptions);
        } catch (caught) {
          const error = toError(caught);

          // An aborted request is the caller's own doing — never retry it.
          // `fetch` rejects with a `DOMException`, which is not guaranteed to
          // be an `Error` subclass in every runtime, so check the signal and
          // the raw value rather than trusting the converted error's name.
          if (
            req.signal?.aborted === true ||
            (caught as { name?: string })?.name === 'AbortError'
          ) {
            throw caught;
          }

          const context = {
            method: req.method,
            origin: requestOrigin,
            path: target,
            attempt,
            attempts: retry.attempts,
            error,
          };

          // Evaluated once: a caller's `shouldRetry` may have side effects,
          // and it also decides the reported source below.
          const retryable = isRetryableFailure(retry, context);

          if (retryable && attempt < retry.attempts) {
            const delayMs = computeRetryDelay(retry, attempt);
            emitRetry(attempt, delayMs, error.message, error);
            await sleep(delayMs, req.signal);
            continue;
          }

          emitError(
            retryable ? 'retries_exhausted' : 'network_error',
            attempt,
            error.message,
            error
          );

          // Transport failures have always propagated to the caller rather
          // than surfacing as `{ error }`; retry does not change that
          // contract. Rethrow the original value, not the converted one, so a
          // caller matching on a specific error type still sees it.
          throw caught;
        }

        if (!response.ok) {
          const text = await safeText(response);
          const message = extractErrorMessage(text, response.statusText);
          const error = new Error(message);

          const context = {
            method: req.method,
            origin: requestOrigin,
            path: target,
            attempt,
            attempts: retry.attempts,
            status: response.status,
          };

          const retryable = isRetryableFailure(retry, context);

          if (retryable && attempt < retry.attempts) {
            const delayMs = computeRetryDelay(
              retry,
              attempt,
              response.headers.get('retry-after')
            );
            emitRetry(attempt, delayMs, message, error, response.status);
            await sleep(delayMs, req.signal);
            continue;
          }

          emitError(
            retryable ? 'retries_exhausted' : 'http_error',
            attempt,
            message,
            error,
            response.status
          );

          return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            error,
          };
        }

        if (req.stream) {
          if (!response.body) {
            const error = new Error('No body returned from stream request');
            emitError(
              'http_error',
              attempt,
              error.message,
              error,
              response.status
            );
            return {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
              error,
            };
          }

          return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.body as TResponse,
          };
        }

        let data: TResponse;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          // Read as text first: endpoints like `POST ?restore` answer 200 with
          // an empty body while still advertising JSON, and `response.json()`
          // throws on ''. Parse only when there is something to parse.
          //
          // Deliberately not `safeText` here. On a 2xx the body *is* the
          // result, so a mid-stream read failure is the real error and must
          // propagate — swallowing it to '' would be indistinguishable from a
          // legitimately empty body and would hand the caller a bogus `{}`
          // that later normalizes into plausible-looking defaults.
          const text = await response.text();
          data = (text ? JSON.parse(text) : {}) as TResponse;
        } else {
          data = (await response.text()) as TResponse;
        }

        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data,
        };
      }
    },
  };

  if (key !== undefined) {
    cachedHttpClients.set(key, client);
  }

  return { data: client };
}
