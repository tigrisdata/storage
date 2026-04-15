import { get, head, list, put, remove, updateObject } from "@tigrisdata/storage";
import type {
	BufferEncoding,
	CpOptions,
	FsStat,
	IFileSystem,
	MkdirOptions,
	RmOptions,
} from "just-bash";
import type { TigrisConfig } from "../types.js";
import { FsCache } from "./cache.js";

const DEFAULT_FILE_MODE = 0o644; // Placeholder — object storage has no POSIX permissions
const DEFAULT_DIR_MODE = 0o755; // Placeholder — object storage has no POSIX permissions

/**
 * Tigris-backed filesystem implementing just-bash's IFileSystem interface.
 *
 * Uses an in-memory write-back cache:
 * - Writes stay local until flush() is called
 * - Reads check cache first, then fetch from Tigris on miss
 * - Deleted paths are tracked to avoid fetching removed objects
 */
export class TigrisAdapter implements IFileSystem {
	private readonly cache = new FsCache();
	readonly config: TigrisConfig;

	constructor(config?: TigrisConfig) {
		this.config = config ?? {};
	}

	// ── Path helpers ──────────────────────────────────────────────

	/** Convert a virtual path to a Tigris object key. */
	private toKey(path: string): string {
		const relative = path.startsWith("/") ? path.slice(1) : path;
		return relative;
	}

	// ── IFileSystem implementation ───────────────────────────────

	async readFile(
		path: string,
		_options?: { encoding?: BufferEncoding | null } | BufferEncoding,
	): Promise<string> {
		const normalized = this.normalizePath(path);

		const cached = this.cache.get(normalized);
		if (cached && FsCache.isFile(cached)) {
			return typeof cached.content === "string"
				? cached.content
				: new TextDecoder().decode(cached.content);
		}

		if (this.cache.isDeleted(normalized)) {
			throw new Error(`ENOENT: no such file or directory, open '${path}'`);
		}

		const result = await get(this.toKey(normalized), "string", { config: this.config });
		if ("error" in result) {
			throw new Error(`ENOENT: no such file or directory, open '${path}'`);
		}

		const headResult = await head(this.toKey(normalized), { config: this.config });
		const mtime =
			headResult && "data" in headResult && headResult.data ? headResult.data.modified : new Date();

		this.cache.cache(normalized, result.data, DEFAULT_FILE_MODE, mtime);
		return result.data;
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
		const content = await this.readFile(path);
		return new TextEncoder().encode(content);
	}

	async writeFile(
		path: string,
		content: string | Uint8Array,
		_options?: { encoding?: BufferEncoding } | BufferEncoding,
	): Promise<void> {
		const normalized = this.normalizePath(path);
		await this.ensureParentDir(normalized);
		this.cache.set(normalized, content, DEFAULT_FILE_MODE);
	}

	async appendFile(
		path: string,
		content: string | Uint8Array,
		_options?: { encoding?: BufferEncoding } | BufferEncoding,
	): Promise<void> {
		const normalized = this.normalizePath(path);
		let existing = "";
		try {
			existing = await this.readFile(path);
		} catch {
			// File doesn't exist yet — that's fine
		}
		const appended =
			typeof content === "string"
				? existing + content
				: existing + new TextDecoder().decode(content);
		this.cache.set(normalized, appended, DEFAULT_FILE_MODE);
	}

	async exists(path: string): Promise<boolean> {
		const normalized = this.normalizePath(path);

		if (this.cache.has(normalized)) return true;
		if (this.cache.isDeleted(normalized)) return false;

		const result = await head(this.toKey(normalized), { config: this.config });
		if (result && "data" in result && result.data) return true;

		const listResult = await list({
			prefix: `${this.toKey(normalized)}/`,
			delimiter: "/",
			limit: 1,
			...{ config: this.config },
		});
		if ("error" in listResult) return false;
		return listResult.data.items.length > 0 || listResult.data.commonPrefixes.length > 0;
	}

