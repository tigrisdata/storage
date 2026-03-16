import { getOption, parseBoolean } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { updateBucket, type UpdateBucketOptions } from '@tigrisdata/storage';
import { parseLocations } from '../../utils/locations.js';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'set');

export default async function set(options: Record<string, unknown>) {
  printStart(context);

  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : getOption<string>(options, ['format'], 'table');

  const name = getOption<string>(options, ['name']);
  const access = getOption<string>(options, ['access']);
  let locations = getOption<string | string[]>(options, ['locations']);

  // Handle deprecated --region option
  const deprecatedRegion = getOption<string | string[]>(options, ['region']);
  if (deprecatedRegion !== undefined) {
    console.warn(
      'Warning: --region is deprecated, use --locations instead. See https://www.tigrisdata.com/docs/buckets/locations/'
    );
    if (locations === undefined) {
      locations = deprecatedRegion;
    }
  }
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
  const enableAdditionalHeaders = getOption<string | boolean>(options, [
    'enable-additional-headers',
    'enableAdditionalHeaders',
  ]);

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
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
    enableAdditionalHeaders === undefined
  ) {
    printFailure(context, 'At least one setting is required');
    process.exit(1);
  }

  const config = await getStorageConfig();

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

  if (enableAdditionalHeaders !== undefined) {
    updateOptions.enableAdditionalHeaders = parseBoolean(
      enableAdditionalHeaders
    );
  }

  // Include organization ID if available (needed for updateBucket API)
  const selectedOrg = getSelectedOrganization();
  const finalConfig = {
    ...config,
    ...(selectedOrg && !config.organizationId
      ? { organizationId: selectedOrg }
      : {}),
  };

  const { error } = await updateBucket(name, {
    ...updateOptions,
    config: finalConfig,
  });

  if (error) {
    printFailure(context, error.message);
    process.exit(1);
  }

  if (format === 'json') {
    console.log(JSON.stringify({ action: 'updated', name }));
  }

  printSuccess(context, { name });
}
