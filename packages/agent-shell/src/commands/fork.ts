import { createBucket, listBuckets } from "@tigrisdata/storage";
import { defineCommand } from "just-bash";
import type { TigrisConfig } from "../types.js";

/**
 * fork <source-bucket> <fork-name> [--snapshot version]
 *
 * Create a fork of a bucket, optionally from a specific snapshot.
 */
export function createForkCommand(config: TigrisConfig) {
	return defineCommand("fork", async (args) => {
		const sourceBucket = args[0];
		const forkName = args[1];

		if (!sourceBucket || !forkName) {
			return {
				stdout: "",
				stderr:
					"fork: missing arguments\nUsage: fork <source-bucket> <fork-name> [--snapshot version]\n",
				exitCode: 1,
			};
		}

		let snapshotVersion: string | undefined;
		for (let i = 2; i < args.length; i++) {
			if (args[i] === "--snapshot" && args[i + 1]) {
				snapshotVersion = args[i + 1];
				i++;
			}
		}

		const result = await createBucket(forkName, {
			sourceBucketName: sourceBucket,
			...(snapshotVersion !== undefined && { sourceBucketSnapshot: snapshotVersion }),
			config,
		});

		if ("error" in result) {
			return {
				stdout: "",
				stderr: `fork: ${result.error.message}\n`,
				exitCode: 1,
			};
		}

		return {
			stdout: `${forkName}\n`,
			stderr: "",
			exitCode: 0,
		};
	});
}

/**
 * forks <bucket> — list all forks of a bucket.
 */
export function createForksListCommand(config: TigrisConfig) {
	return defineCommand("forks", async (args) => {
		const bucket = args[0];
		if (!bucket) {
			return {
				stdout: "",
				stderr: "forks: missing bucket argument\nUsage: forks <bucket>\n",
				exitCode: 1,
			};
		}

		const result = await listBuckets({ config });
		if ("error" in result) {
			return {
				stdout: "",
				stderr: `forks: ${result.error.message}\n`,
				exitCode: 1,
			};
		}

		const lines = result.data.buckets.map((b) => b.name).join("\n");
		return {
			stdout: lines ? `${lines}\n` : "",
			stderr: "",
			exitCode: 0,
		};
	});
}
