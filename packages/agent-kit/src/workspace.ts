import type { TigrisResponse } from '@shared/types';
import { createAccessKey, removeAccessKey } from '@tigrisdata/iam';
import { createBucket, removeBucket, setBucketTtl } from '@tigrisdata/storage';
import type { TigrisAgentKitConfig } from './config';

// -- Types --

export type CreateWorkspaceOptions = {
  access?: 'public' | 'private';
  /** Auto-expire objects after this many days. */
  ttl?: {
    days: number;
  };
  enableSnapshots?: boolean;
  /** If provided, creates a scoped access key with this role. */
  credentials?: {
    role: 'Editor' | 'ReadOnly';
  };
  config?: TigrisAgentKitConfig;
};

export type Workspace = {
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type TeardownWorkspaceOptions = {
  config?: TigrisAgentKitConfig;
};

// -- Functions --

export async function createWorkspace(
  name: string,
  options?: CreateWorkspaceOptions
): Promise<TigrisResponse<Workspace>> {
  const { access, ttl, enableSnapshots, credentials, config } = options ?? {};

  // Step 1: Create the bucket
  const bucketResult = await createBucket(name, {
    access,
    enableSnapshot: enableSnapshots,
    config,
  });

  if (bucketResult.error) {
    return {
      error: new Error(
        `Failed to create workspace bucket "${name}": ${bucketResult.error.message}`
      ),
    };
  }

  // Step 2: Configure TTL if requested
  if (ttl) {
    const ttlResult = await setBucketTtl(name, {
      ttlConfig: { enabled: true, days: ttl.days },
      config,
    });

    if (ttlResult.error) {
      // TTL failed but bucket exists — continue to credential creation
      // rather than returning early and skipping requested credentials
    }
  }

  // Step 3: Create scoped credentials if requested
  const workspace: Workspace = { bucket: name };

  if (credentials) {
    const keyResult = await createAccessKey(`${name}-key`, {
      bucketsRole: [{ bucket: name, role: credentials.role }],
      config,
    });

    if (keyResult.data?.secret) {
      workspace.credentials = {
        accessKeyId: keyResult.data.id,
        secretAccessKey: keyResult.data.secret,
      };
    }
  }

  return { data: workspace };
}

export async function teardownWorkspace(
  workspace: Workspace,
  options?: TeardownWorkspaceOptions
): Promise<TigrisResponse<void>> {
  const config = options?.config;
  const errors: string[] = [];

  // Revoke credentials first
  if (workspace.credentials) {
    const keyResult = await removeAccessKey(workspace.credentials.accessKeyId, {
      config,
    });
    if (keyResult.error) {
      errors.push(
        `Failed to remove access key for "${workspace.bucket}": ${keyResult.error.message}`
      );
    }
  }

  // Then delete the bucket
  const bucketResult = await removeBucket(workspace.bucket, {
    force: true,
    config,
  });
  if (bucketResult.error) {
    errors.push(
      `Failed to delete workspace "${workspace.bucket}": ${bucketResult.error.message}`
    );
  }

  if (errors.length > 0) {
    return {
      error: new Error(
        `Workspace teardown completed with errors:\n${errors.join('\n')}`
      ),
    };
  }

  return { data: undefined };
}
