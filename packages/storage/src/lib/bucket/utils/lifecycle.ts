import type { BucketLifecycleRule, BucketTtl } from '../types';
import type { UpdateBucketBody } from './api';

type LifecycleRuleBody = NonNullable<
  UpdateBucketBody['lifecycle_rules']
>[number];

type TransitionBody = NonNullable<LifecycleRuleBody['transitions']>[number];
type ExpirationBody = NonNullable<LifecycleRuleBody['expiration']>;

/**
 * Builds the `lifecycle_rules` array for the API request body.
 *
 * Model:
 * - A rule may carry at most one transition (top-level `storageClass` +
 *   `days`/`date`), optionally an `expiration`, and optionally a
 *   `filter.prefix`. At least one of transition or expiration must be
 *   present.
 * - `existing.ttlConfig` and `existing.lifecycleRules` must be disjoint:
 *   if a TTL-only rule is also present in `lifecycleRules`, callers must
 *   filter it out before passing in (`setBucketTtl` does this).
 * - Update rules are merged into existing rules by `id`. As a back-compat
 *   convenience, a single no-id update rule auto-matches the only
 *   shape-compatible existing rule (when exactly one exists).
 * - Existing rules not matched by any update rule are preserved unchanged.
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
  const existingLifecycleRules = existing.lifecycleRules ?? [];
  const updateLifecycleRules = update.lifecycleRules;

  const rules: LifecycleRuleBody[] = [];

  if (update.ttlConfig !== undefined) {
    const isToggleOnly =
      update.ttlConfig.days === undefined &&
      update.ttlConfig.date === undefined;

    if (isToggleOnly && !existingTtl) {
      return {
        error: new Error('No existing TTL configuration found to update'),
      };
    }

    rules.push(formatTtlRule(update.ttlConfig, existingTtl));
  } else if (existingTtl) {
    rules.push(formatTtlRule({}, existingTtl));
  }

  if (updateLifecycleRules !== undefined && updateLifecycleRules.length > 0) {
    const matchedExisting = new Set<BucketLifecycleRule>();

    for (const updateRule of updateLifecycleRules) {
      let existingMatch: BucketLifecycleRule | undefined;
      if (updateRule.id !== undefined) {
        existingMatch = existingLifecycleRules.find(
          (e) => e.id === updateRule.id
        );
      } else if (updateLifecycleRules.length === 1) {
        // Auto-match a single no-id update to the only shape-compatible
        // existing rule, when there is exactly one such rule. This
        // preserves the back-compat path for "single transition rule on
        // bucket" without picking up TTL-only or other-shaped rules.
        const compatibleExisting = existingLifecycleRules.filter((e) =>
          rulesAreShapeCompatible(updateRule, e)
        );
        if (compatibleExisting.length === 1) {
          existingMatch = compatibleExisting[0];
        }
      }

      const hasContent = ruleHasContent(updateRule);
      if (!hasContent && !existingMatch) {
        return {
          error: new Error('No existing lifecycle rule found to update'),
        };
      }

      if (existingMatch !== undefined) {
        matchedExisting.add(existingMatch);
      }

      const built = formatLifecycleRule(updateRule, existingMatch);
      // If the user supplied transition fields but the merge couldn't
      // resolve a `storage_class`, surface that — otherwise the
      // `days`/`date` they provided would be silently dropped (the rule
      // would still pass `validateBuiltRule` if it carries an expiration).
      const userWantsTransition =
        updateRule.storageClass !== undefined ||
        updateRule.days !== undefined ||
        updateRule.date !== undefined;
      if (
        userWantsTransition &&
        (built.transitions === undefined || built.transitions.length === 0)
      ) {
        return {
          error: new Error('Lifecycle transition requires `storageClass`'),
        };
      }

      rules.push(built);
    }

    // Preserve every unmatched existing rule, even those without an id.
    for (const existingRule of existingLifecycleRules) {
      if (!matchedExisting.has(existingRule)) {
        rules.push(formatLifecycleRule({}, existingRule));
      }
    }
  } else {
    for (const existingRule of existingLifecycleRules) {
      rules.push(formatLifecycleRule({}, existingRule));
    }
  }

  for (const rule of rules) {
    const error = validateBuiltRule(rule);
    if (error) return { error };
  }

  return { rules: rules.length > 0 ? rules : undefined };
}

function toStatus(enabled: boolean): 1 | 2 {
  return enabled ? 1 : 2;
}

/**
 * Final-shape validation for a built rule. A rule must carry either a
 * complete transition (with `storage_class` and either `days` or `date`)
 * or a complete `expiration` (with either `days` or `date`).
 */
