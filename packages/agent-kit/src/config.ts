import type { TigrisConfig } from '@shared/types';

/**
 * Unified configuration for Tigris Agentic operations.
 * Accepted directly by both `@tigrisdata/storage` and `@tigrisdata/iam`.
 * When omitted, the underlying SDKs fall back to environment variables.
 */
export type TigrisAgentKitConfig = TigrisConfig;