	async stat(path: string): Promise<FsStat> {
		const normalized = this.normalizePath(path);

		const cached = this.cache.get(normalized);
		if (cached) {
			if (FsCache.isDirectory(cached)) {
				return {
					isFile: false,
					isDirectory: true,
					isSymbolicLink: false,
					mode: cached.mode,
					size: 0,
					mtime: cached.mtime,
				};
			}
			return {
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				mode: cached.mode,
				size: cached.size,
				mtime: cached.mtime,
			};
		}

		if (this.cache.isDeleted(normalized)) {
			throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
		}

		const headResult = await head(this.toKey(normalized), { config: this.config });
		if (headResult && "data" in headResult && headResult.data) {
			return {
				isFile: true,
				isDirectory: false,
				isSymbolicLink: false,
				mode: DEFAULT_FILE_MODE,
				size: headResult.data.size,
				mtime: headResult.data.modified,
			};
		}

		const listResult = await list({
			prefix: `${this.toKey(normalized)}/`,
			delimiter: "/",
			limit: 1,
			...{ config: this.config },
		});
		if ("error" in listResult) {
			throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
		}
		if (listResult.data.items.length > 0 || listResult.data.commonPrefixes.length > 0) {
			return {
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				mode: DEFAULT_DIR_MODE,
				size: 0,
				mtime: new Date(),
			};
		}

		throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
	}

	async lstat(path: string): Promise<FsStat> {
		return this.stat(path);
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		const normalized = this.normalizePath(path);

		if (options?.recursive) {
			const parts = normalized.split("/").filter(Boolean);
			let current = "";
			for (const part of parts) {
				current += `/${part}`;
				if (!this.cache.has(current)) {
					this.cache.setDirectory(current, DEFAULT_DIR_MODE);
				}
			}
		} else {
			this.cache.setDirectory(normalized, DEFAULT_DIR_MODE);
		}
	}

	async readdir(path: string): Promise<string[]> {
		const normalized = this.normalizePath(path);
		const entries = new Set<string>();

		this.collectCachedEntries(normalized, entries);
		await this.collectRemoteEntries(normalized, entries);

		return [...entries].sort();
	}

	private collectCachedEntries(normalized: string, entries: Set<string>): void {
		const cachePrefix = normalized === "/" ? "/" : `${normalized}/`;
		for (const cachedPath of this.cache.getPaths()) {
			if (cachedPath.startsWith(cachePrefix) && cachedPath !== normalized) {
				const relative = cachedPath.slice(cachePrefix.length);
				const firstSegment = relative.split("/")[0];
				if (firstSegment) {
					entries.add(firstSegment);
				}
			}
		}
	}

	private async collectRemoteEntries(normalized: string, entries: Set<string>): Promise<void> {
		const tigrisPrefix = `${this.toKey(normalized)}/`;
		const result = await list({
			prefix: tigrisPrefix,
			delimiter: "/",
			...{ config: this.config },
		});

		if ("error" in result) return;

		for (const item of result.data.items) {
			this.addRemoteEntry(item.name, tigrisPrefix, normalized, entries);
		}
		for (const prefix of result.data.commonPrefixes) {
			this.addRemoteEntry(prefix, tigrisPrefix, normalized, entries);
		}
	}

	private addRemoteEntry(
		fullKey: string,
		tigrisPrefix: string,
		normalized: string,
		entries: Set<string>,
	): void {
		const name = fullKey.slice(tigrisPrefix.length).replace(/\/$/, "");
		if (name && !this.cache.isDeleted(`${normalized}/${name}`)) {
			entries.add(name);
		}
	}

	async rm(path: string, options?: RmOptions): Promise<void> {
		const normalized = this.normalizePath(path);

		if (options?.recursive) {
			const entries = await this.readdir(path);
			for (const entry of entries) {
				await this.rm(`${normalized}/${entry}`, { recursive: true });
			}
		}

		this.cache.delete(normalized);
	}

	async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
		const srcNorm = this.normalizePath(src);
		const destNorm = this.normalizePath(dest);

