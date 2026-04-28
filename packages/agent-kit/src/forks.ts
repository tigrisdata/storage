import type { TigrisResponse } from '@shared/types';
import { createAccessKey, removeAccessKey } from '@tigrisdata/iam';
import {
  createBucket,
  createBucketSnapshot,
  removeBucket,
} from '@tigrisdata/storage';
import type { TigrisAgentKitConfig } from './config';

// -- Types --

export type CreateForksOptions = {
  /** Prefix for fork bucket names. Defaults to `${baseBucket}-fork-${timestamp}`. */
  prefix?: string;
  /** If provided, creates a scoped access key per fork with this role. */
  credentials?: {
    role: 'Editor' | 'ReadOnly';
  };
  config?: TigrisAgentKitConfig;
};

export type Fork = {
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type Forks = {
  baseBucket: string;
  snapshotId: string;
  forks: Fork[];
};

export type TeardownForksOptions = {
  config?: TigrisAgentKitConfig;
};

// -- Functions --

export async function createForks(
  baseBucket: string,
  count: number,
  options?: CreateForksOptions
): Promise<TigrisResponse<Forks>> {
  const { prefix, credentials, config } = options ?? {};

  // Step 1: Snapshot the base bucket
  const snapshotResult = await createBucketSnapshot(baseBucket, {
    config,
  });

  if (snapshotResult.error) {
    return {
      error: new Error(
        `Failed to snapshot bucket "${baseBucket}": ${snapshotResult.error.message}`
      ),
    };
  }

  const snapshotId = snapshotResult.data.snapshotVersion;
  const forkPrefix = prefix ?? `${baseBucket}-fork-${Date.now()}`;
  const forks: Fork[] = [];

  // Step 2: Create forks with optional scoped credentials
  for (let i = 0; i < count; i++) {
    const forkName = `${forkPrefix}-${i}`;

    const forkResult = await createBucket(forkName, {
      sourceBucketName: baseBucket,
      sourceBucketSnapshot: snapshotId,
      config,
    });

    if (forkResult.error) {
      // Stop creating more forks, return what we have
      break;
    }

    const fork: Fork = { bucket: forkName };

    if (credentials) {
      const keyResult = await createAccessKey(`${forkName}-key`, {
        bucketsRole: [{ bucket: forkName, role: credentials.role }],
        config,
      });

      if (keyResult.data?.secret) {
        fork.credentials = {
          accessKeyId: keyResult.data.id,
          secretAccessKey: keyResult.data.secret,
        };
      }
    }

    forks.push(fork);
  }

  if (forks.length === 0) {
    return {
      error: new Error('Failed to create any forks'),
    };
  }

  return {
    data: {
      baseBucket,
      snapshotId,
      forks,
    },
  };
}

export async function teardownForks(
  forkSet: Forks,
  options?: TeardownForksOptions
): Promise<TigrisResponse<void>> {
  const config = options?.config;
  const errors: string[] = [];

  for (const fork of forkSet.forks) {
    // Revoke credentials first
    if (fork.credentials) {
      const keyResult = await removeAccessKey(fork.credentials.accessKeyId, {
        config,
      });
      if (keyResult.error) {
        errors.push(
          `Failed to remove access key for "${fork.bucket}": ${keyResult.error.message}`
        );
      }
    }

    // Then delete the fork bucket
    const bucketResult = await removeBucket(fork.bucket, {
      force: true,
      config,
    });
    if (bucketResult.error) {
      errors.push(
        `Failed to delete fork "${fork.bucket}": ${bucketResult.error.message}`
      );
    }
  }

  if (errors.length > 0) {
    return {
      error: new Error(
        `Fork teardown completed with errors:\n${errors.join('\n')}`
      ),
    };
  }

  return { data: undefined };
}
