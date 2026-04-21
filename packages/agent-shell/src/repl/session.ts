import { listBuckets } from "@tigrisdata/storage";
import type { BashExecResult } from "just-bash";
import { TigrisShell } from "../shell.js";
import type { TigrisConfig } from "../types.js";
import type { ReplIO } from "./io.js";

/**
 * REPL session — owns the TigrisShell lifecycle and handles
 * built-in commands (configure, mount, unmount, flush, etc).
 *
 * Platform-agnostic: uses ReplIO for all terminal interaction.
 */
export class ReplSession {
	private shell: TigrisShell | null = null;
	private config: TigrisConfig | null = null;
	private cwd: string | undefined;

	/** Handle a command line. Returns true if handled, false to pass to bash. */
	async handle(line: string, io: ReplIO): Promise<void> {
		const trimmed = line.trim();
		if (!trimmed) return;

		const parts = trimmed.split(/\s+/);
		const command = parts[0];

		switch (command) {
			case "clear":
				// Handled by the frontend (CLI/playground)
				return;
			case "configure":
				await this.handleConfigure(parts.slice(1), io);
				return;
			case "mount":
				this.handleMount(parts.slice(1), io);
				return;
			case "umount":
				this.handleUmount(parts.slice(1), io);
				return;
			case "df":
				this.handleDf(io);
				return;
			case "flush":
				await this.handleFlush(parts.slice(1), io);
				return;
			case "help":
				this.handleHelp(io);
				return;
			case "logout":
				this.handleLogout(io);
				return;
		}

		// All other commands go to bash
		if (!this.shell) {
			io.write("Not configured. Run 'configure' or 'login' first.\n");
			return;
		}

		try {
			const result: BashExecResult = await this.shell.engine.exec(trimmed, {
				...(this.cwd !== undefined && { cwd: this.cwd }),
			});

			if (result.env?.PWD) {
				this.cwd = result.env.PWD;
			}

			if (result.stdout) io.write(result.stdout);
			if (result.stderr) io.write(result.stderr);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`Error: ${message}\n`);
		}
	}

	/** Configure credentials directly. Called by CLI with parsed args. */
	async configure(
		options: { accessKeyId: string; secretAccessKey: string; bucket?: string; endpoint?: string },
		io: ReplIO,
	): Promise<void> {
		const newConfig: TigrisConfig = {
			accessKeyId: options.accessKeyId,
			secretAccessKey: options.secretAccessKey,
			...(options.endpoint !== undefined && { endpoint: options.endpoint }),
		};

		if (options.bucket) {
			newConfig.bucket = options.bucket;
			const newShell = new TigrisShell(newConfig);
			this.config = newConfig;
			this.shell = newShell;
			this.cwd = undefined;
			io.write(`Configured. Mounted ${options.bucket} at /workspace\n`);
		} else {
			const newShell = new TigrisShell(newConfig);

			const bucketsResult = await listBuckets({ config: newConfig });
			if ("error" in bucketsResult) {
				// Commit new session even if bucket listing fails — auth is valid
				this.config = newConfig;
				this.shell = newShell;
				this.cwd = undefined;
				io.write(`Configured. Could not list buckets: ${bucketsResult.error.message}\n`);
				io.write("Use 'mount <bucket> <path>' to mount manually.\n");
				return;
			}

			// Success — commit new session
			this.config = newConfig;
			this.shell = newShell;
			this.cwd = undefined;

			const bucketNames = bucketsResult.data.buckets.map((b) => b.name);
			if (bucketNames.length === 0) {
				io.write("Configured. No buckets found.\n");
				io.write("Use 'mount <bucket> <path>' to mount manually.\n");
				return;
			}

			io.write("Available buckets:\n");
			for (const name of bucketNames) {
				io.write(`  ${name}\n`);
			}

			const first = bucketNames[0];
			if (first) {
				this.shell.mount(first, "/workspace");
				io.write(`\nMounted ${first} at /workspace\n`);
			}

			if (bucketNames.length > 1) {
				io.write("\nTo mount additional buckets:\n");
				io.write("  mount <bucket-name> <path>\n");
			}
		}
	}

	private async handleConfigure(args: string[], io: ReplIO): Promise<void> {
		let bucket: string | undefined;
		let accessKeyId: string | undefined;
		let secretAccessKey: string | undefined;
		let endpoint: string | undefined;

		for (let i = 0; i < args.length; i++) {
			if (args[i] === "--bucket" && args[i + 1]) {
				bucket = args[i + 1];
				i++;
			} else if (args[i] === "--key" && args[i + 1]) {
				accessKeyId = args[i + 1];
				i++;
			} else if (args[i] === "--secret" && args[i + 1]) {
				secretAccessKey = args[i + 1];
				i++;
			} else if (args[i] === "--endpoint" && args[i + 1]) {
				endpoint = args[i + 1];
				i++;
			}
		}

		// Show status if no args
		if (!accessKeyId && !secretAccessKey && !bucket) {
			if (this.config) {
				io.write(`Access key: ${this.config.accessKeyId?.slice(0, 8)}...\n`);
				const mounts = this.shell?.listMounts() ?? [];
				for (const m of mounts) {
					io.write(`  ${m.bucket} → ${m.mountPoint}\n`);
				}
			} else {
				io.write(
					"Usage: configure --key <accessKeyId> --secret <secretAccessKey> [--bucket <name>]\n",
				);
			}
			return;
		}

		if (!accessKeyId || !secretAccessKey) {
			io.write("Both --key and --secret are required.\n");
			return;
		}

		try {
			await this.configure(
				{
					accessKeyId,
					secretAccessKey,
					...(bucket !== undefined && { bucket }),
					...(endpoint !== undefined && { endpoint }),
				},
				io,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`configure: ${message}\n`);
		}
	}

	private handleMount(args: string[], io: ReplIO): void {
		if (!this.shell) {
			io.write("Not configured. Run 'configure' first.\n");
			return;
		}

		// No args — list mounts
		if (args.length === 0) {
			this.handleDf(io);
			return;
		}

		const bucket = args[0];
		const mountPoint = args[1];

		if (!bucket || !mountPoint) {
			io.write("Usage: mount <bucket> <path>\n");
			return;
		}

		try {
			this.shell.mount(bucket, mountPoint);
			io.write(`Mounted ${bucket} at ${mountPoint}\n`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`mount: ${message}\n`);
		}
	}

	private handleUmount(args: string[], io: ReplIO): void {
		if (!this.shell) {
			io.write("Not configured. Run 'configure' first.\n");
			return;
		}

		const mountPoint = args[0];
		if (!mountPoint) {
			io.write("Usage: umount <path>\n");
			return;
		}

		try {
			this.shell.unmount(mountPoint);
			io.write(`Unmounted ${mountPoint}\n`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`umount: ${message}\n`);
		}
	}

	private handleDf(io: ReplIO): void {
		if (!this.shell) {
			io.write("Not configured. Run 'configure' first.\n");
			return;
		}

		const mounts = this.shell.listMounts();
		if (mounts.length === 0) {
			io.write("No mounts.\n");
			return;
		}

		io.write("Bucket                    Mounted on\n");
		for (const m of mounts) {
			io.write(`${m.bucket.padEnd(26)}${m.mountPoint}\n`);
		}
	}

	private async handleFlush(args: string[], io: ReplIO): Promise<void> {
		if (!this.shell) {
			io.write("Not configured. Run 'configure' first.\n");
			return;
		}

		const mountPoint = args[0];

		try {
			await this.shell.flush(mountPoint);
			if (mountPoint) {
				io.write(`Flushed ${mountPoint}\n`);
			} else {
				const mounts = this.shell.listMounts();
				io.write(`Flushed ${mounts.length} mount(s)\n`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`flush: ${message}\n`);
		}
	}

	private handleLogout(io: ReplIO): void {
		this.shell = null;
		this.config = null;
		this.cwd = undefined;
		io.write("Logged out. All mounts removed.\n");
	}

	private handleHelp(io: ReplIO): void {
		io.write("Commands:\n");
		io.write("  configure --key <id> --secret <key> [--bucket <name>] [--endpoint <url>]\n");
		io.write("  mount <bucket> <path>                                   Mount a bucket\n");
		io.write("  mount                                                   List mounts\n");
		io.write("  umount <path>                                           Unmount a path\n");
		io.write("  df                                                      List mounts\n");
		io.write("  flush [path]                                            Flush to Tigris\n");
		io.write("  logout                                                  Clear session\n");
		io.write("  clear                                                   Clear screen\n");
		io.write("  help                                                    Show this help\n");
		io.write("\nAll other commands are executed as bash.\n");
	}

	/** Whether a shell is configured and ready. */
	get isConfigured(): boolean {
		return this.shell !== null;
	}
}
