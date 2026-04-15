/**
 * In-memory write-back cache for TigrisAdapter.
 *
 * Writes stay local until explicitly flushed. Reads check cache first,
 * then fall through to the remote backend on miss.
 */

export interface CacheEntry {
	content: string | Uint8Array;
	dirty: boolean;
	mtime: Date;
	mode: number;
	size: number;
}

export interface DirectoryMarker {
	type: "directory";
	mtime: Date;
	mode: number;
}

export type CacheItem = CacheEntry | DirectoryMarker;

function isCacheEntry(item: CacheItem): item is CacheEntry {
	return "content" in item;
}

function isDirectoryMarker(item: CacheItem): item is DirectoryMarker {
	return "type" in item && item.type === "directory";
}

export class FsCache {
	private entries = new Map<string, CacheItem>();
	private deleted = new Set<string>();

	/** Write a file to cache, marking it dirty. */
	set(path: string, content: string | Uint8Array, mode: number): void {
		const size =
			typeof content === "string"
				? new TextEncoder().encode(content).byteLength
				: content.byteLength;
		this.entries.set(path, {
			content,
			dirty: true,
			mtime: new Date(),
			mode,
			size,
		});
		this.deleted.delete(path);
	}

	/** Cache a file read from the remote backend (not dirty). */
	cache(path: string, content: string | Uint8Array, mode: number, mtime: Date): void {
		const size =
			typeof content === "string"
				? new TextEncoder().encode(content).byteLength
				: content.byteLength;
		this.entries.set(path, {
			content,
			dirty: false,
			mtime,
			mode,
			size,
		});
		this.deleted.delete(path);
	}

	/** Cache a directory marker. */
	setDirectory(path: string, mode: number): void {
		this.entries.set(path, {
			type: "directory",
			mtime: new Date(),
			mode,
		});
		this.deleted.delete(path);
	}

	/** Get a cached item if it exists. */
	get(path: string): CacheItem | undefined {
		return this.entries.get(path);
	}

	/** Check if a path has been explicitly deleted in this session. */
	isDeleted(path: string): boolean {
		return this.deleted.has(path);
	}

	/** Mark a path as deleted. */
	delete(path: string): void {
		this.entries.delete(path);
		this.deleted.add(path);
	}

	/** Check if cache has this path. */
	has(path: string): boolean {
		return this.entries.has(path);
	}

	/** Get all dirty file entries that need flushing. */
	getDirtyEntries(): Array<{ path: string; entry: CacheEntry }> {
		const dirty: Array<{ path: string; entry: CacheEntry }> = [];
		for (const [path, item] of this.entries) {
			if (isCacheEntry(item) && item.dirty) {
				dirty.push({ path, entry: item });
			}
		}
		return dirty;
	}

	/** Get all paths that were deleted in this session. */
	getDeletedPaths(): string[] {
		return [...this.deleted];
	}

	/** Mark all dirty entries as clean after a successful flush. */
	markClean(): void {
		for (const item of this.entries.values()) {
			if (isCacheEntry(item)) {
				item.dirty = false;
			}
		}
		this.deleted.clear();
	}

	/** Get all cached paths (for getAllPaths). */
	getPaths(): string[] {
		return [...this.entries.keys()];
	}

	/** Check if an item is a file (not a directory marker). */
	static isFile(item: CacheItem): item is CacheEntry {
		return isCacheEntry(item);
	}

	/** Check if an item is a directory marker. */
	static isDirectory(item: CacheItem): item is DirectoryMarker {
		return isDirectoryMarker(item);
	}
}
