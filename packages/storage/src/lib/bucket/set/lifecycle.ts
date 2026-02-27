import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import { setBucketSettings, type UpdateBucketResponse } from './set';
import { getBucketInfo } from '../info';
import { buildLifecycleRules } from '../utils/lifecycle';
import { validateDays, validateAndFormatDate } from '../utils/date';
import { BucketLifecycleRule } from '../types';

export type SetBucketLifecycleOptions = {
  lifecycleRules: BucketLifecycleRule[];
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

export async function setBucketLifecycle(
  bucketName: string,
  options?: SetBucketLifecycleOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  if (options?.lifecycleRules === undefined) {
    return {
      error: new Error('No lifecycle rules provided'),
    };
  }

  if (options.lifecycleRules.length === 0) {
    return {
      error: new Error('No lifecycle rules provided'),
    };
  }

  if (options.lifecycleRules.length > 1) {
    return {
      error: new Error('Only one lifecycle transition rule is allowed'),
    };
  }

  const rule = options.lifecycleRules[0];

  if (rule.date !== undefined && rule.days !== undefined) {
    return {
      error: new Error(
        'Cannot specify both date and days for a lifecycle rule'
      ),
    };
  }

  if (
    rule.date === undefined &&
    rule.days === undefined &&
    rule.enabled === undefined &&
    rule.storageClass === undefined
  ) {
    return {
      error: new Error('No lifecycle rule configuration provided'),
    };
  }

  if (rule.days !== undefined) {
    const daysError = validateDays(rule.days);
    if (daysError) {
      return { error: new Error(`Lifecycle rule ${daysError}`) };
    }
  }

  if (rule.date !== undefined) {
    const dateResult = validateAndFormatDate(rule.date);
    if ('error' in dateResult) {
      return { error: new Error(`Lifecycle rule ${dateResult.error}`) };
    }
    rule.date = dateResult.value;
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
    { lifecycleRules: options.lifecycleRules }
  );

  if (lifecycleError) {
    return { error: lifecycleError };
  }

  return setBucketSettings(bucketName, {
    body: { lifecycle_rules: rules },
    config: options.config,
  });
}
