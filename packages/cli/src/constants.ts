export const DEFAULT_STORAGE_ENDPOINT = 'https://t3.storage.dev';
export const DEFAULT_IAM_ENDPOINT = 'https://iam.storageapi.dev';
export const DEFAULT_MGMT_ENDPOINT = 'https://mgmt.storageapi.dev';
export const NPM_REGISTRY_URL =
  'https://registry.npmjs.org/@tigrisdata/cli/latest';
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Check for updates every 6 hours
export const UPDATE_NOTIFY_INTERVAL_MS = 1 * 60 * 60 * 1000; // Show update notification every 1 hour

// Set to '1' for children the CLI spawns to install or update itself, so the
// package's postinstall banner ("To get started: tigris login") stays out of
// their output. It writes straight to /dev/tty, so it escapes captured stdio and
// would land in the middle of the `init` wizard. Read by postinstall.cjs, which
// is plain CJS outside the TS build and so repeats the literal.
export const NO_BANNER_ENV = 'TIGRIS_NO_BANNER';

// Sentry DSN for CLI error telemetry, embedded at build time. A DSN is not a
// secret (it only permits sending events), so shipping it in the published CLI
// is expected. Overridable via TIGRIS_SENTRY_DSN. Empty keeps telemetry inert.
export const SENTRY_DSN =
  'https://c3a84c6a2811c557d70e42412cda4ffa@o4507410155896832.ingest.us.sentry.io/4511767771545600';

// PostHog project for CLI usage analytics — the same project the console
// reports to, so a user's CLI and web activity join on one person record. Like
// a Sentry DSN, a PostHog project API key is write-only and not a secret.
// Overridable via TIGRIS_POSTHOG_KEY / TIGRIS_POSTHOG_HOST. Empty key keeps
// analytics inert.
export const POSTHOG_KEY = 'phc_6a2zd9w9hGzIqYl527bL4dXk3Wz8J9pEHyXTwP1hHq4';
export const POSTHOG_HOST = 'https://ph.tigrisdata.com';
