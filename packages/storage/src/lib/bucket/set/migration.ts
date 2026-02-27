import { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import { BucketMigration } from '../types';
import {
  setBucketSettings,
  SetBucketSettingsOptions,
  UpdateBucketResponse,
} from './set';

export type SetBucketMigrationOptions = {
  dataMigration?: BucketMigration;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function setBucketMigration(
  bucketName: string,
  options?: SetBucketMigrationOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const body: SetBucketSettingsOptions['body'] = {};
  if (options?.dataMigration !== undefined) {
    if (!options.dataMigration.enabled) {
      body.shadow_bucket = {};
    } else {
      if (
        options.dataMigration.accessKey &&
        options.dataMigration.secretKey &&
        options.dataMigration.region &&
        options.dataMigration.name &&
        options.dataMigration.endpoint
      ) {
        body.shadow_bucket = {
          access_key: options.dataMigration.accessKey,
          secret_key: options.dataMigration.secretKey,
          region: options.dataMigration.region,
          name: options.dataMigration.name,
          endpoint: options.dataMigration.endpoint,
          write_through: !!options.dataMigration.writeThrough,
        };
      } else {
        return {
          error: new Error('Missing required data migration fields'),
        };
      }
    }
  }

  if (Object.keys(body).length === 0) {
    return {
      error: new Error('No data migration settings provided'),
    };
  }

  return setBucketSettings(bucketName, { body, config: options?.config });
}
