import { getPresignedUrl } from "@tigrisdata/storage";
import { defineCommand } from "just-bash";
import type { TigrisConfig } from "../types.js";

/**
 * presign <path> [--expires N] [--put]
 *
 * Generate a presigned URL for a Tigris object.
 * Defaults to GET with 1 hour expiry.
 */
function parsePresignArgs(args: string[]): {
	expiresIn: number;
	operation: "get" | "put";
} {
	let expiresIn = 3600;
	let operation: "get" | "put" = "get";

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--expires" && args[i + 1]) {
			expiresIn = Number.parseInt(args[i + 1] ?? "3600", 10);
			i++;
		} else if (args[i] === "--put") {
			operation = "put";
		}
	}

	return { expiresIn, operation };
}

export function createPresignCommand(config: TigrisConfig) {
	return defineCommand("presign", async (args) => {
		const path = args[0];
		if (!path) {
			return {
				stdout: "",
				stderr: "presign: missing path argument\nUsage: presign <path> [--expires N] [--put]\n",
				exitCode: 1,
			};
		}

		if (!config.accessKeyId) {
			return {
				stdout: "",
				stderr: "presign: requires access key auth. Use 'configure' instead of 'login'.\n",
				exitCode: 1,
			};
		}

		const { expiresIn, operation } = parsePresignArgs(args.slice(1));
		const key = path.startsWith("/") ? path.slice(1) : path;
		const result = await getPresignedUrl(key, {
			operation,
			expiresIn,
			config,
		});

		if ("error" in result) {
			return {
				stdout: "",
				stderr: `presign: ${result.error.message}\n`,
				exitCode: 1,
			};
		}

		return {
			stdout: `${result.data.url}\n`,
			stderr: "",
			exitCode: 0,
		};
	});
}
