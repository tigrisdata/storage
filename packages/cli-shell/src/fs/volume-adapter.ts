/**
 * Exposes a memfs volume through just-bash's `IFileSystem`.
 *
 * This is what makes the shell and the CLI agree on a single local filesystem:
 * `@tigrisdata/cli/browser` writes `~/.tigris/config.json` there through its
 * `node:fs` shim, and the same bytes are visible to `cat` and `ls` in the
 * shell. Without this, logging in via the CLI and inspecting the result in the
 * shell would be looking at two different worlds.
 *
 * Two conversions matter:
 *  - Node's `Stats` exposes `isFile()` as a method; just-bash's `FsStat` wants
 *    a boolean.
 *  - `resolvePath` and `getAllPaths` are synchronous in `IFileSystem`, so they
 *    read the volume directly rather than going through promises.
 */

import type {
  BufferEncoding,
  CpOptions,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  RmOptions,
} from 'just-bash';

/** Declared locally: just-bash exports this from its browser entry, not its root. */
interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

/** The surface of `memfs`'s `createFsFromVolume` result that we depend on. */
export interface MemfsLike {
  promises: {
    readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
    writeFile(path: string, data: FileContent): Promise<void>;
    appendFile(path: string, data: FileContent): Promise<void>;
    stat(path: string): Promise<NodeStatsLike>;
    lstat(path: string): Promise<NodeStatsLike>;
    mkdir(path: string, options?: MkdirOptions): Promise<void>;
    readdir(path: string, options?: unknown): Promise<unknown[]>;
    rm(path: string, options?: RmOptions): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    chmod(path: string, mode: number): Promise<void>;
    symlink(target: string, linkPath: string): Promise<void>;
    link(existing: string, next: string): Promise<void>;
    readlink(path: string): Promise<string>;
    realpath(path: string): Promise<string>;
    utimes(path: string, atime: Date, mtime: Date): Promise<void>;
  };
  existsSync(path: string): boolean;
}

interface NodeStatsLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  mode: number;
  size: number;
  mtime: Date;
  ino?: number | bigint;
  dev?: number | bigint;
}

/** Anything that can enumerate the volume's paths for glob matching. */
export interface VolumeLike {
  toJSON(): Record<string, string | null>;
}

function encodingOf(
  options?: { encoding?: BufferEncoding | null } | BufferEncoding
): string {
  if (typeof options === 'string') return options;
  return options?.encoding ?? 'utf8';
}

/** POSIX path resolution — object keys and virtual paths are always POSIX. */
export function resolvePosix(base: string, path: string): string {
  const combined = path.startsWith('/') ? path : `${base}/${path}`;
  const parts: string[] = [];

  for (const segment of combined.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }

  return `/${parts.join('/')}`;
}

export class VolumeAdapter implements IFileSystem {
  constructor(
    private readonly fs: MemfsLike,
    private readonly volume: VolumeLike
  ) {}

  async readFile(
    path: string,
    options?: { encoding?: BufferEncoding | null } | BufferEncoding
  ): Promise<string> {
    const result = await this.fs.promises.readFile(path, encodingOf(options));
    return typeof result === 'string'
      ? result
      : new TextDecoder().decode(result);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const result = await this.fs.promises.readFile(path);
    return typeof result === 'string'
      ? new TextEncoder().encode(result)
      : new Uint8Array(result);
  }

  async writeFile(path: string, content: FileContent): Promise<void> {
    await this.fs.promises.writeFile(path, content);
  }

  async appendFile(path: string, content: FileContent): Promise<void> {
    await this.fs.promises.appendFile(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.fs.existsSync(path);
  }

  async stat(path: string): Promise<FsStat> {
    return toFsStat(await this.fs.promises.stat(path));
  }

  async lstat(path: string): Promise<FsStat> {
    return toFsStat(await this.fs.promises.lstat(path));
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    await this.fs.promises.mkdir(path, options);
  }

  async readdir(path: string): Promise<string[]> {
    return (await this.fs.promises.readdir(path)) as string[];
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const entries = (await this.fs.promises.readdir(path, {
      withFileTypes: true,
    })) as Array<{
      name: string;
      isFile(): boolean;
      isDirectory(): boolean;
      isSymbolicLink(): boolean;
    }>;

    return entries.map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymbolicLink: entry.isSymbolicLink(),
    }));
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    await this.fs.promises.rm(path, options);
  }

  /** memfs has no `cp`, so recurse by hand. */
  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const stats = await this.fs.promises.stat(src);

    if (!stats.isDirectory()) {
      await this.fs.promises.writeFile(dest, await this.readFileBuffer(src));
      return;
    }

    if (!options?.recursive) {
      throw new Error(`EISDIR: illegal operation on a directory, cp '${src}'`);
    }

    await this.fs.promises.mkdir(dest, { recursive: true });
    for (const name of await this.readdir(src)) {
      await this.cp(`${src}/${name}`, `${dest}/${name}`, options);
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.fs.promises.rename(src, dest);
  }

  resolvePath(base: string, path: string): string {
    return resolvePosix(base, path);
  }

  getAllPaths(): string[] {
    return Object.keys(this.volume.toJSON());
  }

  async chmod(path: string, mode: number): Promise<void> {
    await this.fs.promises.chmod(path, mode);
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.fs.promises.symlink(target, linkPath);
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await this.fs.promises.link(existingPath, newPath);
  }

  async readlink(path: string): Promise<string> {
    return this.fs.promises.readlink(path);
  }

  async realpath(path: string): Promise<string> {
    return this.fs.promises.realpath(path);
  }

  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    await this.fs.promises.utimes(path, atime, mtime);
  }
}

function toFsStat(stats: NodeStatsLike): FsStat {
  return {
    // Node exposes these as methods; just-bash wants plain booleans.
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymbolicLink: stats.isSymbolicLink(),
    mode: stats.mode,
    size: stats.size,
    mtime: stats.mtime,
    ...(stats.ino !== undefined ? { ino: stats.ino } : {}),
    ...(stats.dev !== undefined ? { dev: stats.dev } : {}),
  };
}
