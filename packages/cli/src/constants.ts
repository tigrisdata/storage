export const DEFAULT_STORAGE_ENDPOINT = 'https://t3.storage.dev';
export const DEFAULT_IAM_ENDPOINT = 'https://iam.storageapi.dev';
export const DEFAULT_MGMT_ENDPOINT = 'https://mgmt.storageapi.dev';
export const NPM_REGISTRY_URL =
  'https://registry.npmjs.org/@tigrisdata/cli/latest';
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check for updates every 6 hours
export const UPDATE_NOTIFY_INTERVAL_MS = 1 * 60 * 60 * 1000; // Show update notification every 1 hour

// Sentry DSN for CLI error telemetry, embedded at build time. A DSN is not a
// secret (it only permits sending events), so shipping it in the published CLI
// is expected. Overridable via TIGRIS_SENTRY_DSN. Empty keeps telemetry inert.
export const SENTRY_DSN =
  'https://c3a84c6a2811c557d70e42412cda4ffa@o4507410155896832.ingest.us.sentry.io/4511767771545600';
