import { parseAnyPath } from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig, getLoginMethod } from '../auth/s3-client.js';
import { getPresignedUrl } from '@tigrisdata/storage';
import { listAccessKeys } from '@tigrisdata/iam';
import type { AccessKey } from '@tigrisdata/iam';
import { getAuthClient } from '../auth/client.js';
import { getSelectedOrganization } from '../auth/storage.js';
import { getTigrisConfig } from '../auth/config.js';
import { formatJson } from '../utils/format.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

export default async function presign(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    console.error('path argument is required');
    process.exit(1);
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    console.error('Invalid path');
    process.exit(1);
  }

  if (!path) {
    console.error('Object key is required');
    process.exit(1);
  }

  const method = getOption<string>(options, ['method', 'm']) ?? 'get';
  const expiresIn = parseInt(
    getOption<string>(options, ['expires-in', 'expiresIn', 'e']) ?? '3600',
    10
  );
  const json = getOption<boolean>(options, ['json']);
  const format = json
    ? 'json'
    : (getOption<string>(options, ['format', 'f']) ?? 'url');
  const accessKeyFlag = getOption<string>(options, ['access-key', 'accessKey']);

  const config = await getStorageConfig();

  // Resolve access key ID
  let accessKeyId: string | undefined;

  if (accessKeyFlag) {
    // 1. Explicit --access-key flag
    accessKeyId = accessKeyFlag;
  } else if (config.accessKeyId) {
    // 2. Credentials/env/configured login has an access key
    accessKeyId = config.accessKeyId;
  } else {
    // 3. OAuth login — need to resolve an access key interactively
    const loginMethod = await getLoginMethod();

    if (loginMethod !== 'oauth') {
      console.error(
        'Presigning requires an access key. Pass --access-key or configure credentials.'
      );
      process.exit(1);
    }

    accessKeyId = await resolveAccessKeyInteractively(bucket);
  }

  if (!accessKeyId) {
    console.error(
      'Presigning requires an access key. Pass --access-key or configure credentials.'
    );
    process.exit(1);
  }

  const { data, error } = await getPresignedUrl(path, {
    method: method as 'get' | 'put',
    expiresIn,
    accessKeyId,
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (format === 'json') {
    console.log(
      formatJson({
        url: data.url,
        expiresIn: data.expiresIn,
        method,
        bucket,
        key: path,
      })
    );
  } else {
    console.log(data.url);
  }

  process.exit(0);
}

async function resolveAccessKeyInteractively(
  targetBucket: string
): Promise<string> {
  if (!process.stdin.isTTY) {
    console.error(
      'Presigning requires an access key. Pass --access-key tid_...'
    );
    process.exit(1);
  }

  const authClient = getAuthClient();
  const accessToken = await authClient.getAccessToken();
  const selectedOrg = getSelectedOrganization();
  const tigrisConfig = getTigrisConfig();

  const { data, error } = await listAccessKeys({
    config: {
      sessionToken: accessToken,
      organizationId: selectedOrg ?? undefined,
      iamEndpoint: tigrisConfig.iamEndpoint,
    },
  });

  if (error) {
    console.error(`Failed to list access keys: ${error.message}`);
    process.exit(1);
  }

  if (!data.accessKeys || data.accessKeys.length === 0) {
    console.error(
      'No access keys found. Create one with "tigris access-keys create <name>"'
    );
    process.exit(1);
  }

  // Filter to active keys that have access to the target bucket
  const matchingKeys = data.accessKeys.filter(
    (key: AccessKey) =>
      key.status === 'active' &&
      key.roles?.some((r) => r.bucket === targetBucket || r.bucket === '*')
  );

  let candidates: AccessKey[];

  if (matchingKeys.length > 0) {
    candidates = matchingKeys;
  } else {
    // Fall back to all active keys with a warning
    const activeKeys = data.accessKeys.filter(
      (key: AccessKey) => key.status === 'active'
    );

    if (activeKeys.length === 0) {
      console.error(
        'No active access keys found. Create one with "tigris access-keys create <name>"'
      );
      process.exit(1);
    }

    console.error(
      `No access keys with explicit access to bucket "${targetBucket}" found. Showing all active keys.`
    );
    candidates = activeKeys;
  }

  // Auto-select if only one candidate
  if (candidates.length === 1) {
    console.error(
      `Using access key: ${candidates[0].name} (${candidates[0].id})`
    );
    return candidates[0].id;
  }

  // Interactive selection
  const { selectedKey } = await prompt<{ selectedKey: string }>({
    type: 'select',
    name: 'selectedKey',
    message: 'Select an access key for presigning:',
    choices: candidates.map((key: AccessKey) => ({
      name: key.id,
      message: `${key.name} (${key.id})`,
    })),
  });

  return selectedKey;
}
