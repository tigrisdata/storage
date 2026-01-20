import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { TigrisHeaders } from './headers';
import type { TigrisResponse } from './types';

export interface HttpClientRequest<T = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path: string;
  headers?: Record<string, string>;
  body?: T;
  query?: Record<string, string | number | boolean>;
}

export type HttpClientResponse<T = unknown> =
  | {
      status: number;
      statusText: string;
      headers: Headers;
      data: T;
      error?: never;
    }
  | {
      status: number;
      statusText: string;
      headers: Headers;
      error: Error;
      data?: never;
    };

export interface TigrisHttpClient {
  request<TRequest = unknown, TResponse = unknown>(
    req: HttpClientRequest<TRequest>
  ): Promise<HttpClientResponse<TResponse>>;
}

export interface CreateHttpClientOptions {
  baseUrl: string;
  sessionToken?: string;
  organizationId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

const cachedHttpClients = new Map<string, TigrisHttpClient>();

/**
 * Generate AWS Signature V4 headers for a request
 */
async function generateSignatureHeaders(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: string | undefined,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const signer = new SignatureV4({
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    region: 'auto',
    service: 's3',
    sha256: Sha256,
  });

  const request = {
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? parseInt(url.port) : undefined,
    path: url.pathname + url.search,
    headers: {
      ...headers,
      host: url.host,
    },
    body,
  };

  const signedRequest = await signer.sign(request);
  return signedRequest.headers as Record<string, string>;
}

export function createTigrisHttpClient(
  options: CreateHttpClientOptions
): TigrisResponse<TigrisHttpClient, Error> {
  const {
    baseUrl,
    sessionToken,
    organizationId,
    accessKeyId,
    secretAccessKey,
  } = options;

  let key = `${baseUrl}`;

  if (organizationId) {
    key = `${key}-${organizationId}`;
  }

  if (sessionToken) {
    key = `${key}-${sessionToken}`;
  }

  if (accessKeyId) {
    key = `${key}-${accessKeyId}`;
  }

  const cachedClient = cachedHttpClients.get(key);
  if (cachedClient !== undefined) {
    return { data: cachedClient };
  }

  const client: TigrisHttpClient = {
    async request<TRequest = unknown, TResponse = unknown>(
      req: HttpClientRequest<TRequest>
    ): Promise<HttpClientResponse<TResponse>> {
      const url = new URL(req.path, baseUrl);

      if (req.query) {
        Object.entries(req.query).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...req.headers,
      };

      // Prepare body for signing
      let bodyString: string | undefined;
      if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
        bodyString = JSON.stringify(req.body);
      }

      // Use credentials-based auth with signature if available
      if (accessKeyId && secretAccessKey && !sessionToken) {
        const signedHeaders = await generateSignatureHeaders(
          req.method,
          url,
          headers,
          bodyString,
          accessKeyId,
          secretAccessKey
        );
        headers = signedHeaders;
      } else {
        // Use session token or pre-generated authorization
        if (sessionToken) {
          headers[TigrisHeaders.SESSION_TOKEN] = sessionToken;
        }

        if (organizationId) {
          headers[TigrisHeaders.NAMESPACE] = organizationId;
        }
      }

      const fetchOptions: RequestInit = {
        method: req.method,
        headers,
      };

      if (bodyString) {
        fetchOptions.body = bodyString;
      }

      const response = await fetch(url.toString(), fetchOptions);

      if (!response.ok) {
        return {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          error: new Error(response.statusText),
        };
      }

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
