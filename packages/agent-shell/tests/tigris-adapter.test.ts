import { afterEach, describe, expect, it, vi } from "vitest";
import { TigrisAdapter } from "../src/fs/tigris-adapter.js";
import {
	mockGetResponse,
	mockHeadResponse,
	mockListResponse,
	mockPutResponse,
	mockUpdateObjectResponse,
	TEST_CONFIG,
} from "./helpers.js";

vi.mock("@tigrisdata/storage", () => ({
	get: vi.fn(),
	put: vi.fn(),
	head: vi.fn(),
	list: vi.fn(),
	remove: vi.fn(),
	updateObject: vi.fn(),
}));

import { get, head, list, put, remove, updateObject } from "@tigrisdata/storage";

const mockedGet = vi.mocked(get);
const mockedPut = vi.mocked(put);
const mockedHead = vi.mocked(head);
const mockedList = vi.mocked(list);
const mockedRemove = vi.mocked(remove);
const mockedUpdateObject = vi.mocked(updateObject);

afterEach(() => {
	vi.clearAllMocks();
});

describe("TigrisAdapter", () => {
	describe("constructor", () => {
		it("stores config", () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(fs.config).toEqual(TEST_CONFIG);
		});
	});

	describe("writeFile and readFile", () => {
		it("writes to cache and reads back without hitting Tigris", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "hello");
			const content = await fs.readFile("/file.txt");

			expect(content).toBe("hello");
			expect(mockedGet).not.toHaveBeenCalled();
		});

		it("fetches from Tigris on cache miss", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue(mockGetResponse("remote content"));
			mockedHead.mockResolvedValue(
				mockHeadResponse({ modified: new Date("2026-01-01"), size: 14 }),
			);

			const content = await fs.readFile("/file.txt");

			expect(content).toBe("remote content");
			expect(mockedGet).toHaveBeenCalledWith("file.txt", "string", { config: TEST_CONFIG });
		});

		it("caches remote reads for subsequent access", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue(mockGetResponse("remote content"));
			mockedHead.mockResolvedValue(mockHeadResponse({ size: 14 }));

			await fs.readFile("/file.txt");
			await fs.readFile("/file.txt");

			expect(mockedGet).toHaveBeenCalledTimes(1);
		});

		it("throws ENOENT for missing files", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue({ error: new Error("not found") });

			await expect(fs.readFile("/missing.txt")).rejects.toThrow("ENOENT");
		});

		it("throws ENOENT for deleted files", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "content");
			await fs.rm("/file.txt");

			await expect(fs.readFile("/file.txt")).rejects.toThrow("ENOENT");
			expect(mockedGet).not.toHaveBeenCalled();
		});
	});

	describe("readFileBuffer", () => {
		it("returns Uint8Array for cached content", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "hello");
			const buf = await fs.readFileBuffer("/file.txt");

			expect(buf).toBeInstanceOf(Uint8Array);
			expect(new TextDecoder().decode(buf)).toBe("hello");
		});
	});

	describe("appendFile", () => {
		it("appends to existing cached file", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "hello");
			await fs.appendFile("/file.txt", " world");

			const content = await fs.readFile("/file.txt");
			expect(content).toBe("hello world");
		});

		it("creates file if it does not exist", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue({ error: new Error("not found") });

			await fs.appendFile("/new.txt", "first line");

			const content = await fs.readFile("/new.txt");
			expect(content).toBe("first line");
		});
	});

	describe("exists", () => {
		it("returns true for cached files", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "content");

			expect(await fs.exists("/file.txt")).toBe(true);
			expect(mockedHead).not.toHaveBeenCalled();
		});

		it("returns false for deleted files", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "content");
			await fs.rm("/file.txt");

			expect(await fs.exists("/file.txt")).toBe(false);
		});

		it("checks Tigris for uncached paths", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedHead.mockResolvedValue(mockHeadResponse({ size: 5 }));

			expect(await fs.exists("/remote.txt")).toBe(true);
			expect(mockedHead).toHaveBeenCalled();
		});

		it("checks list for directory existence", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedHead.mockResolvedValue({ data: undefined });
			mockedList.mockResolvedValue(mockListResponse([{ name: "dir/file.txt", size: 5 }]));

			expect(await fs.exists("/dir")).toBe(true);
		});

		it("returns false when remote calls throw", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedHead.mockRejectedValue(new Error("network error"));

			expect(await fs.exists("/remote.txt")).toBe(false);
		});

		it("uses empty prefix for root / when checking directory existence", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedHead.mockResolvedValue({ data: undefined });
			mockedList.mockResolvedValue(mockListResponse([{ name: "file.txt" }]));

			expect(await fs.exists("/")).toBe(true);

			expect(mockedList).toHaveBeenCalledWith({
				prefix: "",
				delimiter: "/",
				limit: 1,
				config: TEST_CONFIG,
			});
		});
	});

	describe("stat", () => {
		it("returns stat for cached files", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "hello");

			const stat = await fs.stat("/file.txt");
			expect(stat.isFile).toBe(true);
			expect(stat.isDirectory).toBe(false);
			expect(stat.size).toBe(5);
		});

		it("returns stat for cached directories", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.mkdir("/dir");

			const stat = await fs.stat("/dir");
			expect(stat.isFile).toBe(false);
			expect(stat.isDirectory).toBe(true);
		});

		it("throws ENOENT for deleted paths", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "content");
			await fs.rm("/file.txt");

			await expect(fs.stat("/file.txt")).rejects.toThrow("ENOENT");
		});

		it("returns directory stat for root /", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			const stat = await fs.stat("/");
			expect(stat.isFile).toBe(false);
			expect(stat.isDirectory).toBe(true);
			expect(stat.isSymbolicLink).toBe(false);
			expect(mockedHead).not.toHaveBeenCalled();
			expect(mockedList).not.toHaveBeenCalled();
		});
	});

	describe("mkdir and readdir", () => {
		it("creates directories recursively", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.mkdir("/a/b/c", { recursive: true });

			expect(await fs.exists("/a")).toBe(true);
			expect(await fs.exists("/a/b")).toBe(true);
			expect(await fs.exists("/a/b/c")).toBe(true);
		});

		it("lists cached entries", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse());

			await fs.writeFile("/dir/a.txt", "a");
			await fs.writeFile("/dir/b.txt", "b");

			const entries = await fs.readdir("/dir");
			expect(entries).toEqual(["a.txt", "b.txt"]);
		});

		it("merges cached and remote entries", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse([{ name: "dir/remote.txt", size: 5 }]));

			await fs.writeFile("/dir/local.txt", "local");

			const entries = await fs.readdir("/dir");
			expect(entries).toContain("local.txt");
			expect(entries).toContain("remote.txt");
		});

		it("excludes deleted entries from remote listing", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(
				mockListResponse([
					{ name: "dir/keep.txt", size: 5 },
					{ name: "dir/delete.txt", size: 5 },
				]),
			);

			await fs.rm("/dir/delete.txt");

			const entries = await fs.readdir("/dir");
			expect(entries).toContain("keep.txt");
			expect(entries).not.toContain("delete.txt");
		});
	});

	describe("readdir edge cases", () => {
		it("lists entries at root /", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse());

			await fs.writeFile("/a.txt", "a");
			await fs.writeFile("/b.txt", "b");

			const entries = await fs.readdir("/");
			expect(entries).toContain("a.txt");
			expect(entries).toContain("b.txt");
		});

		it("uses empty prefix for root / when listing remote entries", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse([{ name: "remote.txt" }]));

			await fs.readdir("/");

			expect(mockedList).toHaveBeenCalledWith({
				prefix: "",
				delimiter: "/",
				config: TEST_CONFIG,
			});
		});

		it("returns cached entries even when remote list throws", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockRejectedValue(new Error("network error"));

			await fs.writeFile("/cached.txt", "data");

			const entries = await fs.readdir("/");
			expect(entries).toContain("cached.txt");
		});

		it("returns cached entries even when remote list returns error", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue({ error: new Error("access denied") });

			await fs.writeFile("/cached.txt", "data");

			const entries = await fs.readdir("/");
			expect(entries).toContain("cached.txt");
		});

		it("returns sorted entries", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse());

			await fs.writeFile("/dir/z.txt", "z");
			await fs.writeFile("/dir/a.txt", "a");
			await fs.writeFile("/dir/m.txt", "m");

			const entries = await fs.readdir("/dir");
			expect(entries).toEqual(["a.txt", "m.txt", "z.txt"]);
		});

		it("includes subdirectories from commonPrefixes", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse([], ["dir/subdir/"]));

			const entries = await fs.readdir("/dir");
			expect(entries).toContain("subdir");
		});
	});

	describe("cp", () => {
		it("copies file content", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/src.txt", "content");
			await fs.cp("/src.txt", "/dest.txt");

			expect(await fs.readFile("/dest.txt")).toBe("content");
		});

		it("copies directories recursively", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse());

			await fs.writeFile("/src/a.txt", "a");
			await fs.writeFile("/src/b.txt", "b");
			await fs.cp("/src", "/dest", { recursive: true });

			expect(await fs.readFile("/dest/a.txt")).toBe("a");
			expect(await fs.readFile("/dest/b.txt")).toBe("b");
		});

		it("throws EISDIR when copying directory without recursive", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.mkdir("/dir");

			await expect(fs.cp("/dir", "/dest")).rejects.toThrow("EISDIR");
		});
	});

	describe("rm", () => {
		it("deletes a single file", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/file.txt", "content");
			await fs.rm("/file.txt");

			expect(await fs.exists("/file.txt")).toBe(false);
		});

		it("recursively deletes nested directories", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedList.mockResolvedValue(mockListResponse());

			await fs.writeFile("/dir/a.txt", "a");
			await fs.writeFile("/dir/sub/b.txt", "b");
			await fs.rm("/dir", { recursive: true });

			expect(await fs.exists("/dir/a.txt")).toBe(false);
			expect(await fs.exists("/dir/sub/b.txt")).toBe(false);
		});
	});

	describe("mv", () => {
		it("moves dirty files in cache without hitting Tigris", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.writeFile("/old.txt", "content");
			await fs.mv("/old.txt", "/new.txt");

			expect(await fs.readFile("/new.txt")).toBe("content");
			expect(mockedUpdateObject).not.toHaveBeenCalled();
		});

		it("uses updateObject for files on Tigris", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue(mockGetResponse("remote"));
			mockedHead.mockResolvedValue(mockHeadResponse({ size: 6 }));
			await fs.readFile("/remote.txt");

			mockedUpdateObject.mockResolvedValue(mockUpdateObjectResponse());

			await fs.mv("/remote.txt", "/new.txt");

			expect(mockedUpdateObject).toHaveBeenCalledWith("remote.txt", {
				key: "new.txt",
				config: TEST_CONFIG,
			});
		});

		it("falls back to cp+rm when updateObject fails", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedGet.mockResolvedValue(mockGetResponse("remote"));
			mockedHead.mockResolvedValue(mockHeadResponse({ size: 6 }));
			await fs.readFile("/remote.txt");

			mockedUpdateObject.mockResolvedValue({ error: new Error("failed") });
			mockedList.mockResolvedValue(mockListResponse());

			await fs.mv("/remote.txt", "/new.txt");

			expect(await fs.readFile("/new.txt")).toBe("remote");
		});
	});

	describe("symlink and link", () => {
		it("throws EPERM for symlink", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await expect(fs.symlink("/target", "/link")).rejects.toThrow("EPERM");
		});

		it("throws EPERM for hard link", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await expect(fs.link("/existing", "/new")).rejects.toThrow("EPERM");
		});

		it("throws EINVAL for readlink", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await expect(fs.readlink("/path")).rejects.toThrow("EINVAL");
		});
	});

	describe("no-op methods", () => {
		it("chmod does not throw", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await fs.writeFile("/file.txt", "content");
			await expect(fs.chmod("/file.txt", 0o777)).resolves.toBeUndefined();
		});

		it("utimes does not throw", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await fs.writeFile("/file.txt", "content");
			await expect(fs.utimes("/file.txt", new Date(), new Date())).resolves.toBeUndefined();
		});
	});

	describe("lstat", () => {
		it("delegates to stat", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await fs.writeFile("/file.txt", "hello");

			const stat = await fs.lstat("/file.txt");
			expect(stat.isFile).toBe(true);
			expect(stat.isSymbolicLink).toBe(false);
		});
	});

	describe("realpath", () => {
		it("returns normalized path", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(await fs.realpath("/a/b/../c")).toBe("/a/c");
		});

		it("normalizes . segments", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(await fs.realpath("/a/./b/./c")).toBe("/a/b/c");
		});
	});

	describe("getAllPaths", () => {
		it("returns only cached paths", () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(fs.getAllPaths()).toEqual([]);
		});

		it("includes written files and directories", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			await fs.writeFile("/file.txt", "content");
			await fs.mkdir("/dir");

			const paths = fs.getAllPaths();
			expect(paths).toContain("/file.txt");
			expect(paths).toContain("/dir");
		});
	});

	describe("flush", () => {
		it("puts dirty entries to Tigris", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedPut.mockResolvedValue(mockPutResponse());

			await fs.writeFile("/a.txt", "aaa");
			await fs.writeFile("/b.txt", "bbb");
			await fs.flush();

			expect(mockedPut).toHaveBeenCalledTimes(2);
			expect(mockedPut).toHaveBeenCalledWith("a.txt", "aaa", { config: TEST_CONFIG });
			expect(mockedPut).toHaveBeenCalledWith("b.txt", "bbb", { config: TEST_CONFIG });
		});

		it("removes deleted paths from Tigris", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedRemove.mockResolvedValue({ data: undefined });

			await fs.writeFile("/file.txt", "content");
			await fs.rm("/file.txt");
			await fs.flush();

			expect(mockedRemove).toHaveBeenCalledWith("file.txt", { config: TEST_CONFIG });
		});

		it("is a no-op when nothing is dirty", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			await fs.flush();

			expect(mockedPut).not.toHaveBeenCalled();
			expect(mockedRemove).not.toHaveBeenCalled();
		});

		it("flushes Uint8Array content as Buffer", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedPut.mockResolvedValue(mockPutResponse());

			const binary = new TextEncoder().encode("binary data");
			await fs.writeFile("/bin.dat", binary);
			await fs.flush();

			expect(mockedPut).toHaveBeenCalledTimes(1);
			const calledBody = mockedPut.mock.calls[0]?.[1];
			expect(Buffer.isBuffer(calledBody)).toBe(true);
		});

		it("throws AggregateError on SDK failures", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedPut.mockResolvedValue({ error: new Error("upload failed") });

			await fs.writeFile("/file.txt", "content");

			await expect(fs.flush()).rejects.toThrow("flush failed");
		});

		it("reports all errors in AggregateError", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedPut.mockResolvedValue({ error: new Error("upload failed") });
			mockedRemove.mockResolvedValue({ error: new Error("delete failed") });

			await fs.writeFile("/a.txt", "a");
			await fs.writeFile("/b.txt", "b");
			await fs.rm("/c.txt");

			try {
				await fs.flush();
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(AggregateError);
				const agg = err as AggregateError;
				expect(agg.errors).toHaveLength(3);
			}
		});

		it("does not mark clean on failure", async () => {
			const fs = new TigrisAdapter(TEST_CONFIG);

			mockedPut.mockResolvedValue({ error: new Error("upload failed") });

			await fs.writeFile("/file.txt", "content");

			try {
				await fs.flush();
			} catch {
				// expected
			}

			expect(fs.getAllPaths()).toContain("/file.txt");
		});
	});

	describe("resolvePath", () => {
		it("resolves relative paths", () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(fs.resolvePath("/workspace", "file.txt")).toBe("/workspace/file.txt");
		});

		it("returns absolute paths as-is", () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(fs.resolvePath("/workspace", "/other/file.txt")).toBe("/other/file.txt");
		});

		it("resolves .. segments", () => {
			const fs = new TigrisAdapter(TEST_CONFIG);
			expect(fs.resolvePath("/a/b", "../c.txt")).toBe("/a/c.txt");
		});
	});
});
