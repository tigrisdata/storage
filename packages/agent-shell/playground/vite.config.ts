import { defineConfig } from "vite";

export default defineConfig({
	root: ".",
	build: {
		outDir: "dist",
	},
	resolve: {
		alias: {
			// Stub node:zlib — just-bash browser bundle references gunzipSync
			// for gzip command support, but we don't need it in the playground
			"node:zlib": new URL("./src/stubs/zlib.ts", import.meta.url).pathname,
		},
	},
});
