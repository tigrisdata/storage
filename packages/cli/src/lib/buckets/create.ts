import { getOption } from '../../utils/options';
import enquirer from 'enquirer';
import { getArgumentSpec, buildPromptChoices } from '../../utils/specs.js';
import { StorageClass, createBucket } from '@tigrisdata/storage';
import { getStorageConfig } from '../../auth/s3-client';
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

  // Check if user provided any actual arguments
  // Commander auto-fills defaults, so we need to check if user explicitly provided values
  // The only way to know is if name (positional, no default) is provided
  const promptAll = !getOption<string>(options, ['name']);

  // Extract all options from specs.yaml
  let name = getOption<string>(options, ['name']);
  let access = promptAll
    ? undefined
    : getOption<string>(options, ['access', 'a', 'A']);
  let enableSnapshots = promptAll
    ? undefined
    : getOption<boolean>(options, ['enable-snapshots', 's', 'S']);
  let defaultTier = promptAll
    ? undefined
    : getOption<string>(options, ['default-tier', 't', 'T']);
  let consistency = promptAll
    ? undefined
    : getOption<string>(options, ['consistency', 'c', 'C']);
  let region = promptAll
    ? undefined
    : getOption<string>(options, ['region', 'r', 'R']);

  // Build interactive prompts for missing parameters
  const questions: Array<{
    type: string;
    name: string;
    message: string;
    required?: boolean;
    choices?: Array<{ name: string; message: string; value: string }>;
    initial?: number | boolean | string;
  }> = [];

  if (!name || promptAll) {
    questions.push({
      type: 'input',
      name: 'name',
      message: 'Bucket name:',
      required: true,
    });
  }

  if (!access || promptAll) {
    const accessSpec = getArgumentSpec('buckets', 'access', 'create');
    const choices = buildPromptChoices(accessSpec!);
    const defaultIndex = choices?.findIndex(
      (c) => c.value === accessSpec?.default
    );
    questions.push({
      type: 'select',
      name: 'access',
      message: 'Access level:',
      choices: choices || [],
      initial:
        defaultIndex !== undefined && defaultIndex >= 0 ? defaultIndex : 0,
    });
  }

  if (!defaultTier || promptAll) {
    const tierSpec = getArgumentSpec('buckets', 'default-tier', 'create');
    const choices = buildPromptChoices(tierSpec!);
    const defaultIndex = choices?.findIndex(
      (c) => c.value === tierSpec?.default
    );
    questions.push({
      type: 'select',
      name: 'defaultTier',
      message: 'Default storage tier:',
      choices: choices || [],
      initial:
        defaultIndex !== undefined && defaultIndex >= 0 ? defaultIndex : 0,
    });
  }

  if (!consistency || promptAll) {
    const consistencySpec = getArgumentSpec('buckets', 'consistency', 'create');
    const choices = buildPromptChoices(consistencySpec!);
    const defaultIndex = choices?.findIndex(
      (c) => c.value === consistencySpec?.default
    );
    questions.push({
      type: 'select',
      name: 'consistency',
      message: 'Consistency level:',
      choices: choices || [],
      initial:
        defaultIndex !== undefined && defaultIndex >= 0 ? defaultIndex : 0,
    });
  }

  if (!region || promptAll) {
    const regionSpec = getArgumentSpec('buckets', 'region', 'create');
    const choices = buildPromptChoices(regionSpec!);
    const defaultIndex = choices?.findIndex(
      (c) => c.value === regionSpec?.default
    );
    questions.push({
      type: 'select',
      name: 'region',
      message: 'Region:',
      choices: choices || [],
      initial:
        defaultIndex !== undefined && defaultIndex >= 0 ? defaultIndex : 0,
    });
  }

  if (enableSnapshots === undefined || promptAll) {
    questions.push({
      type: 'confirm',
      name: 'enableSnapshots',
      message: 'Enable snapshots?',
      initial: true,
    });
  }

  // Prompt for missing values
  if (questions.length > 0) {
    try {
      const responses = await prompt<{
        name?: string;
        access?: string;
        enableSnapshots?: boolean;
        defaultTier?: string;
        consistency?: string;
        region?: string;
      }>(questions);

      name = name || responses.name;
      access = access || responses.access;
      enableSnapshots =
        enableSnapshots !== undefined
          ? enableSnapshots
          : responses.enableSnapshots;
      defaultTier = defaultTier || responses.defaultTier;
      consistency = consistency || responses.consistency;
      region = region !== undefined ? region : responses.region;
    } catch (error) {
      printFailure(context, 'Operation cancelled');
      process.exit(1);
    }
  }

  // Validate required fields
  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  const { error } = await createBucket(name, {
    defaultTier: (defaultTier ?? 'STANDARD') as StorageClass,
    consistency: consistency === 'strict' ? 'strict' : 'default',
    enableSnapshot: enableSnapshots === true,
    region:
      region !== 'global' && region !== undefined
        ? region.split(',')
        : undefined,
    config: await getStorageConfig(),
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  printSuccess(context, { name });
}
