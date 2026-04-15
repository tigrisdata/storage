import { afterEach, describe, expect, it, vi } from "vitest";
import { TigrisShell } from "../src/shell.js";
import { mockListResponse, mockPutResponse } from "./helpers.js";

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
		it("creates with no arguments", () => {
			const shell = new TigrisShell();
			expect(shell).toBeDefined();
			expect(shell.engine).toBeDefined();
			expect(shell.fs).toBeDefined();
		});

		it("accepts storage config", () => {
			const shell = new TigrisShell({ bucket: "test" });
			expect(shell.fs.config).toEqual({ bucket: "test" });
		});

		it("accepts shell options", () => {
			const shell = new TigrisShell({ bucket: "test" }, { cwd: "/custom" });
			expect(shell.engine.getCwd()).toBe("/custom");
		});

		it("defaults cwd to /workspace", () => {
			const shell = new TigrisShell();
			expect(shell.engine.getCwd()).toBe("/workspace");
		});

		it("passes env to bash", async () => {
			const shell = new TigrisShell({}, { env: { MY_VAR: "hello" } });
			const result = await shell.exec("echo $MY_VAR");
			expect(result.stdout.trim()).toBe("hello");
		});
	});

	describe("exec", () => {
		it("executes basic bash commands", async () => {
			const shell = new TigrisShell();

			const result = await shell.exec('echo "hello"');
			expect(result.stdout).toBe("hello\n");
			expect(result.exitCode).toBe(0);
		});

		it("writes and reads files in /workspace", async () => {
			const shell = new TigrisShell();

			await shell.exec('echo "content" > file.txt');
			const result = await shell.exec("cat file.txt");
			expect(result.stdout.trim()).toBe("content");
		});

		it("supports pipes", async () => {
			const shell = new TigrisShell();

			await shell.exec('echo "hello world" > file.txt');
			const result = await shell.exec("cat file.txt | tr a-z A-Z");
			expect(result.stdout.trim()).toBe("HELLO WORLD");
		});

		it("supports mkdir and ls", async () => {
			vi.mocked(list).mockResolvedValue(mockListResponse());

			const shell = new TigrisShell();

			await shell.exec("mkdir -p dir/sub");
			await shell.exec('echo "data" > dir/sub/file.txt');
			const result = await shell.exec("ls dir/sub");
			expect(result.stdout.trim()).toBe("file.txt");
		});

		it("uses /tmp as in-memory scratch space", async () => {
			const shell = new TigrisShell();

			await shell.exec('echo "temp" > /tmp/scratch.txt');
			const result = await shell.exec("cat /tmp/scratch.txt");
			expect(result.stdout.trim()).toBe("temp");
		});

		it("/tmp is separate from /workspace", async () => {
			vi.mocked(list).mockResolvedValue(mockListResponse());

			const shell = new TigrisShell();

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

			const shell = new TigrisShell({ bucket: "test" });
			const result = await shell.exec("presign /file.txt");

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("https://signed.url");
		});

		it("snapshot command works through exec", async () => {
			vi.mocked(createBucketSnapshot).mockResolvedValue({
				data: { snapshotVersion: "1713200000" },
			});

			const shell = new TigrisShell({ bucket: "test" });
			const result = await shell.exec("snapshot test-bucket");

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("1713200000");
		});
	});

	describe("flush", () => {
		it("delegates to TigrisAdapter.flush", async () => {
			vi.mocked(put).mockResolvedValue(mockPutResponse());

			const shell = new TigrisShell({ bucket: "test" });
			await shell.exec('echo "data" > file.txt');
			await shell.flush();

			expect(vi.mocked(put)).toHaveBeenCalled();
		});

		it("flush is a no-op when no writes occurred", async () => {
			const shell = new TigrisShell({ bucket: "test" });
			await shell.flush();

			expect(vi.mocked(put)).not.toHaveBeenCalled();
			expect(vi.mocked(remove)).not.toHaveBeenCalled();
		});
	});
});
