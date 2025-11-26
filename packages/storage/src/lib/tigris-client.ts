import { S3Client } from '@aws-sdk/client-s3';
import type { HttpRequest } from '@aws-sdk/types';
import { config, missingConfigError } from './config';
import type { TigrisStorageConfig, TigrisStorageResponse } from './types';

export enum TigrisHeaders {
  SESSION_TOKEN = 'x-amz-security-token',
  NAMESPACE = 'X-Tigris-Namespace',
  STORAGE_CLASS = 'X-Amz-Storage-Class',
  CONSISTENT = 'X-Tigris-Consistent',
  REGIONS = 'X-Tigris-Regions',
  SNAPSHOT = 'X-Tigris-Snapshot',
  SNAPSHOT_VERSION = 'X-Tigris-Snapshot-Version',
  SNAPSHOT_ENABLED = 'X-Tigris-Enable-Snapshot',
  HAS_FORKS = 'X-Tigris-Is-Fork-Parent',
  FORK_SOURCE_BUCKET = 'X-Tigris-Fork-Source-Bucket',
  FORK_SOURCE_BUCKET_SNAPSHOT = 'X-Tigris-Fork-Source-Bucket-Snapshot',
}

const cachedClients = new Map<string, S3Client>();

export function createTigrisClient(
  options?: TigrisStorageConfig,
  skipBucketCheck: boolean | undefined = false
): TigrisStorageResponse<S3Client, Error> {
  const accessKeyId = options?.accessKeyId ?? config.accessKeyId;
  const secretAccessKey = options?.secretAccessKey ?? config.secretAccessKey;
  const endpoint = options?.endpoint ?? config.endpoint;
  const bucket = options?.bucket ?? config.bucket;

  const skipAccessKeyCheck =
    options?.sessionToken !== undefined &&
    options?.organizationId !== undefined &&
    options.sessionToken !== '' &&
    options.organizationId !== '';

  if (!bucket && !skipBucketCheck) {
    return missingConfigError('bucket');
  }

  if (!skipAccessKeyCheck && (!accessKeyId || accessKeyId === '')) {
    return missingConfigError('accessKeyId');
  }

  if (!skipAccessKeyCheck && (!secretAccessKey || secretAccessKey === '')) {
    return missingConfigError('secretAccessKey');
  }

  if (!endpoint || endpoint === '') {
    return missingConfigError('endpoint');
  }

  let key = `${accessKeyId}-${endpoint}`;

  if (options?.sessionToken && options?.organizationId) {
    key = `${options.sessionToken}-${options.organizationId}-${endpoint}`;
  }

  const cachedClient = cachedClients.get(key);

  if (cachedClient !== undefined) {
    return { data: cachedClient };
  }

  const client = new S3Client({
    credentials: {
      accessKeyId: accessKeyId ?? '',
      secretAccessKey: secretAccessKey ?? '',
      sessionToken: options?.sessionToken ?? undefined,
    },
    region: 'auto',
    endpoint: endpoint ?? 'https://t3.storage.dev',
  });

  if (options?.sessionToken && options?.organizationId) {
    client.middlewareStack.add(
      (next) => async (args) => {
        const req = args.request as HttpRequest;
        req.headers[TigrisHeaders.NAMESPACE] = options.organizationId!;
        const result = await next(args);
        return result;
      },
      {
        name: 'x-Tigris-Namespace-Middleware',
        step: 'build',
        override: true,
      }
    );
  }

  if (!client) {
    return { error: new Error('Unable to create Tigris client') };
  }

  cachedClients.set(key, client);

  return {
    data: client,
  };
}

const cachedHttpClients = new Map<string, TigrisHttpClient>();

export interface HttpClientRequest<T = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path: string;
  headers?: Record<string, string>;
  body?: T;
  query?: Record<string, string | number | boolean>;
}

export interface HttpClientResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
}

export interface TigrisHttpClient {
  request<TRequest = unknown, TResponse = unknown>(
    req: HttpClientRequest<TRequest>,
    host?: 't3' | 'iam' | 'auth0'
  ): Promise<HttpClientResponse<TResponse>>;
}

export function createTigrisHttpClient(
  options?: TigrisStorageConfig,
  skipChecks: boolean = false
): TigrisStorageResponse<TigrisHttpClient, Error> {
  const endpoint = options?.endpoint ?? config.endpoint;
  const iamEndpoint = options?.iamEndpoint ?? config.iamEndpoint;
  const authDomain = options?.authDomain ?? config.authDomain;
  const sessionToken = options?.sessionToken;
  const organizationId = options?.organizationId;

  if (!sessionToken && !skipChecks) {
    return missingConfigError('sessionToken is required');
  }

  if (!organizationId && !skipChecks) {
    return missingConfigError('organizationId is required');
  }

  let key = `${sessionToken}-${organizationId}`;

  if (authDomain) {
    key = `${key}-${authDomain}`;
  }

  const cachedClient = cachedHttpClients.get(key);

  if (cachedClient !== undefined) {
    return { data: cachedClient };
  }

  const client: TigrisHttpClient = {
    async request<TRequest = unknown, TResponse = unknown>(
      req: HttpClientRequest<TRequest>,
      host: 't3' | 'iam' | 'auth0' = 't3'
    ): Promise<HttpClientResponse<TResponse>> {
      let domain = endpoint;
      if (host === 'iam') {
        domain = iamEndpoint;
      } else if (host === 'auth0') {
        domain = `https://${authDomain}`;
      }
      const url = new URL(req.path, domain);

      // Add query parameters if provided
      if (req.query) {
        Object.entries(req.query).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...req.headers,
      };

      // Add Tigris namespace header if organizationId is provided
      if (organizationId) {
        headers[TigrisHeaders.NAMESPACE] = organizationId;
      }

      if (sessionToken) {
        headers[TigrisHeaders.SESSION_TOKEN] = sessionToken;
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      // Add body if provided and method supports it
      if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(url.toString(), fetchOptions);

      let data: TResponse;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = (await response.json()) as TResponse;
      } else {
        data = (await response.text()) as TResponse;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data,
      };
    },
  };

  cachedHttpClients.set(key, client);

  return { data: client };
}
