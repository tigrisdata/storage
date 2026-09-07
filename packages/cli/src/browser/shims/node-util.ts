/**
 * `node:util` — the `util` npm package plus `stripVTControlCharacters`.
 *
 * commander@15 imports `stripVTControlCharacters` to measure help text width.
 * It landed in Node 16.11, well after `util@0.12.5` (the browser shim package)
 * was last published, so it has to be supplied here.
 *
 * Only `node:util` is aliased to this file — bare `util` still resolves to the
 * npm package, which is what the import below picks up.
 */

import nodeUtil from 'util';

const ESC = String.fromCharCode(27);
// CSI sequences (colour, cursor moves) and OSC sequences (window title, links).
const ANSI = new RegExp(
  `${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${ESC}\\u0007]*(?:\\u0007|${ESC}\\\\)`,
  'g'
);

export function stripVTControlCharacters(text: string): string {
  return text.replace(ANSI, '');
}

export const {
  format,
  formatWithOptions,
  deprecate,
  debuglog,
  inspect,
  types,
  promisify,
  callbackify,
  inherits,
  isDeepStrictEqual,
  TextEncoder,
  TextDecoder,
} = nodeUtil;

export default { ...nodeUtil, stripVTControlCharacters };
