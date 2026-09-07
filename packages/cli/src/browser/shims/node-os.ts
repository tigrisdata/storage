/**
 * `node:os` — only what the CLI actually calls.
 *
 * Not `os-browserify`: its `homedir()` returns `/`, but the CLI keeps
 * credentials at `~/.tigris/config.json`, and its `platform()` returns
 * `'browser'`, which no caller here knows how to interpret. Both values are
 * decisions rather than polyfills, so they live in code.
 */

export function homedir(): string {
  return '/home/tigris';
}

/** 'linux' keeps `auth/storage.ts` off its win32 branch, which shells out to icacls. */
export function platform(): string {
  return 'linux';
}

export default { homedir, platform };
