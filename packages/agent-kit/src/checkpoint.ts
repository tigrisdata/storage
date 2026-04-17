import {
  createBucket,
  createBucketSnapshot,
  listBucketSnapshots,
} from '@tigrisdata/storage';
import type { TigrisResponse } from '@shared/types';
import type { TigrisAIConfig } from './config';
import { toStorageConfig } from './config';

// -- Types --

export type CheckpointOptions = {
  /** Optional name for the checkpoint snapshot. */
  name?: string;
  config?: TigrisAIConfig;
};

export type Checkpoint = {
  snapshotId: string;
  name?: string;
  createdAt?: Date;
};

export type RestoreOptions = {
  /** Name for the restored fork bucket. Defaults to `${bucket}-restore-${timestamp}`. */
  forkName?: string;
  config?: TigrisAIConfig;
};

export type RestoreResult = {
  bucket: string;
};

export type ListCheckpointsOptions = {
  limit?: number;
  paginationToken?: string;
  config?: TigrisAIConfig;
};

export type ListCheckpointsResult = {
  checkpoints: Checkpoint[];
  paginationToken?: string;
};

// -- Functions --

export async function checkpoint(
  bucket: string,
  options?: CheckpointOptions
): Promise<TigrisResponse<Checkpoint>> {
  const storageConfig = toStorageConfig(options?.config);

  const result = await createBucketSnapshot(bucket, {
    name: options?.name,
    config: storageConfig,
  });

  if (result.error) {
    return {
      error: new Error(
        `Failed to checkpoint bucket "${bucket}": ${result.error.message}`
      ),
    };
  }

  return {
    data: {
      snapshotId: result.data.snapshotVersion,
      name: options?.name,
      createdAt: new Date(),
    },
  };
}

export async function restore(
  bucket: string,
  snapshotId: string,
  options?: RestoreOptions
): Promise<TigrisResponse<RestoreResult>> {
  const storageConfig = toStorageConfig(options?.config);
  const forkName = options?.forkName ?? `${bucket}-restore-${Date.now()}`;

  const result = await createBucket(forkName, {
    sourceBucketName: bucket,
    sourceBucketSnapshot: snapshotId,
    config: storageConfig,
  });

  if (result.error) {
    return {
      error: new Error(
        `Failed to restore from snapshot "${snapshotId}": ${result.error.message}`
      ),
    };
  }

  return {
    data: { bucket: forkName },
  };
}

export async function listCheckpoints(
  bucket: string,
  options?: ListCheckpointsOptions
): Promise<TigrisResponse<ListCheckpointsResult>> {
  const storageConfig = toStorageConfig(options?.config);

  const result = await listBucketSnapshots(bucket, {
    limit: options?.limit,
    paginationToken: options?.paginationToken,
    config: storageConfig,
  });

  if (result.error) {
    return {
      error: new Error(
        `Failed to list checkpoints for "${bucket}": ${result.error.message}`
      ),
    };
  }

  return {
    data: {
      checkpoints: result.data.snapshots
        .filter((s) => s.version != null)
        .map((s) => ({
          snapshotId: s.version!,
          name: s.name,
          createdAt: s.creationDate,
        })),
      paginationToken: result.data.paginationToken,
    },
  };
}
