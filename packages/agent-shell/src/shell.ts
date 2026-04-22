import type { BashExecResult } from "just-bash";
import { Bash, InMemoryFs, MountableFs } from "just-bash";
import { createTigrisCommands } from "./commands/index.js";
import { TigrisAdapter } from "./fs/tigris-adapter.js";
import type { ShellOptions, TigrisConfig } from "./types.js";
import { validateConfig } from "./types.js";

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
		this.tigrisConfig = config;

		this.mountableFs = new MountableFs({ base: new InMemoryFs() });

		const cwd = shellOptions?.cwd ?? "/workspace";

		// Auto-mount if bucket is provided
		if (config.bucket) {
			this.mount(config.bucket, cwd);
		}

		const commandConfig = config.bucket
			? { ...config, bucket: config.bucket }
			: { ...config, bucket: "" };

		this.bash = new Bash({
			fs: this.mountableFs,
			cwd,
			...(shellOptions?.env !== undefined && { env: shellOptions.env }),
			customCommands: createTigrisCommands(commandConfig),
		});
	}

	/** Execute a bash command. */
	async exec(command: string): Promise<BashExecResult> {
		return this.bash.exec(command);
	}

	/** Mount a bucket at a path. Throws if path is already mounted. */
	mount(bucket: string, mountPoint: string): void {
		if (this.mounts.some((m) => m.mountPoint === mountPoint)) {
			throw new Error(`Already mounted at ${mountPoint}`);
		}
		const adapter = new TigrisAdapter(this.tigrisConfig, bucket);
		this.mountableFs.mount(mountPoint, adapter);
		this.mounts.push({ bucket, mountPoint, adapter });
	}

	/** Unmount a path. */
	unmount(mountPoint: string): void {
		const index = this.mounts.findIndex((m) => m.mountPoint === mountPoint);
		if (index === -1) {
			throw new Error(`No mount at ${mountPoint}`);
		}
		this.mountableFs.unmount(mountPoint);
		this.mounts.splice(index, 1);
	}

	/** List all current mounts. */
	listMounts(): Array<{ bucket: string; mountPoint: string }> {
		return this.mounts.map((m) => ({ bucket: m.bucket, mountPoint: m.mountPoint }));
	}

	/** Flush cached writes to Tigris. Flush all mounts or a specific path. */
	async flush(mountPoint?: string): Promise<void> {
		if (mountPoint !== undefined) {
			const mount = this.mounts.find((m) => m.mountPoint === mountPoint);
			if (!mount) {
				throw new Error(`No mount at ${mountPoint}`);
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

	/** Access the underlying just-bash instance. */
	get engine(): Bash {
		return this.bash;
	}
}
