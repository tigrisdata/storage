/**
 * Replaces the free `Buffer` identifier inside the browser bundle.
 * Reached by `memfs` and by `utils/options.ts:readStdin`.
 */
export { Buffer } from 'buffer';
