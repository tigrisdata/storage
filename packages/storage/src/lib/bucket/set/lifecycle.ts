import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import { getBucketInfo } from '../info';
import type { BucketLifecycleRule, UpdateBucketResponse } from '../types';
import { validateAndFormatDate, validateDays } from '../utils/date';
import { buildLifecycleRules } from '../utils/lifecycle';
import { setBucketSettings } from './set';

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

  // Shallow-clone every rule (and its expiration) so date normalization
  // doesn't mutate the caller's options.
  const rules: BucketLifecycleRule[] = options.lifecycleRules.map((input) => ({
    ...input,
    expiration:
      input.expiration !== undefined ? { ...input.expiration } : undefined,
  }));

  for (const rule of rules) {
    const validationError = validateRule(rule);
    if (validationError) return { error: validationError };
  }

  const { data, error } = await getBucketInfo(bucketName, {
    config: options.config,
  });

  if (error) {
    return { error };
  }

  const { rules: builtRules, error: lifecycleError } = buildLifecycleRules(
    {
      lifecycleRules: data?.settings.lifecycleRules,
    },
    { lifecycleRules: rules }
  );

  if (lifecycleError) {
    return { error: lifecycleError };
  }

  return setBucketSettings(bucketName, {
    body: { lifecycle_rules: builtRules },
    config: options.config,
  });
}

function validateRule(rule: BucketLifecycleRule): Error | undefined {
  const hasTransition =
    rule.storageClass !== undefined ||
    rule.days !== undefined ||
    rule.date !== undefined;
  const hasExpiration = rule.expiration !== undefined;

  if (
    !hasTransition &&
    !hasExpiration &&
    rule.enabled === undefined &&
    rule.filter === undefined
  ) {
    return new Error('No lifecycle rule configuration provided');
  }

  // A rule with no transition and no expiration must target an existing
  // rule by `id` — filter-only or toggle-only inputs without an id have
  // nothing to act on.
  if (!hasTransition && !hasExpiration && rule.id === undefined) {
    return new Error(
      'Lifecycle rule requires a transition or expiration when no `id` is provided'
    );
  }

  if (hasTransition) {
    if (rule.date !== undefined && rule.days !== undefined) {
      return new Error(
        'Cannot specify both date and days for a lifecycle transition'
      );
    }
    if (rule.days !== undefined) {
      const daysError = validateDays(rule.days);
      if (daysError) return new Error(`Lifecycle transition ${daysError}`);
    }
    if (rule.date !== undefined) {
      const dateResult = validateAndFormatDate(rule.date);
      if ('error' in dateResult) {
        return new Error(`Lifecycle transition ${dateResult.error}`);
      }
      rule.date = dateResult.value;
    }
  }

  if (hasExpiration) {
    const expiration = rule.expiration!;
    if (expiration.date !== undefined && expiration.days !== undefined) {
      return new Error(
        'Cannot specify both date and days for a lifecycle expiration'
      );
    }
    if (expiration.days === undefined && expiration.date === undefined) {
      return new Error('Lifecycle expiration requires either days or date');
    }
    if (expiration.days !== undefined) {
      const daysError = validateDays(expiration.days);
      if (daysError) return new Error(`Lifecycle expiration ${daysError}`);
    }
    if (expiration.date !== undefined) {
      const dateResult = validateAndFormatDate(expiration.date);
      if ('error' in dateResult) {
        return new Error(`Lifecycle expiration ${dateResult.error}`);
      }
      expiration.date = dateResult.value;
    }
  }

  if (rule.filter !== undefined && typeof rule.filter.prefix !== 'string') {
    return new Error('Lifecycle rule filter.prefix must be a string');
  }

  return undefined;
}
