/**
 * S3 Client factory
 * Creates appropriate S3 client based on login method
 */

import { S3Client } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import {
  getLoginMethod as getStoredLoginMethod,
  getCredentials,
  getSelectedOrganization,
} from './storage.js';
import { getAuthClient } from './client.js';

export type LoginMethod = 'oauth' | 'credentials';

/**
 * Get the login method used by the user
 */
export async function getLoginMethod(): Promise<LoginMethod | null> {
  return getStoredLoginMethod();
}

export type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  sessionToken?: string;
  organizationId?: string;
  iamEndpoint?: string;
  authDomain?: string;
};

export async function getStorageConfig(): Promise<TigrisStorageConfig> {
  const loginMethod = await getLoginMethod();

  if (!loginMethod) {
    throw new Error(
      'Not authenticated. Please run "tigris login" or "tigris configure" first.'
    );
  }

  if (loginMethod === 'oauth') {
    // OAuth login - use access token and selected org
    const authClient = getAuthClient();
    const accessToken = await authClient.getAccessToken();
    const selectedOrg = getSelectedOrganization();

    if (!selectedOrg) {
      throw new Error(
        'No organization selected. Please run "tigris orgs select" first.'
      );
    }

    const endpoint = process.env.TIGRIS_ENDPOINT ?? 'https://t3.storage.dev';
    const iamEndpoint =
      process.env.TIGRIS_STORAGE_IAM_ENDPOINT ?? 'https://iam.storageapi.dev';
    const authDomain = process.env.AUTH0_DOMAIN ?? 'https://auth.tigris.dev';

    return {
      sessionToken: accessToken,
      accessKeyId: '',
      secretAccessKey: '',
      endpoint,
      organizationId: getSelectedOrganization() ?? undefined,
      iamEndpoint,
      authDomain,
    };
  }

  const credentials = getCredentials();

  if (!credentials) {
    throw new Error(
      'No credentials found. Please run "tigris configure" first.'
    );
  }

  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    endpoint: credentials.endpoint,
  };
}

/**
 * Get configured S3 client based on login method
 */
export async function getS3Client(): Promise<S3Client> {
  const loginMethod = await getLoginMethod();

  if (!loginMethod) {
    throw new Error(
      'Not authenticated. Please run "tigris login" or "tigris configure" first.'
    );
  }

  if (loginMethod === 'oauth') {
    // OAuth login - use access token and selected org
    const authClient = getAuthClient();
    const accessToken = await authClient.getAccessToken();
    const selectedOrg = getSelectedOrganization();

    if (!selectedOrg) {
      throw new Error(
        'No organization selected. Please run "tigris orgs select" first.'
      );
    }

    const endpoint = process.env.TIGRIS_ENDPOINT ?? 'https://t3.storage.dev';

    // Get credentials config to get endpoint if available, otherwise use default
    // Create S3 client with custom headers for OAuth
    const client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        sessionToken: accessToken,
        accessKeyId: '', // Required by SDK but not used with token auth
        secretAccessKey: '', // Required by SDK but not used with token auth
      },
    });

    // Add middleware to inject custom headers
    client.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers['x-Tigris-Namespace'] = selectedOrg;
        const result = await next(args);
        return result;
      },
      {
        name: 'x-Tigris-Namespace-Middleware',
        step: 'build',
        override: true,
      }
    );

    return client;
  } else {
    // Credentials login - use access key and secret
    const credentials = getCredentials();

    if (!credentials) {
      throw new Error(
        'No credentials found. Please run "tigris configure" first.'
      );
    }

    // Create S3 client with access key and secret
    const client = new S3Client({
      region: 'auto',
      endpoint: credentials.endpoint,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });

    return client;
  }
}

/**
 * Check if user is authenticated (either method)
 */
export async function isAuthenticated(): Promise<boolean> {
  const method = await getLoginMethod();
  return method !== null;
}
