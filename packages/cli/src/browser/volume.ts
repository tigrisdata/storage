/**
 * The single in-memory filesystem shared by the CLI and the shell around it.
 *
 * Backed by `memfs`, which implements Node's `fs` API faithfully enough that
 * `auth/storage.ts` keeps working unmodified — it persists credentials to
 * `~/.tigris/config.json`, which lands here and is gone on reload. That is
 * exactly the "access keys never persisted" requirement.
 *
 * `@tigrisdata/cli-shell` imports this same `volume` to build the just-bash
 * filesystem, so `cat ~/.tigris/config.json` in the shell and the CLI's own
 * credential reads see one set of bytes.
 */

import { createFsFromVolume, Volume } from 'memfs';

export const HOME_DIR = '/home/tigris';

export const volume = new Volume();

/** Node-compatible `fs` bound to {@link volume}. */
export const fs = createFsFromVolume(volume);

fs.mkdirSync(HOME_DIR, { recursive: true });
fs.mkdirSync('/tmp', { recursive: true });

/** Drop every file and start clean — used between tests and on logout. */
export function resetVolume(): void {
  volume.reset();
  fs.mkdirSync(HOME_DIR, { recursive: true });
  fs.mkdirSync('/tmp', { recursive: true });
}