		const srcStat = await this.stat(srcNorm);
		if (srcStat.isDirectory && !options?.recursive) {
			throw new Error(`EISDIR: illegal operation on a directory, cp '${src}'`);
		}

		if (srcStat.isDirectory) {
			await this.mkdir(destNorm, { recursive: true });
			const entries = await this.readdir(srcNorm);
			for (const entry of entries) {
				await this.cp(`${srcNorm}/${entry}`, `${destNorm}/${entry}`, options);
			}
		} else {
			const content = await this.readFile(srcNorm);
			await this.writeFile(destNorm, content);
		}
	}

	async mv(src: string, dest: string): Promise<void> {
		const srcNorm = this.normalizePath(src);
		const destNorm = this.normalizePath(dest);

		const cached = this.cache.get(srcNorm);
		if (cached && FsCache.isFile(cached) && cached.dirty) {
			this.cache.set(destNorm, cached.content, cached.mode);
			this.cache.delete(srcNorm);
			return;
		}

		const result = await updateObject(this.toKey(srcNorm), {
			key: this.toKey(destNorm),
			...{ config: this.config },
		});
		if ("error" in result) {
			await this.cp(src, dest, { recursive: true });
			await this.rm(src, { recursive: true });
			return;
		}

		if (cached && FsCache.isFile(cached)) {
			this.cache.cache(destNorm, cached.content, cached.mode, cached.mtime);
		}
		this.cache.delete(srcNorm);
	}

	async chmod(_path: string, _mode: number): Promise<void> {
		// No-op: object storage doesn't have POSIX permissions
	}

	async symlink(_target: string, _linkPath: string): Promise<never> {
		throw new Error("EPERM: symlinks are not supported on Tigris storage");
	}

	async link(_existingPath: string, _newPath: string): Promise<never> {
		throw new Error("EPERM: hard links are not supported on Tigris storage");
	}

	async readlink(_path: string): Promise<never> {
		throw new Error("EINVAL: not a symbolic link");
	}

	async realpath(path: string): Promise<string> {
		return this.normalizePath(path);
	}

	async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {
		// No-op: mtime is managed by Tigris/cache
	}

	resolvePath(base: string, path: string): string {
		if (path.startsWith("/")) return this.normalizePath(path);
		return this.normalizePath(`${base}/${path}`);
	}

	getAllPaths(): string[] {
		return this.cache.getPaths();
	}

	// ── Flush ────────────────────────────────────────────────────

	/** Push all dirty writes to Tigris and delete removed objects. */
	async flush(): Promise<void> {
		const dirty = this.cache.getDirtyEntries();
		const deleted = this.cache.getDeletedPaths();
		const errors: Error[] = [];

		await Promise.all(
			dirty.map(({ path, entry }) => {
				const body = typeof entry.content === "string" ? entry.content : Buffer.from(entry.content);
				return put(this.toKey(path), body, { config: this.config }).then((result) => {
					if ("error" in result) {
						errors.push(new Error(`flush put "${path}": ${result.error.message}`));
					}
				});
			}),
		);

		await Promise.all(
			deleted.map((path) =>
				remove(this.toKey(path), { config: this.config }).then((result) => {
					if ("error" in result) {
						errors.push(new Error(`flush remove "${path}": ${result.error.message}`));
					}
				}),
			),
		);

		if (errors.length > 0) {
			throw new AggregateError(errors, `flush failed: ${errors.length} operation(s) failed`);
		}

		this.cache.markClean();
	}

	// ── Internal helpers ─────────────────────────────────────────

	private normalizePath(path: string): string {
		const parts: string[] = [];
		for (const segment of path.split("/")) {
			if (segment === "" || segment === ".") continue;
			if (segment === "..") {
				parts.pop();
			} else {
				parts.push(segment);
			}
		}
		return `/${parts.join("/")}`;
	}

	private async ensureParentDir(path: string): Promise<void> {
		const parent = this.normalizePath(path.substring(0, path.lastIndexOf("/")));
		if (parent && parent !== "/") {
			await this.mkdir(parent, { recursive: true });
		}
	}
}
