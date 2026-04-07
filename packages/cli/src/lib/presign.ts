import { getAuthClient } from '@auth/client.js';
import { getStorageConfig, getTigrisConfig } from '@auth/provider.js';
import { getLoginMethod, getSelectedOrganization } from '@auth/storage.js';
import type { AccessKey } from '@tigrisdata/iam';
import { listAccessKeys } from '@tigrisdata/iam';
import { getPresignedUrl } from '@tigrisdata/storage';
import { exitWithError } from '@utils/exit.js';
import { formatJson } from '@utils/format.js';
import { getFormat, getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

export default async function presign(options: Record<string, unknown>) {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    exitWithError('path argument is required');
  }

  const { bucket, path } = parseAnyPath(pathString);

  if (!bucket) {
    exitWithError('Invalid path');
  }

  if (!path) {
    exitWithError('Object key is required');
  }

  const method = getOption<string>(options, ['method', 'm']) ?? 'get';
  const expiresIn = parseInt(
    getOption<string>(options, ['expires-in', 'expiresIn', 'e']) ?? '3600',
    10
  );
  const format = getFormat(options, 'url');
  const accessKeyFlag = getOption<string>(options, ['access-key', 'accessKey']);
  const selectFlag = getOption<boolean>(options, ['select']);

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
    // 3. OAuth login — need to resolve an access key
    const loginMethod = getLoginMethod();

    if (loginMethod !== 'oauth') {
      exitWithError(
        'Presigning requires an access key. Pass --access-key or configure credentials.'
      );
    }

    if (selectFlag) {
      accessKeyId = await resolveAccessKeyWithPrompt(bucket, method);
    } else {
      accessKeyId = await resolveAccessKeyAuto(bucket, method);
    }
  }

  if (!accessKeyId) {
    exitWithError(
      'Presigning requires an access key. Pass --access-key or configure credentials.'
    );
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
    exitWithError(error);
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

async function fetchAccessKeys(): Promise<AccessKey[]> {
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
    exitWithError(error);
  }

  if (!data.accessKeys || data.accessKeys.length === 0) {
    exitWithError(
      'No access keys found. Create one with "tigris access-keys create <name>"'
    );
  }

  return data.accessKeys;
}

export function keyMatchesOperation(
  key: AccessKey,
  targetBucket: string,
  method: string
): boolean {
  if (!key.roles) return false;

  return key.roles.some((r) => {
    // NamespaceAdmin has access to everything
    if (r.role === 'NamespaceAdmin') return true;

    // Role must target this bucket or wildcard
    if (r.bucket !== targetBucket && r.bucket !== '*') return false;

    // For put: need Editor
    if (method === 'put') return r.role === 'Editor';

    // For get: Editor or ReadOnly
    return r.role === 'Editor' || r.role === 'ReadOnly';
  });
}

async function resolveAccessKeyAuto(
  targetBucket: string,
  method: string
): Promise<string> {
  const keys = await fetchAccessKeys();
  const activeKeys = keys.filter((key) => key.status === 'active');

  if (activeKeys.length === 0) {
    exitWithError(
      'No active access keys found. Create one with "tigris access-keys create <name>"'
    );
  }

  const match = activeKeys.find((key) =>
    keyMatchesOperation(key, targetBucket, method)
  );

  if (!match) {
    const requiredRole = method === 'put' ? 'Editor' : 'Editor or ReadOnly';
    exitWithError(
      `No access key with ${requiredRole} access to bucket "${targetBucket}" found.\n` +
        `Create one: tigris access-keys create <name>\n` +
        `Then assign: tigris access-keys assign <id> --bucket ${targetBucket} --role Editor`
    );
  }

  console.error(`Using access key: ${match.name} (${match.id})`);
  return match.id;
}

async function resolveAccessKeyWithPrompt(
  targetBucket: string,
  method: string
): Promise<string> {
  if (!process.stdin.isTTY) {
    exitWithError(
      'Interactive selection requires a TTY. Omit --select to auto-resolve, or pass --access-key tid_...'
    );
  }

  const keys = await fetchAccessKeys();
  const activeKeys = keys.filter((key) => key.status === 'active');

  if (activeKeys.length === 0) {
    exitWithError(
      'No active access keys found. Create one with "tigris access-keys create <name>"'
    );
  }

  // Filter to active keys that match the operation
  const matchingKeys = activeKeys.filter((key) =>
    keyMatchesOperation(key, targetBucket, method)
  );

  let candidates: AccessKey[];

  if (matchingKeys.length > 0) {
    candidates = matchingKeys;
  } else {
    // Fall back to all active keys with a warning
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
    choices: candidates.map((key) => ({
      name: key.id,
      message: `${key.name} (${key.id})`,
    })),
  });

  return selectedKey;
}
