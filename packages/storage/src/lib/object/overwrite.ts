// Shared by put, completeMultipartUpload and the browser upload client, so it
// must not import the AWS SDK.

export const FILE_EXISTS_ERROR_MESSAGE = 'File already exists';

/**
 * True when S3 rejected a create-only write (`If-None-Match: *`) because the
 * object already exists.
 */
export const isPreconditionFailed = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return e.$metadata?.httpStatusCode === 412 || e.name === 'PreconditionFailed';
};
