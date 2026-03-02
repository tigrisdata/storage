import { getOption } from '../../utils/options';
import enquirer from 'enquirer';
import { getArgumentSpec, buildPromptChoices } from '../../utils/specs.js';
import { StorageClass, createBucket } from '@tigrisdata/storage';
import { getStorageConfig } from '../../auth/s3-client';
import {
  parseLocations,
  multiRegionChoices,
  singleRegionChoices,
} from '../../utils/locations.js';
import type { BucketLocations } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const { prompt } = enquirer;

const context = msg('buckets', 'create');

export default async function create(options: Record<string, unknown>) {
  printStart(context);

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

    // Location selection: type first, then region(s) based on type
    const { locationType } = await prompt<{ locationType: string }>({
      type: 'select',
      name: 'locationType',
      message: 'Location type:',
      choices: [
        { name: 'global', message: 'Global' },
        { name: 'multi', message: 'Multi-region (USA or Europe)' },
        { name: 'dual', message: 'Dual region' },
        { name: 'single', message: 'Single region' },
      ],
    });

    if (locationType === 'global') {
      parsedLocations = { type: 'global' };
    } else if (locationType === 'multi') {
      const { region } = await prompt<{ region: string }>({
        type: 'select',
        name: 'region',
        message: 'Multi-region:',
        choices: multiRegionChoices.map((c) => ({
          name: c.value,
          message: c.name,
        })),
      });
      parsedLocations = parseLocations(region);
    } else if (locationType === 'single') {
      const { region } = await prompt<{ region: string }>({
        type: 'select',
        name: 'region',
        message: 'Region:',
        choices: singleRegionChoices.map((c) => ({
          name: c.value,
          message: c.name,
        })),
      });
      parsedLocations = parseLocations(region);
    } else {
      const { regions } = await prompt<{ regions: string[] }>({
        type: 'multiselect',
        name: 'regions',
        message:
          'Press space key to select regions (multiple supported) and enter to confirm:',
        choices: singleRegionChoices.map((c) => ({
          name: c.value,
          message: c.name,
        })),
      } as Parameters<typeof prompt>[0]);
      if (regions.length === 0) {
        printFailure(context, 'At least one region is required');
        process.exit(1);
      }
      parsedLocations = parseLocations(regions);
    }
  }

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const { error } = await createBucket(name, {
    defaultTier: (defaultTier ?? 'STANDARD') as StorageClass,
    enableSnapshot: enableSnapshots === true,
    access: (access ?? 'private') as 'public' | 'private',
    locations: parsedLocations ?? parseLocations(locations ?? 'global'),
    config: await getStorageConfig(),
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name });
}
