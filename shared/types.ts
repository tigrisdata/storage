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

// --- Class-based API (Tigris / TigrisIAM) ---
// These types are net-new and consumed by the `Tigris` and `TigrisIAM`
// classes. The bare-function API continues to use the types above.

export type TigrisEndpoints = {
  storage?: string;
  iam?: string;
  mgmt?: string;
};

export type TigrisCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type TigrisSession = {
  sessionToken: string;
  organizationId: string;
  expiration?: Date;
};

export type TigrisAuth =
  | TigrisCredentials
  | TigrisSession
  | (() => Promise<TigrisSession>);

export type TigrisInit = {
  auth: TigrisAuth;
  endpoints?: TigrisEndpoints;
  bucket?: string;
  forcePathStyle?: boolean;
};
