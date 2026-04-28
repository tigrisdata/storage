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

export type TigrisConfig = TigrisEndpointsConfig & TigrisAuthConfig;
