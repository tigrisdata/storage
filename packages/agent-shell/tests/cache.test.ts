import { describe, expect, it } from "vitest";
import { FsCache } from "../src/fs/cache.js";

function expectFile(cache: FsCache, path: string) {
	const entry = cache.get(path);
	expect(entry).toBeDefined();
	if (!entry || !FsCache.isFile(entry)) throw new Error(`expected file at ${path}`);
	return entry;
}

function expectDirectory(cache: FsCache, path: string) {
	const entry = cache.get(path);
	expect(entry).toBeDefined();
	if (!entry || !FsCache.isDirectory(entry)) throw new Error(`expected directory at ${path}`);
	return entry;
}

describe("FsCache", () => {
	describe("set and get", () => {
		it("stores and retrieves a file entry", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "hello", 0o644);

			const entry = expectFile(cache, "/file.txt");
			expect(entry.content).toBe("hello");
			expect(entry.dirty).toBe(true);
			expect(entry.mode).toBe(0o644);
		});

		it("stores Uint8Array content", () => {
			const cache = new FsCache();
			const content = new TextEncoder().encode("binary data");
			cache.set("/bin.dat", content, 0o644);

			const entry = expectFile(cache, "/bin.dat");
			expect(entry.content).toBe(content);
		});

		it("returns undefined for missing paths", () => {
			const cache = new FsCache();
			expect(cache.get("/missing")).toBeUndefined();
		});

		it("calculates size for string content", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "hello", 0o644);

			const entry = expectFile(cache, "/file.txt");
			expect(entry.size).toBe(5);
		});

		it("calculates size for multi-byte string content", () => {
			const cache = new FsCache();
			cache.set("/emoji.txt", "👋", 0o644);

			const entry = expectFile(cache, "/emoji.txt");
			expect(entry.size).toBe(4);
		});
	});

	describe("cache (non-dirty)", () => {
		it("stores entries as non-dirty", () => {
			const cache = new FsCache();
			cache.cache("/file.txt", "content", 0o644, new Date("2026-01-01"));

			const entry = expectFile(cache, "/file.txt");
			expect(entry.dirty).toBe(false);
			expect(entry.mtime).toEqual(new Date("2026-01-01"));
		});
	});

	describe("directories", () => {
		it("stores and retrieves directory markers", () => {
			const cache = new FsCache();
			cache.setDirectory("/dir", 0o755);

			const entry = expectDirectory(cache, "/dir");
			expect(entry.mode).toBe(0o755);
		});

		it("distinguishes files from directories", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "content", 0o644);
			cache.setDirectory("/dir", 0o755);

			const file = cache.get("/file.txt");
			const dir = cache.get("/dir");
			expect(file && FsCache.isFile(file)).toBe(true);
			expect(file && FsCache.isDirectory(file)).toBe(false);
			expect(dir && FsCache.isDirectory(dir)).toBe(true);
			expect(dir && FsCache.isFile(dir)).toBe(false);
		});
	});

	describe("delete and isDeleted", () => {
		it("marks paths as deleted", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "content", 0o644);
			cache.delete("/file.txt");

			expect(cache.get("/file.txt")).toBeUndefined();
			expect(cache.isDeleted("/file.txt")).toBe(true);
			expect(cache.has("/file.txt")).toBe(false);
		});

		it("tracks deletion of paths that were never cached", () => {
			const cache = new FsCache();
			cache.delete("/remote-file.txt");

			expect(cache.isDeleted("/remote-file.txt")).toBe(true);
		});

		it("clears deleted status when path is re-created", () => {
			const cache = new FsCache();
			cache.delete("/file.txt");
			expect(cache.isDeleted("/file.txt")).toBe(true);

			cache.set("/file.txt", "new content", 0o644);
			expect(cache.isDeleted("/file.txt")).toBe(false);
			expect(cache.has("/file.txt")).toBe(true);
		});
	});

	describe("getDirtyEntries", () => {
		it("returns only dirty file entries", () => {
			const cache = new FsCache();
			cache.set("/dirty.txt", "dirty", 0o644);
			cache.cache("/clean.txt", "clean", 0o644, new Date());
			cache.setDirectory("/dir", 0o755);

			const dirty = cache.getDirtyEntries();
			expect(dirty).toHaveLength(1);
			expect(dirty[0]?.path).toBe("/dirty.txt");
			expect(dirty[0]?.entry.content).toBe("dirty");
		});
	});

	describe("getDeletedPaths", () => {
		it("returns all deleted paths", () => {
			const cache = new FsCache();
			cache.delete("/a.txt");
			cache.delete("/b.txt");

			const deleted = cache.getDeletedPaths();
			expect(deleted).toContain("/a.txt");
			expect(deleted).toContain("/b.txt");
			expect(deleted).toHaveLength(2);
		});
	});

	describe("markClean", () => {
		it("marks all dirty entries as clean", () => {
			const cache = new FsCache();
			cache.set("/a.txt", "a", 0o644);
			cache.set("/b.txt", "b", 0o644);

			cache.markClean();

			expect(cache.getDirtyEntries()).toHaveLength(0);
		});

		it("clears deleted paths", () => {
			const cache = new FsCache();
			cache.delete("/removed.txt");

			cache.markClean();

			expect(cache.getDeletedPaths()).toHaveLength(0);
			expect(cache.isDeleted("/removed.txt")).toBe(false);
		});
	});

	describe("overwriting entries", () => {
		it("overwrites existing file content", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "old", 0o644);
			cache.set("/file.txt", "new", 0o644);

			const entry = expectFile(cache, "/file.txt");
			expect(entry.content).toBe("new");
		});

		it("overwrites directory with file at same path", () => {
			const cache = new FsCache();
			cache.setDirectory("/path", 0o755);
			cache.set("/path", "now a file", 0o644);

			const entry = cache.get("/path");
			expect(entry && FsCache.isFile(entry)).toBe(true);
			expect(entry && FsCache.isDirectory(entry)).toBe(false);
		});

		it("overwrites file with directory at same path", () => {
			const cache = new FsCache();
			cache.set("/path", "was a file", 0o644);
			cache.setDirectory("/path", 0o755);

			const entry = cache.get("/path");
			expect(entry && FsCache.isDirectory(entry)).toBe(true);
			expect(entry && FsCache.isFile(entry)).toBe(false);
		});
	});

	describe("getPaths", () => {
		it("returns all cached paths", () => {
			const cache = new FsCache();
			cache.set("/file.txt", "content", 0o644);
			cache.setDirectory("/dir", 0o755);

			const paths = cache.getPaths();
			expect(paths).toContain("/file.txt");
			expect(paths).toContain("/dir");
			expect(paths).toHaveLength(2);
		});

		it("excludes deleted paths", () => {
			const cache = new FsCache();
			cache.set("/keep.txt", "keep", 0o644);
			cache.set("/remove.txt", "remove", 0o644);
			cache.delete("/remove.txt");

			const paths = cache.getPaths();
			expect(paths).toContain("/keep.txt");
			expect(paths).not.toContain("/remove.txt");
		});
	});
});
