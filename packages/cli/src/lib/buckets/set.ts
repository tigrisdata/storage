import { getOption, parseBoolean } from '../../utils/options.js';
import { getStorageConfig } from '../../auth/s3-client.js';
import { getSelectedOrganization } from '../../auth/storage.js';
import { updateBucket, type UpdateBucketOptions } from '@tigrisdata/storage';
import {
  printStart,
  printSuccess,
  printFailure,
  msg,
} from '../../utils/messages.js';

const context = msg('buckets', 'set');

export default async function set(options: Record<string, unknown>) {
  printStart(context);

  const name = getOption<string>(options, ['name']);
  const access = getOption<string>(options, ['access']);
  const region = getOption<string | string[]>(options, ['region']);
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

  if (!name) {
    printFailure(context, 'Bucket name is required');
    process.exit(1);
  }

  // Check if at least one setting is provided
  if (
    access === undefined &&
    region === undefined &&
    allowObjectAcl === undefined &&
    disableDirectoryListing === undefined &&
    cacheControl === undefined &&
    customDomain === undefined &&
    enableDeleteProtection === undefined
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

  if (region !== undefined) {
    updateOptions.regions = Array.isArray(region) ? region : [region];
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

  printSuccess(context, { name });
}
