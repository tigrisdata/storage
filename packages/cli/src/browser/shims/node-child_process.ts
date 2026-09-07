/**
 * `node:child_process` — unavailable in a browser.
 *
 * Reached only by commands excluded from the browser registry (`update`,
 * `init`) and by the win32 branch of `auth/storage.ts`, which never runs
 * because `os.platform()` reports 'linux'. Throwing makes a mistake loud.
 */

function unsupported(name: string): never {
  throw new Error(
    `${name} is not available in the browser build of Tigris CLI`
  );
}

export const execSync = () => unsupported('execSync');
export const execFileSync = () => unsupported('execFileSync');
export const spawnSync = () => unsupported('spawnSync');
export const spawn = () => unsupported('spawn');
export const exec = () => unsupported('exec');

export default { execSync, execFileSync, spawnSync, spawn, exec };
