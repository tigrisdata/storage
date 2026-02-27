import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import type { UpdateBucketResponse } from '../types';
import { setBucketSettings } from './set';
import { getBucketInfo } from '../info';
import { buildLifecycleRules } from '../utils/lifecycle';
import { validateDays, validateAndFormatDate } from '../utils/date';
import { BucketTtl } from '../types';

export type SetBucketTtlOptions = {
  ttlConfig?: BucketTtl;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function setBucketTtl(
  bucketName: string,
  options?: SetBucketTtlOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  if (options?.ttlConfig === undefined) {
    return {
      error: new Error('No TTL configuration provided'),
    };
  }

  if (
    options.ttlConfig.date !== undefined &&
    options.ttlConfig.days !== undefined
  ) {
    return {
      error: new Error(
        'Cannot specify both date and days for TTL configuration'
      ),
    };
  }

  if (
    options.ttlConfig.date === undefined &&
    options.ttlConfig.days === undefined &&
    options.ttlConfig.enabled === undefined
  ) {
    return {
      error: new Error('No TTL configuration provided'),
    };
  }

  if (options.ttlConfig.days !== undefined) {
    const daysError = validateDays(options.ttlConfig.days);
    if (daysError) {
      return { error: new Error(`TTL ${daysError}`) };
    }
  }

  if (options.ttlConfig.date !== undefined) {
    const dateResult = validateAndFormatDate(options.ttlConfig.date);
    if ('error' in dateResult) {
      return { error: new Error(`TTL ${dateResult.error}`) };
    }
    options.ttlConfig.date = dateResult.value;
  }

  const { data, error } = await getBucketInfo(bucketName, {
    config: options.config,
  });

  if (error) {
    return { error };
  }

  const { rules, error: lifecycleError } = buildLifecycleRules(
    {
      ttlConfig: data?.settings.ttlConfig,
      lifecycleRules: data?.settings.lifecycleRules,
    },
    { ttlConfig: options.ttlConfig }
  );

  if (lifecycleError) {
    return { error: lifecycleError };
  }

  return setBucketSettings(bucketName, {
    body: { lifecycle_rules: rules },
    config: options.config,
  });
}
