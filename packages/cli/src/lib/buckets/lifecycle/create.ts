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

const context = msg('buckets lifecycle', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const name = getOption<string>(options, ['name']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const input = readRuleInput(options);

  const validationError = validateRuleFieldCombinations(input);
  if (validationError) {
    failWithError(context, validationError);
  }

  const transition = transitionDeltaFromInput(input);
  const expiration = expirationFromInput(input);

  if (!transition.storageClass && !expiration) {
    failWithError(
      context,
      'A new rule must include a transition (--storage-class with --days or --date) and/or an expiration (--expire-days or --expire-date)'
    );
  }

  // A transition requires both a target class and timing. The shared
  // validator covers timing-without-class; this check covers the
  // inverse (--storage-class without --days/--date) which only applies
  // to create.
  if (
    transition.storageClass &&
    input.days === undefined &&
    input.date === undefined
  ) {
    failWithError(
      context,
      '--storage-class requires --days or --date for a new transition rule'
    );
  }

  const enabled = enabledFromInput(input);

  const config = await getStorageConfigWithOrg();
  const existing = await fetchExistingRules(context, name, config);

  const newRule: BucketLifecycleRule = {
    ...transition,
    ...(expiration ? { expiration } : {}),
    ...(input.prefix !== undefined ? { filter: { prefix: input.prefix } } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  };

  await submitRules(context, name, [...existing, newRule], config);

  // Re-fetch to find the newly assigned id (server generates UUIDs).
  const after = await fetchExistingRules(context, name, config);
  const created = after.find((r) => !existing.some((e) => e.id === r.id));
  const createdId = created?.id ?? '(unknown)';

  if (format === 'json') {
    console.log(
      JSON.stringify({ action: 'created', bucket: name, id: createdId })
    );
  }

  printSuccess(context, { name, id: createdId });
}
