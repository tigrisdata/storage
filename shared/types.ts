import type { RetryConfig } from './retry';

export type TigrisResponse<T, E = Error> =
  | {
      data: T;
      error?: never;
    }
  | {
      error: E;
      data?: never;
    };

export type TigrisEndpointsConfig = {
  endpoint?: string;
  iamEndpoint?: string;
  mgmtEndpoint?: string;
};

export type TigrisAuthConfig = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  organizationId?: string;
  credentialProvider?: () => Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    expiration?: Date;
  }>;
};

export type TigrisRetryConfig = {
  /**
   * Retry policy for requests made through the Tigris HTTP client — the
   * bucket, fork, and IAM operations. Opt-in: omitted or `false` performs a
   * single attempt. `true` selects the defaults (3 attempts, exponential
   * backoff with full jitter, retrying 408/429/5xx).
   *
   * Object data-plane calls (`put`, `get`, `list`, multipart) go through the
   * AWS SDK's S3 client and keep its own retry policy; this option does not
   * apply to them.
   */
  retry?: RetryConfig;
};

export type TigrisConfig = TigrisEndpointsConfig &
  TigrisAuthConfig &
  TigrisRetryConfig;
