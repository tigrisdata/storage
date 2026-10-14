/**
 * `node:fs` — the memfs-backed volume from `../volume.js`.
 *
 * memfs binds its methods to the volume, so re-exporting them directly is safe.
 */

import { fs } from '../volume.js';

export const {
  constants,
  fstatSync,
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  lstatSync,
  realpathSync,
  unlinkSync,
  rmSync,
  rmdirSync,
  renameSync,
  chmodSync,
  utimesSync,
  copyFileSync,
  openSync,
  closeSync,
  readSync,
  writeSync,
  createReadStream,
  createWriteStream,
  promises,
} = fs;

export default fs;
