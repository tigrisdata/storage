import { getStorageConfigWithOrg } from '@auth/provider.js';
import { updateBucket, type UpdateBucketOptions } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { parseLocations } from '@utils/locations.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption, parseBoolean } from '@utils/options.js';

const context = msg('buckets', 'set');

export default async function set(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const access = getOption<string>(options, ['access']);
  const locations = getOption<string | string[]>(options, ['locations']);
  const allowObjectAcl = getOption<string | boolean>(options, [
    'allow-object-acl',
    'allowObjectAcl',
  ]);
  const disableDirectoryListing = getOption<string | boolean>(options, [
    'disable-directory-listing',
    'disableDirectoryListing',
  ]);
  const cacheControl = getOption<string>(options, [
    'cache-control',
    'cacheControl',
  ]);
  const customDomain = getOption<string>(options, [
    'custom-domain',
    'customDomain',
  ]);
  const enableDeleteProtection = getOption<string | boolean>(options, [
    'enable-delete-protection',
    'enableDeleteProtection',
  ]);
  const softDelete = getOption<string>(options, ['soft-delete', 'softDelete']);
  const retentionDays = getOption<string | number>(options, [
    'retention-days',
    'retentionDays',
  ]);
  const enableAdditionalHeaders = getOption<string | boolean>(options, [
    'enable-additional-headers',
    'enableAdditionalHeaders',
  ]);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  // Check if at least one setting is provided
  if (
    access === undefined &&
    locations === undefined &&
    allowObjectAcl === undefined &&
    disableDirectoryListing === undefined &&
    cacheControl === undefined &&
    customDomain === undefined &&
    enableDeleteProtection === undefined &&
    softDelete === undefined &&
    enableAdditionalHeaders === undefined
  ) {
    failWithError(context, 'At least one setting is required');
  }

  // Build update options from provided settings
  const updateOptions: UpdateBucketOptions = {};

  if (access !== undefined) {
    updateOptions.access = access as 'public' | 'private';
  }

  if (locations !== undefined) {
    updateOptions.locations = parseLocations(locations);
  }

  if (allowObjectAcl !== undefined) {
    updateOptions.allowObjectAcl = parseBoolean(allowObjectAcl);
  }

  if (disableDirectoryListing !== undefined) {
    updateOptions.disableDirectoryListing = parseBoolean(
      disableDirectoryListing
    );
  }

  if (cacheControl !== undefined) {
    updateOptions.cacheControl = cacheControl;
  }

  if (customDomain !== undefined) {
    updateOptions.customDomain = customDomain;
  }

  if (enableDeleteProtection !== undefined) {
    updateOptions.enableDeleteProtection = parseBoolean(enableDeleteProtection);
  }

  if (
    softDelete !== undefined &&
    softDelete !== 'enable' &&
    softDelete !== 'disable'
  ) {
    failWithError(context, '--soft-delete must be "enable" or "disable"');
  }

  if (retentionDays !== undefined && softDelete !== 'enable') {
    failWithError(
      context,
      '--retention-days can only be used with --soft-delete enable'
    );
  }

  if (softDelete === 'enable') {
    if (retentionDays === undefined) {
      failWithError(
        context,
        '--retention-days is required when enabling soft delete'
      );
    }
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days <= 0) {
      failWithError(context, '--retention-days must be a positive integer');
    }
    updateOptions.softDelete = { enabled: true, retentionDays: days };
  } else if (softDelete === 'disable') {
    updateOptions.softDelete = { enabled: false };
  }

  if (enableAdditionalHeaders !== undefined) {
    updateOptions.enableAdditionalHeaders = parseBoolean(
      enableAdditionalHeaders
    );
  }

  const finalConfig = await getStorageConfigWithOrg();

  const { error } = await updateBucket(name, {
    ...updateOptions,
    config: finalConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', name }));
  }

  printSuccess(context, { name });
}
