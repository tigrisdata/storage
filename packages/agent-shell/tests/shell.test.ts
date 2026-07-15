import { afterEach, describe, expect, it, vi } from "vitest";
import { TigrisShell } from "../src/shell.js";
import {
	mockListResponse,
	mockPutResponse,
	TEST_CONFIG,
	TEST_CONFIG_WITH_BUCKET,
} from "./helpers.js";

vi.mock("@tigrisdata/storage", () => ({
	get: vi.fn(),
	put: vi.fn(),
	head: vi.fn(),
	list: vi.fn(),
	remove: vi.fn(),
	updateObject: vi.fn(),
	getPresignedUrl: vi.fn(),
	createBucketSnapshot: vi.fn(),
	listBucketSnapshots: vi.fn(),
	createBucket: vi.fn(),
	listBuckets: vi.fn(),
	bundle: vi.fn(),
}));

import { createBucketSnapshot, getPresignedUrl, list, put, remove } from "@tigrisdata/storage";

afterEach(() => {
	vi.clearAllMocks();
});

describe("TigrisShell", () => {
	describe("constructor", () => {
		it("creates with config and bucket", () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			expect(shell).toBeDefined();
			expect(shell.engine).toBeDefined();
		});

		it("creates without bucket", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			expect(shell).toBeDefined();
			expect(shell.listMounts()).toEqual([]);
		});

		it("auto-mounts at /workspace when bucket provided", () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			expect(shell.listMounts()).toEqual([{ bucket: "test", mountPoint: "/workspace" }]);
		});

		it("accepts shell options", () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET, { cwd: "/custom" });
			expect(shell.engine.getCwd()).toBe("/custom");
		});

		it("defaults cwd to /workspace", () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			expect(shell.engine.getCwd()).toBe("/workspace");
		});

		it("passes env to bash", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET, { env: { MY_VAR: "hello" } });
			const result = await shell.exec("echo $MY_VAR");
			expect(result.stdout.trim()).toBe("hello");
		});

		it("throws without auth", () => {
			expect(() => new TigrisShell({})).toThrow("requires either");
		});

		it("throws with partial access key auth", () => {
			expect(() => new TigrisShell({ accessKeyId: "tid_test" })).toThrow("requires either");
		});

		it("works with session token auth", () => {
			const shell = new TigrisShell({
				sessionToken: "token_test",
				organizationId: "org_test",
				bucket: "test",
			});
			expect(shell.listMounts()).toEqual([{ bucket: "test", mountPoint: "/workspace" }]);
		});
	});

	describe("mount and unmount", () => {
		it("mounts a bucket at a path", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("my-bucket", "/data");

			expect(shell.listMounts()).toEqual([{ bucket: "my-bucket", mountPoint: "/data" }]);
		});

		it("mounts multiple buckets", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("bucket-a", "/data");
			shell.mount("bucket-b", "/models");

			expect(shell.listMounts()).toEqual([
				{ bucket: "bucket-a", mountPoint: "/data" },
				{ bucket: "bucket-b", mountPoint: "/models" },
			]);
		});

		it("unmounts a path", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("my-bucket", "/data");
			shell.unmount("/data");

			expect(shell.listMounts()).toEqual([]);
		});

		it("throws when mounting at already-mounted path", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("bucket-a", "/data");
			expect(() => shell.mount("bucket-b", "/data")).toThrow("Already mounted at /data");
		});

		it("throws when unmounting non-existent mount", () => {
			const shell = new TigrisShell(TEST_CONFIG);
			expect(() => shell.unmount("/data")).toThrow("No mount at /data");
		});
	});

	describe("exec", () => {
		it("executes basic bash commands", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			const result = await shell.exec('echo "hello"');
			expect(result.stdout).toBe("hello\n");
			expect(result.exitCode).toBe(0);
		});

		it("writes and reads files in /workspace", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			await shell.exec('echo "content" > file.txt');
			const result = await shell.exec("cat file.txt");
			expect(result.stdout.trim()).toBe("content");
		});

		it("supports pipes", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			await shell.exec('echo "hello world" > file.txt');
			const result = await shell.exec("cat file.txt | tr a-z A-Z");
			expect(result.stdout.trim()).toBe("HELLO WORLD");
		});

		it("supports mkdir and ls", async () => {
			vi.mocked(list).mockResolvedValue(mockListResponse());

			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			await shell.exec("mkdir -p dir/sub");
			await shell.exec('echo "data" > dir/sub/file.txt');
			const result = await shell.exec("ls dir/sub");
			expect(result.stdout.trim()).toBe("file.txt");
		});

		it("uses /tmp as in-memory scratch space", async () => {
			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			await shell.exec('echo "temp" > /tmp/scratch.txt');
			const result = await shell.exec("cat /tmp/scratch.txt");
			expect(result.stdout.trim()).toBe("temp");
		});

		it("/tmp is separate from /workspace", async () => {
			vi.mocked(list).mockResolvedValue(mockListResponse());

			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);

			await shell.exec('echo "workspace" > /workspace/a.txt');
			await shell.exec('echo "tmp" > /tmp/b.txt');

			const wsResult = await shell.exec("ls /workspace");
			expect(wsResult.stdout.trim()).toBe("a.txt");

			const tmpResult = await shell.exec("ls /tmp");
			expect(tmpResult.stdout.trim()).toBe("b.txt");
		});
	});

	describe("tigris commands via exec", () => {
		it("presign command works through exec", async () => {
			vi.mocked(getPresignedUrl).mockResolvedValue({
				data: { url: "https://signed.url", expiresIn: 3600, operation: "get" },
			});

			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			const result = await shell.exec("presign /file.txt");

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("https://signed.url");
		});

		it("snapshot command works through exec", async () => {
			vi.mocked(createBucketSnapshot).mockResolvedValue({
				data: { snapshotVersion: "1713200000" },
			});

			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			const result = await shell.exec("snapshot test-bucket");

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("1713200000");
		});
	});

	describe("flush", () => {
		it("flushes all mounts", async () => {
			vi.mocked(put).mockResolvedValue(mockPutResponse());

			const shell = new TigrisShell(TEST_CONFIG_WITH_BUCKET);
			await shell.exec('echo "data" > file.txt');
			await shell.flush();

			expect(vi.mocked(put)).toHaveBeenCalled();
		});

		it("flushes specific mount", async () => {
			vi.mocked(put).mockResolvedValue(mockPutResponse());

			const shell = new TigrisShell(TEST_CONFIG);
			shell.mount("bucket-a", "/data");
			shell.mount("bucket-b", "/models");

			// Write to /data only
			await shell.engine.exec('echo "test" > /data/file.txt');
			await shell.flush("/data");

			expect(vi.mocked(put)).toHaveBeenCalledTimes(1);
		});

		it("throws when flushing non-existent mount", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			await expect(shell.flush("/data")).rejects.toThrow("No mount at /data");
		});

		it("flush is a no-op when no mounts", async () => {
			const shell = new TigrisShell(TEST_CONFIG);
			await shell.flush();

			expect(vi.mocked(put)).not.toHaveBeenCalled();
			expect(vi.mocked(remove)).not.toHaveBeenCalled();
		});
	});
});
