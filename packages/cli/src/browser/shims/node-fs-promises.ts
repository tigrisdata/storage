/** `node:fs/promises` — the promise face of the same memfs volume. */

import { fs } from '../volume.js';

export const {
  readFile,
  writeFile,
  appendFile,
  mkdir,
  readdir,
  stat,
  lstat,
  realpath,
  unlink,
  rm,
  rmdir,
  rename,
  chmod,
  utimes,
  copyFile,
} = fs.promises;

export default fs.promises;
