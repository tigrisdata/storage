import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tigrisdata/storage", () => ({
	getPresignedUrl: vi.fn(),
	createBucketSnapshot: vi.fn(),
	listBucketSnapshots: vi.fn(),
	createBucket: vi.fn(),
	listBuckets: vi.fn(),
	bundle: vi.fn(),
}));

import {
	bundle,
	createBucket,
	createBucketSnapshot,
	getPresignedUrl,
	listBucketSnapshots,
	listBuckets,
} from "@tigrisdata/storage";
import { createBundleCommand } from "../src/commands/bundle.js";
import { createForkCommand, createForksListCommand } from "../src/commands/fork.js";
import { createPresignCommand } from "../src/commands/presign.js";
import { createSnapshotCommand } from "../src/commands/snapshot.js";

const config = { bucket: "test-bucket" };

// Minimal CommandContext for testing
function makeCtx() {
	return {
		fs: {} as never,
		cwd: "/",
		env: new Map<string, string>(),
		stdin: "",
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("presign", () => {
	const cmd = createPresignCommand(config);

	it("returns error when path is missing", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing path");
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
			config,
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

	it("returns error when bucket is missing", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing bucket");
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

	it("returns error when arguments are missing", async () => {
		const result = await cmd.execute(["source-only"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing arguments");
	});

	it("creates a fork", async () => {
		vi.mocked(createBucket).mockResolvedValue({ data: {} as never });

		const result = await cmd.execute(["source-bucket", "my-fork"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("my-fork");
		expect(vi.mocked(createBucket)).toHaveBeenCalledWith("my-fork", {
			sourceBucketName: "source-bucket",
			config,
		});
	});

	it("creates a fork from a snapshot", async () => {
		vi.mocked(createBucket).mockResolvedValue({ data: {} as never });

		await cmd.execute(["source", "fork-name", "--snapshot", "1713200000"], makeCtx());
		expect(vi.mocked(createBucket)).toHaveBeenCalledWith("fork-name", {
			sourceBucketName: "source",
			sourceBucketSnapshot: "1713200000",
			config,
		});
	});

	it("returns error on SDK failure", async () => {
		vi.mocked(createBucket).mockResolvedValue({ error: new Error("already exists") });

		const result = await cmd.execute(["source", "fork"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("already exists");
	});
});

describe("forks", () => {
	const cmd = createForksListCommand(config);

	it("returns error when bucket is missing", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing bucket");
	});

	it("lists buckets", async () => {
		vi.mocked(listBuckets).mockResolvedValue({
			data: {
				buckets: [
					{ name: "bucket-a", creationDate: new Date() },
					{ name: "bucket-b", creationDate: new Date() },
				],
				owner: { name: "test", id: "1" },
			},
		});

		const result = await cmd.execute(["my-bucket"], makeCtx());
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("bucket-a");
		expect(result.stdout).toContain("bucket-b");
	});
});

describe("bundle", () => {
	const cmd = createBundleCommand(config);

	it("returns error when no files specified", async () => {
		const result = await cmd.execute([], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("missing file");
	});

	it("bundles files", async () => {
		vi.mocked(bundle).mockResolvedValue({
			data: { contentType: "application/x-tar", body: new ReadableStream() },
		});

		const result = await cmd.execute(["/a.txt", "/b.txt"], makeCtx());
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout);
		expect(output.keys).toEqual(["a.txt", "b.txt"]);
		expect(output.compression).toBe("none");
	});

	it("passes gzip compression flag", async () => {
		vi.mocked(bundle).mockResolvedValue({
			data: { contentType: "application/gzip", body: new ReadableStream() },
		});

		await cmd.execute(["/a.txt", "--gzip"], makeCtx());
		expect(vi.mocked(bundle)).toHaveBeenCalledWith(["a.txt"], {
			compression: "gzip",
			config,
		});
	});

	it("returns error on SDK failure", async () => {
		vi.mocked(bundle).mockResolvedValue({ error: new Error("timeout") });

		const result = await cmd.execute(["/file.txt"], makeCtx());
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("timeout");
	});
});
