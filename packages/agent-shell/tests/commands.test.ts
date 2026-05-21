import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tigrisdata/storage", () => ({
	getPresignedUrl: vi.fn(),
	createBucketSnapshot: vi.fn(),
	listBucketSnapshots: vi.fn(),
	createBucket: vi.fn(),
	listForks: vi.fn(),
}));

import {
	createBucket,
	createBucketSnapshot,
	getPresignedUrl,
	listBucketSnapshots,
	listForks,
} from "@tigrisdata/storage";
import { EMPTY_BYTES } from "just-bash";
import { createForkCommand } from "../src/commands/fork.js";
import { createPresignCommand } from "../src/commands/presign.js";
import { createSnapshotCommand } from "../src/commands/snapshot.js";
import { TEST_CONFIG_WITH_BUCKET } from "./helpers.js";

const config = TEST_CONFIG_WITH_BUCKET;

// Minimal CommandContext for testing
function makeCtx(cwd = "/") {
	return {
		fs: {} as never,
		cwd,
		env: new Map<string, string>(),
		stdin: EMPTY_BYTES,
	};
}

// Resolves any path under /<bucket>/* to that bucket. Used to test the
// cwd-bucket fallback in snapshot and fork.
function stubResolveBucket(path: string): { bucket: string; key: string } | null {
	const match = /^\/([^/]+)(?:\/(.*))?$/.exec(path);
	if (!match) return null;
	return { bucket: match[1] ?? "", key: match[2] ?? "" };
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("presign", () => {
	const cmd = createPresignCommand(config);

	it("returns error when path is missing", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing <path>");
		expect(result.stderr).toContain("Usage: presign");
	});

	it("rejects unknown options", async () => {
		const result = await cmd.execute(["/f.txt", "--exires", "60"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unknown option: --exires");
	});

	it("rejects extra positional args", async () => {
		const result = await cmd.execute(["/a.txt", "/b.txt"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unexpected argument: /b.txt");
	});

	it("rejects --expires without a value", async () => {
		const result = await cmd.execute(["/f.txt", "--expires"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--expires requires a value");
	});

	it("rejects non-numeric --expires", async () => {
		const result = await cmd.execute(["/f.txt", "--expires", "abc"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--expires must be a positive integer");
	});

	it("rejects non-positive --expires", async () => {
		const result = await cmd.execute(["/f.txt", "--expires", "-1"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--expires must be a positive integer");
	});

	it("generates a GET presigned URL", async () => {
		vi.mocked(getPresignedUrl).mockResolvedValue({
			data: { url: "https://example.com/signed", expiresIn: 3600, operation: "get" },
		});

		const result = await cmd.execute(["/file.txt"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("https://example.com/signed");
		expect(vi.mocked(getPresignedUrl)).toHaveBeenCalledWith("file.txt", {
			operation: "get",
			expiresIn: 3600,
			accessKeyId: "tid_test",
			config,
		});
	});

	it("parses --put and --expires flags", async () => {
		vi.mocked(getPresignedUrl).mockResolvedValue({
			data: { url: "https://example.com/upload", expiresIn: 7200, operation: "put" },
		});

		const result = await cmd.execute(["/file.txt", "--put", "--expires", "7200"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(vi.mocked(getPresignedUrl)).toHaveBeenCalledWith("file.txt", {
			operation: "put",
			expiresIn: 7200,
			accessKeyId: "tid_test",
			config,
		});
	});

	it("--key overrides the configured access key", async () => {
		vi.mocked(getPresignedUrl).mockResolvedValue({
			data: { url: "https://example.com/signed", expiresIn: 3600, operation: "get" },
		});

		const result = await cmd.execute(["/file.txt", "--key", "tid_other"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(vi.mocked(getPresignedUrl)).toHaveBeenCalledWith(
			"file.txt",
			expect.objectContaining({ accessKeyId: "tid_other" }),
		);
	});

	describe("OAuth session (no access key in config)", () => {
		const oauthConfig: typeof config = {
			sessionToken: "session_test",
			organizationId: "org_test",
			bucket: "test",
		};
		const oauthCmd = createPresignCommand(oauthConfig);

		it("errors when --key is not provided", async () => {
			const result = await oauthCmd.execute(["/file.txt"], makeCtx());
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("--key is required");
		});

		it("succeeds when --key is provided", async () => {
			vi.mocked(getPresignedUrl).mockResolvedValue({
				data: { url: "https://example.com/signed", expiresIn: 3600, operation: "get" },
			});

			const result = await oauthCmd.execute(["/file.txt", "--key", "tid_user"], makeCtx());
			expect(result.exitCode).toBe(0);
			expect(vi.mocked(getPresignedUrl)).toHaveBeenCalledWith(
				"file.txt",
				expect.objectContaining({ accessKeyId: "tid_user" }),
			);
		});
	});

	it("returns error on SDK failure", async () => {
		vi.mocked(getPresignedUrl).mockResolvedValue({ error: new Error("denied") });

		const result = await cmd.execute(["/file.txt"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("denied");
	});
});

describe("snapshot", () => {
	const cmd = createSnapshotCommand(config);

	it("returns error when bucket is missing and cwd not in a mount", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing <bucket>");
		expect(result.stderr).toContain("Usage: snapshot");
	});

	it("falls back to cwd bucket when positional omitted", async () => {
		const cmdWithResolve = createSnapshotCommand(config, { resolveBucket: stubResolveBucket });
		vi.mocked(createBucketSnapshot).mockResolvedValue({
			data: { snapshotVersion: "1713200000" },
		});

		const result = await cmdWithResolve.execute([], makeCtx("/my-bucket/sub"));
		expect(result.exitCode).toBe(0);
		expect(vi.mocked(createBucketSnapshot)).toHaveBeenCalledWith(
			"my-bucket",
			expect.objectContaining({ config }),
		);
	});

	it("explicit bucket wins over cwd fallback", async () => {
		const cmdWithResolve = createSnapshotCommand(config, { resolveBucket: stubResolveBucket });
		vi.mocked(createBucketSnapshot).mockResolvedValue({
			data: { snapshotVersion: "1713200000" },
		});

		await cmdWithResolve.execute(["explicit"], makeCtx("/my-bucket"));
		expect(vi.mocked(createBucketSnapshot)).toHaveBeenCalledWith(
			"explicit",
			expect.objectContaining({ config }),
		);
	});

	it("rejects unknown options", async () => {
		const result = await cmd.execute(["b", "--label", "v1"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unknown option: --label");
	});

	it("rejects --name and --list together", async () => {
		const result = await cmd.execute(["b", "--list", "--name", "v1"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("--name and --list cannot be combined");
	});

	it("rejects extra positional args", async () => {
		const result = await cmd.execute(["b", "extra"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unexpected argument: extra");
	});

	it("prints 'No snapshots.' when listing is empty", async () => {
		vi.mocked(listBucketSnapshots).mockResolvedValue({
			data: { snapshots: [] },
		});

		const result = await cmd.execute(["my-bucket", "--list"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("No snapshots.");
	});

	it("creates a snapshot", async () => {
		vi.mocked(createBucketSnapshot).mockResolvedValue({
			data: { snapshotVersion: "1713200000" },
		});

		const result = await cmd.execute(["my-bucket"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("1713200000");
	});

	it("creates a named snapshot", async () => {
		vi.mocked(createBucketSnapshot).mockResolvedValue({
			data: { snapshotVersion: "1713200000" },
		});

		await cmd.execute(["my-bucket", "--name", "checkpoint"], makeCtx());
		expect(vi.mocked(createBucketSnapshot)).toHaveBeenCalledWith("my-bucket", {
			name: "checkpoint",
			config,
		});
	});

	it("lists snapshots", async () => {
		vi.mocked(listBucketSnapshots).mockResolvedValue({
			data: {
				snapshots: [
					{ version: "1713200000", name: "v1", creationDate: new Date("2026-04-15T00:00:00Z") },
					{ version: "1713300000", creationDate: new Date("2026-04-16T00:00:00Z") },
				],
			},
		});

		const result = await cmd.execute(["my-bucket", "--list"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("1713200000");
		expect(result.stdout).toContain("(v1)");
		expect(result.stdout).toContain("1713300000");
	});

	it("returns error on SDK failure", async () => {
		vi.mocked(createBucketSnapshot).mockResolvedValue({ error: new Error("not found") });

		const result = await cmd.execute(["my-bucket"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("not found");
	});
});

describe("fork", () => {
	const cmd = createForkCommand(config);

	it("returns error when neither --name nor --list is given", async () => {
		const result = await cmd.execute(["source-only"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("either --name or --list is required");
	});

	it("returns error when source bucket is missing and cwd not in a mount", async () => {
		const result = await cmd.execute(["--name", "fork-name"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing <source-bucket>");
	});

	it("rejects source == name", async () => {
		const result = await cmd.execute(["same", "--name", "same"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("must differ");
	});

	it("rejects unknown options", async () => {
		const result = await cmd.execute(["a", "--name", "b", "--snap", "v"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unknown option: --snap");
	});

	it("rejects extra positional args", async () => {
		const result = await cmd.execute(["a", "b", "--name", "fork"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("unexpected argument: b");
	});

	it("creates a fork", async () => {
		vi.mocked(createBucket).mockResolvedValue({ data: {} as never });

		const result = await cmd.execute(["source-bucket", "--name", "my-fork"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("my-fork");
		expect(vi.mocked(createBucket)).toHaveBeenCalledWith("my-fork", {
			sourceBucketName: "source-bucket",
			config,
		});
	});

	it("creates a fork from a snapshot", async () => {
		vi.mocked(createBucket).mockResolvedValue({ data: {} as never });

		await cmd.execute(["source", "--name", "fork-name", "--snapshot", "1713200000"], makeCtx());
		expect(vi.mocked(createBucket)).toHaveBeenCalledWith("fork-name", {
			sourceBucketName: "source",
			sourceBucketSnapshot: "1713200000",
			config,
		});
	});

	it("falls back to cwd bucket for source when omitted", async () => {
		const cmdWithResolve = createForkCommand(config, { resolveBucket: stubResolveBucket });
		vi.mocked(createBucket).mockResolvedValue({ data: {} as never });

		await cmdWithResolve.execute(["--name", "new-fork"], makeCtx("/my-bucket/sub"));
		expect(vi.mocked(createBucket)).toHaveBeenCalledWith(
			"new-fork",
			expect.objectContaining({ sourceBucketName: "my-bucket" }),
		);
	});

	it("returns error on SDK failure", async () => {
		vi.mocked(createBucket).mockResolvedValue({ error: new Error("already exists") });

		const result = await cmd.execute(["source", "--name", "fork"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("already exists");
	});

	describe("--list", () => {
		it("returns error when source bucket is missing and cwd not in a mount", async () => {
			const result = await cmd.execute(["--list"], makeCtx());
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("missing <source-bucket>");
		});

		it("falls back to cwd bucket when source omitted", async () => {
			const cmdWithResolve = createForkCommand(config, { resolveBucket: stubResolveBucket });
			vi.mocked(listForks).mockResolvedValue({ data: { forks: [] } });

			const result = await cmdWithResolve.execute(["--list"], makeCtx("/my-bucket"));
			expect(result.exitCode).toBe(0);
			expect(vi.mocked(listForks)).toHaveBeenCalledWith("my-bucket", expect.anything());
		});

		it("rejects extra positional args", async () => {
			const result = await cmd.execute(["a", "b", "--list"], makeCtx());
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("unexpected argument: b");
		});

		it("rejects --snapshot + --list", async () => {
			const result = await cmd.execute(["a", "--list", "--snapshot", "v1"], makeCtx());
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("--snapshot and --list cannot be combined");
		});

		it("rejects --name + --list", async () => {
			const result = await cmd.execute(["a", "--list", "--name", "x"], makeCtx());
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toContain("--name and --list cannot be combined");
		});

		it("prints 'No forks.' when listing is empty", async () => {
			vi.mocked(listForks).mockResolvedValue({ data: { forks: [] } });

			const result = await cmd.execute(["my-bucket", "--list"], makeCtx());
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("No forks.");
		});

		it("lists forks", async () => {
			const now = new Date();
			vi.mocked(listForks).mockResolvedValue({
				data: {
					forks: [
						{
							name: "bucket-a",
							creationDate: now,
							forkCreatedAt: now,
							snapshot: "snap-a",
							snapshotCreatedAt: now,
						},
						{
							name: "bucket-b",
							creationDate: now,
							forkCreatedAt: now,
							snapshot: "snap-b",
							snapshotCreatedAt: now,
						},
					],
				},
			});

			const result = await cmd.execute(["my-bucket", "--list"], makeCtx());
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("bucket-a");
			expect(result.stdout).toContain("bucket-b");
		});
	});
});
