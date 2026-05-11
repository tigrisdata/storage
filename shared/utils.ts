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
 * `encodeURIComponent` and rejoins with `/`, so the slash separators
 * survive verbatim.
 *
 * Why this matters: when the request is signed with SigV4 (access-key
 * auth path), the signer URI-escapes the path again during canonical
 * request construction. If the key was already escaped with a plain
 * `encodeURIComponent`, the `/` becomes `%2F` and then `%252F` —
 * mismatch against the server's canonical (which decodes `%2F`
 * back to `/` first). Result: `SignatureDoesNotMatch`.
 */
export function encodeObjectKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
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
