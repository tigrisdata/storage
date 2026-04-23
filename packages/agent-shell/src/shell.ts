import type { BashExecResult } from "just-bash";
import { Bash, InMemoryFs, MountableFs } from "just-bash";
import { createForkCommand, createForksListCommand } from "./commands/fork.js";
import { createPresignCommand } from "./commands/presign.js";
import { createSnapshotCommand } from "./commands/snapshot.js";
import { TigrisAdapter } from "./fs/tigris-adapter.js";
import type { ShellOptions, TigrisConfig } from "./types.js";
import { validateConfig, withConfigDefaults } from "./types.js";

interface MountEntry {
	bucket: string;
	mountPoint: string;
	adapter: TigrisAdapter;
}

/**
 * A virtual bash environment for AI agents, backed by Tigris object storage.
 *
 * Supports mounting multiple buckets at different paths. If config includes
 * a bucket, it is auto-mounted at /workspace. Otherwise, use mount() to
 * add buckets after construction.
 *
 * Writes stay cached locally until flush() is called.
 */
export class TigrisShell {
	private readonly bash: Bash;
	private readonly mountableFs: MountableFs;
	private readonly mounts: MountEntry[] = [];
	private readonly tigrisConfig: TigrisConfig;

	constructor(config: TigrisConfig, shellOptions?: ShellOptions) {
		validateConfig(config);
		const resolvedConfig = withConfigDefaults(config);
		this.tigrisConfig = resolvedConfig;

		this.mountableFs = new MountableFs({ base: new InMemoryFs() });

		const cwd = shellOptions?.cwd ?? "/workspace";

		// Auto-mount if bucket is provided
		if (resolvedConfig.bucket) {
			this.mount(resolvedConfig.bucket, cwd);
		}

		this.bash = new Bash({
			fs: this.mountableFs,
			cwd,
			...(shellOptions?.env !== undefined && { env: shellOptions.env }),
			customCommands: [
				createPresignCommand(resolvedConfig, {
					resolveBucket: (path) => this.resolveBucketForPath(path),
				}),
				createSnapshotCommand(resolvedConfig),
				createForkCommand(resolvedConfig),
				createForksListCommand(resolvedConfig),
			],
		});
	}

	/** Execute a bash command. */
	async exec(command: string): Promise<BashExecResult> {
		return this.bash.exec(command);
	}

	/** Mount a bucket at a path. Throws if path is already mounted. */
	mount(bucket: string, mountPoint: string): void {
		const normalized = mountPoint.startsWith("/") ? mountPoint : `/${mountPoint}`;
		if (this.mounts.some((m) => m.mountPoint === normalized)) {
			throw new Error(`Already mounted at ${normalized}`);
		}
		const adapter = new TigrisAdapter(this.tigrisConfig, bucket);
		this.mountableFs.mount(normalized, adapter);
		this.mounts.push({ bucket, mountPoint: normalized, adapter });
	}

	/** Unmount a path. */
	unmount(mountPoint: string): void {
		const normalized = mountPoint.startsWith("/") ? mountPoint : `/${mountPoint}`;
		const index = this.mounts.findIndex((m) => m.mountPoint === normalized);
		if (index === -1) {
			throw new Error(`No mount at ${normalized}`);
		}
		this.mountableFs.unmount(normalized);
		this.mounts.splice(index, 1);
	}

	/** List all current mounts. */
	listMounts(): Array<{ bucket: string; mountPoint: string }> {
		return this.mounts.map((m) => ({ bucket: m.bucket, mountPoint: m.mountPoint }));
	}

	/** Flush cached writes to Tigris. Flush all mounts or a specific path. */
	async flush(mountPoint?: string): Promise<void> {
		if (mountPoint !== undefined) {
			const normalized = mountPoint.startsWith("/") ? mountPoint : `/${mountPoint}`;
			const mount = this.mounts.find((m) => m.mountPoint === normalized);
			if (!mount) {
				throw new Error(`No mount at ${normalized}`);
			}
			return mount.adapter.flush();
		}

		const errors: Error[] = [];
		await Promise.all(
			this.mounts.map((m) =>
				m.adapter.flush().catch((err: unknown) => {
					errors.push(
						err instanceof Error ? err : new Error(`flush ${m.mountPoint}: ${String(err)}`),
					);
				}),
			),
		);

		if (errors.length > 0) {
			throw new AggregateError(errors, `flush failed: ${errors.length} mount(s) failed`);
		}
	}

	/** Resolve an absolute path to its bucket and object key. */
	private resolveBucketForPath(absolutePath: string): { bucket: string; key: string } | null {
		// Normalize double slashes (e.g. //bucket from cd ../bucket)
		const normalized = absolutePath.replace(/\/\/+/g, "/");
		// Find the longest matching mount point
		let best: MountEntry | null = null;
		for (const m of this.mounts) {
			if (normalized === m.mountPoint || normalized.startsWith(`${m.mountPoint}/`)) {
				if (!best || m.mountPoint.length > best.mountPoint.length) {
					best = m;
				}
			}
		}
		if (!best) return null;
		const key = normalized.slice(best.mountPoint.length + 1); // strip mount + "/"
		return { bucket: best.bucket, key };
	}

	/** Access the underlying just-bash instance. */
	get engine(): Bash {
		return this.bash;
	}
}
