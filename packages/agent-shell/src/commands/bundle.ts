import { bundle } from "@tigrisdata/storage";
import { defineCommand } from "just-bash";
import type { TigrisConfig } from "../types.js";

/**
 * bundle <file1> <file2> ... [--gzip|--zstd]
 *
 * Batch-download multiple objects as a streaming tar archive.
 * Returns archive info (content type, compression) to stdout.
 */
export function createBundleCommand(config: TigrisConfig) {
	return defineCommand("bundle", async (args) => {
		const keys: string[] = [];
		let compression: "none" | "gzip" | "zstd" = "none";

		for (const arg of args) {
			if (arg === "--gzip") {
				compression = "gzip";
			} else if (arg === "--zstd") {
				compression = "zstd";
			} else {
				// Strip leading slash for Tigris keys
				keys.push(arg.startsWith("/") ? arg.slice(1) : arg);
			}
		}

		if (keys.length === 0) {
			return {
				stdout: "",
				stderr:
					"bundle: missing file arguments\nUsage: bundle <file1> <file2> ... [--gzip|--zstd]\n",
				exitCode: 1,
			};
		}

		const result = await bundle(keys, {
			compression,
			config,
		});

		if ("error" in result) {
			return {
				stdout: "",
				stderr: `bundle: ${result.error.message}\n`,
				exitCode: 1,
			};
		}

		const output = JSON.stringify(
			{
				contentType: result.data.contentType,
				compression,
				keys,
			},
			null,
			2,
		);

		return {
			stdout: `${output}\n`,
			stderr: "",
			exitCode: 0,
		};
	});
}
