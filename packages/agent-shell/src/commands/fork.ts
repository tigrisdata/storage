import { createBucket, listForks } from "@tigrisdata/storage";
import { defineCommand, type ExecResult } from "just-bash";
import type { TigrisConfig } from "../types.js";
import { argError, type FlagSchema, parseFlags, sdkError } from "./args.js";

const USAGE =
	"fork [<source-bucket>] --name <fork-name> [--snapshot version] | fork [<source-bucket>] --list";
const SCHEMA: FlagSchema = {
	"--name": "value",
	"--snapshot": "value",
	"--list": "boolean",
};

export interface ForkOptions {
	/** Resolve cwd to a mounted bucket so <source-bucket> can be omitted. */
	resolveBucket?: (path: string) => { bucket: string; key: string } | null;
}

type ForkInput =
	| { mode: "create"; sourceBucket: string; forkName: string; snapshotVersion: string | undefined }
	| { mode: "list"; sourceBucket: string };

export function createForkCommand(config: TigrisConfig, options?: ForkOptions) {
	return defineCommand("fork", async (args, ctx) => {
		const input = parseInput(args, ctx.cwd, options);
		if ("stderr" in input) return input;

		if (input.mode === "list") return listForksOf(input.sourceBucket, config);

		const result = await createBucket(input.forkName, {
			sourceBucketName: input.sourceBucket,
			...(input.snapshotVersion !== undefined && {
				sourceBucketSnapshot: input.snapshotVersion,
			}),
			config,
		});
		if ("error" in result) return sdkError("fork", result.error);

		return { stdout: `${input.forkName}\n`, stderr: "", exitCode: 0 };
	});
}

function parseInput(
	args: string[],
	cwd: string,
	options: ForkOptions | undefined,
): ForkInput | ExecResult {
	const parsed = parseFlags(args, SCHEMA);
	if ("error" in parsed) return argError("fork", parsed.error, USAGE);
	const { flags, positional } = parsed;

	if (positional.length > 1) {
		return argError("fork", `unexpected argument: ${positional[1]}`, USAGE);
	}

	const isList = flags["--list"] === true;
	const forkName = typeof flags["--name"] === "string" ? flags["--name"] : undefined;
	const snapshotVersion = typeof flags["--snapshot"] === "string" ? flags["--snapshot"] : undefined;

	if (isList && forkName !== undefined) {
		return argError("fork", "--name and --list cannot be combined", USAGE);
	}
	if (isList && snapshotVersion !== undefined) {
		return argError("fork", "--snapshot and --list cannot be combined", USAGE);
	}
	if (!isList && forkName === undefined) {
		return argError("fork", "either --name or --list is required", USAGE);
	}

	const sourceBucket = positional[0] ?? options?.resolveBucket?.(cwd)?.bucket;
	if (!sourceBucket) {
		return argError("fork", "missing <source-bucket> (cwd not in a mounted bucket)", USAGE);
	}

	if (isList) return { mode: "list", sourceBucket };

	if (sourceBucket === forkName) {
		return argError("fork", "<source-bucket> and --name must differ");
	}

	return { mode: "create", sourceBucket, forkName: forkName as string, snapshotVersion };
}

async function listForksOf(bucket: string, config: TigrisConfig) {
	const result = await listForks(bucket, { config });
	if ("error" in result) return sdkError("fork", result.error);

	const forks = result.data.forks;
	if (forks.length === 0) {
		return { stdout: "No forks.\n", stderr: "", exitCode: 0 };
	}
	const lines = forks.map((b) => b.name).join("\n");
	return { stdout: `${lines}\n`, stderr: "", exitCode: 0 };
}
