import { createBucketSnapshot, listBucketSnapshots } from "@tigrisdata/storage";
import { defineCommand } from "just-bash";
import type { TigrisConfig } from "../types.js";

/**
 * snapshot <bucket> [--name label] [--list]
 *
 * Create or list point-in-time bucket snapshots.
 */
function parseSnapshotArgs(args: string[]): {
	isList: boolean;
	name: string | undefined;
} {
	let isList = false;
	let name: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--list") {
			isList = true;
		} else if (args[i] === "--name" && args[i + 1]) {
			name = args[i + 1];
			i++;
		}
	}

	return { isList, name };
}

async function listSnapshots(bucket: string, config: TigrisConfig) {
	const result = await listBucketSnapshots(bucket, { config });
	if ("error" in result) {
		return { stdout: "", stderr: `snapshot: ${result.error.message}\n`, exitCode: 1 };
	}
	const lines = result.data.snapshots
		.map((s) => {
			const label = s.name ? ` (${s.name})` : "";
			const date = s.creationDate?.toISOString() ?? "unknown";
			return `${s.version}${label}  ${date}`;
		})
		.join("\n");
	return { stdout: lines ? `${lines}\n` : "", stderr: "", exitCode: 0 };
}

export function createSnapshotCommand(config: TigrisConfig) {
	return defineCommand("snapshot", async (args) => {
		const bucket = args[0];
		if (!bucket) {
			return {
				stdout: "",
				stderr:
					"snapshot: missing bucket argument\nUsage: snapshot <bucket> [--name label] [--list]\n",
				exitCode: 1,
			};
		}

		const { isList, name } = parseSnapshotArgs(args.slice(1));

		if (isList) {
			return listSnapshots(bucket, config);
		}

		const result = await createBucketSnapshot(bucket, {
			...(name !== undefined && { name }),
			config,
		});
		if ("error" in result) {
			return { stdout: "", stderr: `snapshot: ${result.error.message}\n`, exitCode: 1 };
		}

		return { stdout: `${result.data.snapshotVersion}\n`, stderr: "", exitCode: 0 };
	});
}
