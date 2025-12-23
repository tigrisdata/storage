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
}

const cachedHttpClients = new Map<string, TigrisHttpClient>();

export function createTigrisHttpClient(
  options: CreateHttpClientOptions
): TigrisResponse<TigrisHttpClient, Error> {
  const { baseUrl, sessionToken, organizationId } = options;

  const key = `${baseUrl}-${sessionToken}-${organizationId}`;

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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...req.headers,
      };

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

      if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
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
