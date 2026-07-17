import { getStorageConfigWithOrg } from '@auth/provider.js';
import type { BucketLifecycleRule } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import {
  enabledFromInput,
  expirationFromInput,
  fetchExistingRules,
  readRuleInput,
  submitRules,
  transitionDeltaFromInput,
  validateRuleFieldCombinations,
} from './shared.js';

const context = msg('buckets lifecycle', 'edit');

export default async function edit(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const name = getOption<string>(options, ['name']);
  const id = getOption<string>(options, ['id']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }
  if (!id) {
    failWithError(context, 'Rule id is required');
  }

  const input = readRuleInput(options);

  // Edit defers the "transition needs a storage class" check until
  // after we fetch the target — the existing rule may already supply
  // one, in which case `--days 60` alone is valid.
  const validationError = validateRuleFieldCombinations(input, {
    requireStorageClassForTiming: false,
  });
  if (validationError) {
    failWithError(context, validationError);
  }

  const transition = transitionDeltaFromInput(input);
  const expiration = expirationFromInput(input);
  const enabled = enabledFromInput(input);

  const hasAnyChange =
    transition.storageClass !== undefined ||
    transition.days !== undefined ||
    transition.date !== undefined ||
    expiration !== undefined ||
    enabled !== undefined ||
    input.prefix !== undefined;

  if (!hasAnyChange) {
    failWithError(
      context,
      'Provide at least one field to change (--storage-class, --days, --date, --expire-days, --expire-date, --prefix, --enable, --disable)'
    );
  }

  const config = await getStorageConfigWithOrg();
  const existing = await fetchExistingRules(context, name, config);

  const target = existing.find((r) => r.id === id);
  if (!target) {
    failWithError(
      context,
      `No lifecycle rule with id "${id}" found. Run \`tigris buckets lifecycle list ${name}\` to see ids.`
    );
  }

  // If the user touched any transition field, the merged rule must
  // still have both a storage class and timing. Otherwise the API
  // accepts the rule but silently drops the transition.
  const userTouchedTransition =
    input.storageClass !== undefined ||
    input.days !== undefined ||
    input.date !== undefined;

  if (userTouchedTransition) {
    const finalStorageClass = transition.storageClass ?? target.storageClass;
    const finalDays =
      input.days !== undefined
        ? Number(input.days)
        : input.date !== undefined
          ? undefined
          : target.days;
    const finalDate =
      input.date !== undefined
        ? input.date
        : input.days !== undefined
          ? undefined
          : target.date;

    if (!finalStorageClass) {
      failWithError(
        context,
        '--storage-class is required (this rule has no existing transition target)'
      );
    }
    if (finalDays === undefined && finalDate === undefined) {
      failWithError(
        context,
        '--days or --date is required (this rule has no existing transition timing)'
      );
    }
  }

  const updated: BucketLifecycleRule = {
    ...target,
    ...transition,
    ...(expiration ? { expiration } : {}),
    ...(input.prefix !== undefined ? { filter: { prefix: input.prefix } } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  };

  const merged = existing.map((r) => (r.id === id ? updated : r));

  await submitRules(context, name, merged, config);

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', bucket: name, id }));
  }

  printSuccess(context, { name, id });
}
