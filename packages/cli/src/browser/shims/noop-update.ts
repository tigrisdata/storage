/**
 * Replaces `utils/update-check.ts` and `utils/install-method.ts`.
 * There is nothing to self-update in a page.
 */

export function checkForUpdates(): void {}
export async function fetchLatestVersion(): Promise<string | null> {
  return null;
}
export function getInstallMethod(): string {
  return 'browser';
}
export function getUpdateCommand(): string | null {
  return null;
}
export default {};
