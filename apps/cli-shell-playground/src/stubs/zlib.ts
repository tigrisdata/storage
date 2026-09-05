/**
 * Stub for `node:zlib`.
 *
 * just-bash's browser bundle imports it for `gzip`/`gunzip`/`zcat`. Those are
 * the only commands that need it, so failing loudly beats shipping a
 * compression library nobody asked for.
 */

function unsupported(): never {
  throw new Error(
    'Compression commands are not available in the browser shell'
  );
}

export const gzipSync = unsupported;
export const gunzipSync = unsupported;
export const inflateSync = unsupported;
export const deflateSync = unsupported;

export const constants = {
  Z_BEST_COMPRESSION: 9,
  Z_BEST_SPEED: 1,
  Z_DEFAULT_COMPRESSION: -1,
};

export default { gzipSync, gunzipSync, inflateSync, deflateSync, constants };