function validateBuiltRule(rule: LifecycleRuleBody): Error | undefined {
  const transitions = rule.transitions ?? [];
  const expiration = rule.expiration;

  if (transitions.length === 0 && expiration === undefined) {
    return new Error('Lifecycle rule must have a transition or expiration');
  }

  for (const t of transitions) {
    if (t.days === undefined && t.date === undefined) {
      return new Error('Lifecycle transition requires either `days` or `date`');
    }
  }

  if (
    expiration !== undefined &&
    expiration.days === undefined &&
    expiration.date === undefined
  ) {
    return new Error('Lifecycle expiration requires either `days` or `date`');
  }

  return undefined;
}

function ruleHasContent(rule: BucketLifecycleRule): boolean {
  // Filter alone is not enough — need a transition or expiration.
  return (
    rule.storageClass !== undefined ||
    rule.days !== undefined ||
    rule.date !== undefined ||
    rule.expiration !== undefined
  );
}

/**
 * Auto-matching a no-id update rule to a single existing rule is only safe
 * when the update doesn't introduce a content kind (transition / expiration)
 * that the existing rule lacks — otherwise we'd silently merge, e.g., a
 * transition update into a TTL-only rule. Toggle/filter-only updates remain
 * compatible with any existing rule.
 */
function rulesAreShapeCompatible(
  update: BucketLifecycleRule,
  existing: BucketLifecycleRule
): boolean {
  const updateHasTransition =
    update.storageClass !== undefined ||
    update.days !== undefined ||
    update.date !== undefined;
  const existingHasTransition =
    existing.storageClass !== undefined ||
    existing.days !== undefined ||
    existing.date !== undefined;

  if (updateHasTransition && !existingHasTransition) return false;
  if (update.expiration !== undefined && existing.expiration === undefined) {
    return false;
  }
  return true;
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

function formatLifecycleRule(
  rule: BucketLifecycleRule,
  existing?: BucketLifecycleRule
): LifecycleRuleBody {
  const enabled = rule.enabled ?? existing?.enabled ?? true;
  const transition = resolveTransition(rule, existing);
  const expiration = resolveExpiration(rule, existing, enabled);
  const filter = rule.filter ?? existing?.filter;

  return {
    id: existing?.id ?? rule.id ?? crypto.randomUUID(),
    ...(transition !== undefined ? { transitions: [transition] } : undefined),
    ...(expiration !== undefined ? { expiration } : undefined),
    ...(filter !== undefined
      ? { filter: { prefix: filter.prefix } }
      : undefined),
    status: toStatus(enabled),
  };
}

function resolveTransition(
  rule: BucketLifecycleRule,
  existing?: BucketLifecycleRule
): TransitionBody | undefined {
  const hasUpdate =
    rule.storageClass !== undefined ||
    rule.days !== undefined ||
    rule.date !== undefined;

  if (hasUpdate) {
    const storageClass = rule.storageClass ?? existing?.storageClass;
    if (storageClass === undefined) {
      return undefined;
    }
    return {
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
    };
  }

  // Toggle / filter-only / expiration-only update — preserve existing transition.
  if (existing?.storageClass !== undefined) {
    return {
      storage_class: existing.storageClass,
      ...(existing.days !== undefined ? { days: existing.days } : {}),
      ...(existing.date !== undefined ? { date: existing.date } : {}),
    };
  }
  return undefined;
}

function resolveExpiration(
  rule: BucketLifecycleRule,
  existing: BucketLifecycleRule | undefined,
  enabled: boolean
): ExpirationBody | undefined {
  const source = rule.expiration ?? existing?.expiration;
  if (source === undefined) return undefined;
  return {
    ...(source.days !== undefined ? { days: source.days } : {}),
    ...(source.date !== undefined ? { date: source.date } : {}),
    enabled,
  };
}
