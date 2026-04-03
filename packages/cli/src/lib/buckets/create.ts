import { getStorageConfig } from '@auth/provider.js';
import type { BucketLocations, StorageClass } from '@tigrisdata/storage';
import { createBucket } from '@tigrisdata/storage';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { requireInteractive } from '@utils/interactive.js';
import { parseLocations, promptLocations } from '@utils/locations.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { buildPromptChoices, getArgumentSpec } from '@utils/specs.js';
import enquirer from 'enquirer';

const { prompt } = enquirer;

const context = msg('buckets', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  let name = getOption<string>(options, ['name']);
  const isPublic = getOption<boolean>(options, ['public']);
  let access = isPublic
    ? 'public'
    : getOption<string>(options, ['access', 'a', 'A']);
  let enableSnapshots = getOption<boolean>(options, [
    'enable-snapshots',
    's',
    'S',
  ]);
  let defaultTier = getOption<string>(options, ['default-tier', 't', 'T']);
  let locations = getOption<string>(options, ['locations', 'l', 'L']);
  const forkOf = getOption<string>(options, ['fork-of', 'forkOf', 'fork']);
  const sourceSnapshot = getOption<string>(options, [
    'source-snapshot',
    'sourceSnapshot',
    'source-snap',
  ]);

  // Handle deprecated --region and --consistency options
  const deprecatedRegion = getOption<string>(options, ['region', 'r', 'R']);
  const deprecatedConsistency = getOption<string>(options, [
    'consistency',
    'c',
    'C',
  ]);
  if (deprecatedRegion !== undefined) {
    console.warn(
      'Warning: --region is deprecated, use --locations instead. See https://www.tigrisdata.com/docs/buckets/locations/'
    );
    if (locations === undefined) {
      locations = deprecatedRegion;
    }
  }
  if (deprecatedConsistency !== undefined) {
    console.warn(
      'Warning: --consistency is deprecated, use --locations instead. See https://www.tigrisdata.com/docs/buckets/locations/'
    );
  }

  // Interactive mode: prompt for all values when no name is provided.
  const interactive = !name;

  let parsedLocations: BucketLocations | undefined;

  if (interactive) {
    requireInteractive('Provide --name to skip interactive mode');

    const accessSpec = getArgumentSpec('buckets', 'access', 'create');
    const accessChoices = buildPromptChoices(accessSpec!);
    const accessDefault = accessChoices?.findIndex(
      (c) => c.value === accessSpec?.default
    );

    const tierSpec = getArgumentSpec('buckets', 'default-tier', 'create');
    const tierChoices = buildPromptChoices(tierSpec!);
    const tierDefault = tierChoices?.findIndex(
      (c) => c.value === tierSpec?.default
    );

    const responses = await prompt<{
      name: string;
      access: string;
      defaultTier: string;
      enableSnapshots: boolean;
    }>([
      {
        type: 'input',
        name: 'name',
        message: 'Bucket name:',
        required: true,
      },
      {
        type: 'select',
        name: 'access',
        message: 'Access level:',
        choices: accessChoices || [],
        initial:
          accessDefault !== undefined && accessDefault >= 0 ? accessDefault : 0,
      },
      {
        type: 'select',
        name: 'defaultTier',
        message: 'Default storage tier:',
        choices: tierChoices || [],
        initial:
          tierDefault !== undefined && tierDefault >= 0 ? tierDefault : 0,
      },
      {
        type: 'confirm',
        name: 'enableSnapshots',
        message: 'Enable snapshots?',
        initial: true,
      },
    ]);

    name = responses.name;
    access = responses.access;
    defaultTier = responses.defaultTier;
    enableSnapshots = responses.enableSnapshots;

    try {
      parsedLocations = await promptLocations();
    } catch (err) {
      failWithError(context, err);
    }
  }

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  if (sourceSnapshot && !forkOf) {
    failWithError(context, '--source-snapshot requires --fork-of');
  }

  const { error } = await createBucket(name, {
    defaultTier: (defaultTier ?? 'STANDARD') as StorageClass,
    enableSnapshot: enableSnapshots === true,
    access: (access ?? 'private') as 'public' | 'private',
    locations: parsedLocations ?? parseLocations(locations ?? 'global'),
    ...(forkOf ? { sourceBucketName: forkOf } : {}),
    ...(sourceSnapshot ? { sourceBucketSnapshot: sourceSnapshot } : {}),
    config: await getStorageConfig(),
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { name });
    const output: Record<string, unknown> = {
      action: 'created',
      name,
      ...(forkOf ? { forkOf } : {}),
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  printSuccess(context, { name });
  printNextActions(context, { name });
}
