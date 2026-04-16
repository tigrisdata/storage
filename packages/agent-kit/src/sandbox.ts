import {
  createBucket,
  createBucketSnapshot,
  removeBucket,
} from '@tigrisdata/storage';
import { createAccessKey, removeAccessKey } from '@tigrisdata/iam';
import type { TigrisResponse } from '@shared/types';
import type { TigrisAIConfig } from './config';
import { toStorageConfig, toIAMConfig } from './config';

// -- Types --

export type CreateSandboxOptions = {
  /** Prefix for fork bucket names. Defaults to `${baseBucket}-sandbox-${timestamp}`. */
  prefix?: string;
  /** If provided, creates a scoped access key per fork with this role. */
  credentials?: {
    role: 'Editor' | 'ReadOnly';
  };
  config?: TigrisAIConfig;
};

export type SandboxFork = {
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type Sandbox = {
  baseBucket: string;
  snapshotId: string;
  forks: SandboxFork[];
};

export type TeardownSandboxOptions = {
  config?: TigrisAIConfig;
};

// -- Functions --

export async function createSandbox(
  baseBucket: string,
  count: number,
  options?: CreateSandboxOptions
): Promise<TigrisResponse<Sandbox>> {
  const { prefix, credentials, config } = options ?? {};
  const storageConfig = toStorageConfig(config);
  const iamConfig = toIAMConfig(config);

  // Step 1: Snapshot the base bucket
  const snapshotResult = await createBucketSnapshot(baseBucket, {
    config: storageConfig,
  });

  if (snapshotResult.error) {
    return {
      error: new Error(
        `Failed to snapshot bucket "${baseBucket}": ${snapshotResult.error.message}`
      ),
    };
  }

  const snapshotId = snapshotResult.data.snapshotVersion;
  const forkPrefix = prefix ?? `${baseBucket}-sandbox-${Date.now()}`;
  const forks: SandboxFork[] = [];

  // Step 2: Create forks with optional scoped credentials
  for (let i = 0; i < count; i++) {
    const forkName = `${forkPrefix}-${i}`;

    const forkResult = await createBucket(forkName, {
      sourceBucketName: baseBucket,
      sourceBucketSnapshot: snapshotId,
      config: storageConfig,
    });

    if (forkResult.error) {
      // Stop creating more forks, return what we have
      break;
    }

    const fork: SandboxFork = { bucket: forkName };

    if (credentials) {
      const keyResult = await createAccessKey(`${forkName}-key`, {
        bucketsRole: [{ bucket: forkName, role: credentials.role }],
        config: iamConfig,
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
      error: new Error('Failed to create any forks for sandbox'),
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

export async function teardownSandbox(
  sandbox: Sandbox,
  options?: TeardownSandboxOptions
): Promise<TigrisResponse<void>> {
  const storageConfig = toStorageConfig(options?.config);
  const iamConfig = toIAMConfig(options?.config);
  const errors: string[] = [];

  for (const fork of sandbox.forks) {
    // Revoke credentials first
    if (fork.credentials) {
      const keyResult = await removeAccessKey(fork.credentials.accessKeyId, {
        config: iamConfig,
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
      config: storageConfig,
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
        `Sandbox teardown completed with errors:\n${errors.join('\n')}`
      ),
    };
  }

  return { data: undefined };
}
