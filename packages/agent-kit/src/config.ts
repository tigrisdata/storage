/**
 * Unified configuration for Tigris Agentic operations.
 * Maps to both TigrisStorageConfig and TigrisIAMConfig internally.
 * When omitted, the underlying SDKs use environment variables.
 */
export type TigrisAgentKitConfig = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  organizationId?: string;
  endpoint?: string;
  iamEndpoint?: string;
  mgmtEndpoint?: string;
};

export function toStorageConfig(config?: TigrisAgentKitConfig) {
  if (!config) return undefined;
  return {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    organizationId: config.organizationId,
    endpoint: config.endpoint,
  };
}

export function toIAMConfig(config?: TigrisAgentKitConfig) {
  if (!config) return undefined;
  return {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
    organizationId: config.organizationId,
    iamEndpoint: config.iamEndpoint,
    mgmtEndpoint: config.mgmtEndpoint,
  };
}
