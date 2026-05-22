/**
 * Executes an array of task functions with a concurrency limit.
 * Each task is a function that returns a Promise.
 */
export async function executeWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  // Ensure concurrency is at least 1
  const limit = Math.max(1, Math.floor(concurrency));

  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      results[index] = await tasks[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext()
  );

  await Promise.all(workers);
  return results;
}

/**
 * Encode an object key for use in an S3-style request path or
 * `X-Amz-Copy-Source` header. Encodes each path segment with
 * AWS-compatible URI escaping and rejoins with `/`, so the slash
 * separators survive verbatim.
 *
 * Why not bare `encodeURIComponent`: AWS's SigV4 canonical-URI scheme
 * (and the S3 gateway's server-side canonicalization) percent-encode
 * every byte except `A-Za-z0-9-._~` — that includes the sub-delims
 * `!'()*`, which `encodeURIComponent` leaves alone. If we sign and
 * send a path with literal `(` but the server canonicalizes it to
 * `%28` before checking, we get `SignatureDoesNotMatch` on keys that
 * contain those characters (e.g. `holiday (2024).jpg`).
 *
 * The slash-preserving split also matters: a single `encodeURIComponent`
 * on the whole key would turn `/` into `%2F`, which the signer or server
 * would then encode again to `%252F` — same divergence symptom.
 */
export function encodeObjectKey(key: string): string {
  return key.split('/').map(escapeUriSegment).join('/');
}

/** AWS-compatible URI escape for a single path segment. */
function escapeUriSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  return new Error('An unexpected error occurred');
}

export const handleError = (error: Error) => {
  let errorMessage: string | undefined;

  if ((error as { Code?: string }).Code === 'AccessDenied') {
    errorMessage = 'Access denied. Please check your credentials.';
  }
  if ((error as { Code?: string }).Code === 'NoSuchKey') {
    errorMessage = 'File not found in Tigris Storage';
  }

  if (errorMessage) {
    return {
      error: new Error(errorMessage),
    };
  }

  return {
    error: new Error(
      error?.message || 'Unexpected error while processing request'
    ),
  };
};
