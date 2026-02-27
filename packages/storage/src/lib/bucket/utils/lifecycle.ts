import type { BucketLifecycleRule, BucketTtl } from '../types';
import type {
  UpdateBucketBody,
  UpdateBucketBodyLifecycleStatus,
} from '../set/set';

type LifecycleRuleBody = NonNullable<UpdateBucketBody['lifecycle_rules']>[number];

/**
 * Builds the `lifecycle_rules` array for the API request body.
 * Merges new TTL/transition config with existing rules, preserving
 * rules that aren't being updated.
 *
 * Constraints:
 * - Max 2 rules: 1 TTL (expiration) + 1 transition rule
 * - A transition rule can only have a single transition
 * - Updating TTL replaces the existing TTL rule (preserving its ID)
 * - Updating lifecycle replaces the existing transition rule (preserving its ID)
 */
export function buildLifecycleRules(
  existing: {
    ttlConfig?: BucketTtl;
    lifecycleRules?: BucketLifecycleRule[];
  },
  update: {
    ttlConfig?: BucketTtl;
    lifecycleRules?: BucketLifecycleRule[];
  }
): {
  rules?: NonNullable<UpdateBucketBody['lifecycle_rules']>;
  error?: Error;
} {
  const existingTtl = existing.ttlConfig;
  const existingTransition = existing.lifecycleRules?.[0];

  const rules: LifecycleRuleBody[] = [];

  // TTL rule: use new config if provided, otherwise preserve existing
  // If only `enabled` is provided (no days/date), toggle the existing rule
  if (update.ttlConfig !== undefined) {
    const isToggleOnly =
      update.ttlConfig.days === undefined &&
      update.ttlConfig.date === undefined;

    if (isToggleOnly && !existingTtl) {
      return { error: new Error('No existing TTL configuration found to update') };
    }

    rules.push(formatTtlRule(update.ttlConfig, existingTtl));
  } else if (existingTtl) {
    rules.push(formatTtlRule({}, existingTtl));
  }

  // Transition rule: use new config if provided, otherwise preserve existing
  // Only 1 rule with 1 transition allowed
  if (update.lifecycleRules !== undefined && update.lifecycleRules.length > 0) {
    rules.push(formatTransitionRule(update.lifecycleRules[0], existingTransition));
  } else if (existingTransition) {
    rules.push(formatTransitionRule({}, existingTransition));
  }

  return { rules: rules.length > 0 ? rules : undefined };
}

function toStatus(enabled: boolean): UpdateBucketBodyLifecycleStatus {
  return enabled ? 1 : 2;
}

function formatTtlRule(
  ttl: BucketTtl,
  existing?: BucketTtl
): LifecycleRuleBody {
  const enabled = ttl.enabled ?? existing?.enabled ?? true;
  return {
    id: existing?.id ?? ttl.id ?? crypto.randomUUID(),
    expiration: {
      ...(ttl.days !== undefined
        ? { days: ttl.days }
        : ttl.date !== undefined
          ? {}
          : existing?.days !== undefined
            ? { days: existing.days }
            : undefined),
      ...(ttl.date !== undefined
        ? { date: ttl.date }
        : ttl.days !== undefined
          ? {}
          : existing?.date !== undefined
            ? { date: existing.date }
            : undefined),
      enabled,
    },
    status: toStatus(enabled),
  };
}

function formatTransitionRule(
  rule: BucketLifecycleRule,
  existing?: BucketLifecycleRule
): LifecycleRuleBody {
  const enabled = rule.enabled ?? existing?.enabled ?? true;
  const storageClass = rule.storageClass ?? existing?.storageClass;
  return {
    id: existing?.id ?? rule.id ?? crypto.randomUUID(),
    transitions: storageClass !== undefined ? [{
      storage_class: storageClass,
      ...(rule.days !== undefined
        ? { days: rule.days }
        : rule.date !== undefined
          ? {}
          : existing?.days !== undefined
            ? { days: existing.days }
            : undefined),
      ...(rule.date !== undefined
        ? { date: rule.date }
        : rule.days !== undefined
          ? {}
          : existing?.date !== undefined
            ? { date: existing.date }
            : undefined),
    }] : undefined,
    status: toStatus(enabled),
  };
}
