import { DeleteBucketCommand } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';

export type PurgeBucketOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export type PurgeBucketResponse = {
  bucket: string;
  purged: boolean;
};

/**
 * Permanently destroy a soft-deleted bucket before its retention period
 * expires — the counterpart of `restoreBucket`.
 *
 * The bucket must already be soft-deleted; the gateway rejects the call for a
 * live bucket rather than deleting it. Once purged it can no longer be
 * restored. List the candidates with `listBuckets({ deleted: true })`.
 */
export async function purgeBucket(
  bucketName: string,
  options?: PurgeBucketOptions
): Promise<TigrisStorageResponse<PurgeBucketResponse, Error>> {
  if (!bucketName) {
    return { error: new Error('Bucket name is required') };
  }

  const { data: tigrisClient, error } = createTigrisClient(
    options?.config,
    true
  );

  if (error) {
    return { error };
  }

  const command = new DeleteBucketCommand({
    Bucket: bucketName,
  });

  // A plain DeleteBucket on a soft-deleted bucket is a no-op; this header
  // turns it into the hard delete.
  command.middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers[TigrisHeaders.FORCE_HARD_DELETE] = 'true';
      return next(args);
    },
    {
      name: 'X-Tigris-Force-Hard-Delete-Middleware',
      step: 'build',
      override: true,
    }
  );

  try {
    await tigrisClient.send(command);
    return { data: { bucket: bucketName, purged: true } };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
