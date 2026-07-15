// Stub for node:zlib — gzip/gunzip commands won't work in browser
export function gunzipSync(): never {
	throw new Error("gzip is not supported in the browser");
}
export function gzipSync(): never {
	throw new Error("gzip is not supported in the browser");
}
export const constants = {
	Z_BEST_COMPRESSION: 9,
	Z_BEST_SPEED: 1,
	Z_DEFAULT_COMPRESSION: -1,
};
