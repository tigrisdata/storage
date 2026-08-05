import { realpathSync } from 'node:fs';

/**
 * How this CLI was installed. Shared by the update notifier (to print the right
 * upgrade command) and analytics (to see which channel users actually install
 * through).
 */
export type InstallMethod = 'npm' | 'homebrew' | 'binary';

/** True when running as a compiled standalone binary rather than under Node. */
export function isBinaryBuild(): boolean {
  return (globalThis as { __TIGRIS_BINARY?: boolean }).__TIGRIS_BINARY === true;
}

function isHomebrewInstall(): boolean {
  if (process.platform === 'win32') {
    return false;
  }
  try {
    const resolved = realpathSync(process.execPath);
    return resolved.includes('/Cellar/') || resolved.includes('/Caskroom/');
  } catch {
    return false;
  }
}

/**
 * The npm check must come first: under an npm install `process.execPath` is
 * Node itself, which is frequently Homebrew-installed and would otherwise be
 * misread as a Homebrew CLI install.
 */
export function getInstallMethod(): InstallMethod {
  if (!isBinaryBuild()) {
    return 'npm';
  }
  if (isHomebrewInstall()) {
    return 'homebrew';
  }
  return 'binary';
}
