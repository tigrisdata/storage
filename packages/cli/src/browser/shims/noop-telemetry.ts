/**
 * Replaces `utils/telemetry.ts`, `utils/analytics.ts` and
 * `utils/telemetry-config.ts` in the browser build.
 *
 * An embedded component must not ship analytics on the host page's behalf, and
 * the Node implementations depend on `@sentry/node`, raw `node:http`/`node:https`
 * and a `~/.tigris/telemetry.json` file. All exports are inert.
 */

export function initTelemetry(): void {}
export function captureError(): void {}
export async function flushTelemetry(): Promise<void> {}
export function trackCommand(): void {}
export function identifyOnLogin(): void {}
export function isTelemetryDisabled(): boolean {
  return true;
}
export async function flushAnalytics(): Promise<void> {}
export function isTelemetryEnabled(): boolean {
  return false;
}
export function setTelemetryEnabled(): void {}
export function getTelemetryStatus() {
  return { enabled: false, configPath: '(disabled in the browser build)' };
}
export function getDistinctId(): string {
  return 'browser';
}
export function getTelemetryConfigPath(): string {
  return '(disabled in the browser build)';
}
export default {};
