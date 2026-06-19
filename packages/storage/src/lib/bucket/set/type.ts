import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import { getBucketInfo } from '../info';
import type { UpdateBucketResponse } from '../types';
import { setBucketSettings } from './set';

export enum BucketTypes {
  Regular = 0,
  Snapshot = 1,
}

export type SetBucketTypeOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function setBucketType(
  bucketName: string,
  type: BucketTypes,
  options?: SetBucketTypeOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  return setBucketSettings(bucketName, {
    body: { type },
    config: options?.config,
  });
}

export type BucketSnapshotOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function enableSnapshot(
  bucketName: string,
  options?: BucketSnapshotOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  return setBucketType(bucketName, BucketTypes.Snapshot, options);
}

export async function disableSnapshot(
  bucketName: string,
  options?: BucketSnapshotOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { data } = await getBucketInfo(bucketName, options);

  if (data?.forkInfo?.hasChildren === true) {
    return {
      error: new Error(
        'Bucket type cannot be changed from Snapshot to Regular while it has dependent forks'
      ),
    };
  }

  return setBucketType(bucketName, BucketTypes.Regular, options);
}
