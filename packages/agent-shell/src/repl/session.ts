import { listBuckets } from "@tigrisdata/storage";
import type { BashExecResult } from "just-bash";
import { TigrisShell } from "../shell.js";
import type { TigrisConfig } from "../types.js";
import type { LoginFn } from "./auth.js";
import type { ReplIO } from "./io.js";

export interface ReplSessionOptions {
	/** Login function — device flow for CLI, Auth0 SDK for browser. */
	loginFn?: LoginFn;
}

/**
 * REPL session — owns the TigrisShell lifecycle and handles
 * built-in commands (configure, mount, unmount, flush, etc).
 *
 * Platform-agnostic: uses ReplIO for all terminal interaction.
 */
export class ReplSession {
	private shell: TigrisShell | null = null;
	private config: TigrisConfig | null = null;
	private authMethod: "access-key" | "oauth" | null = null;
	private email: string | undefined;
	private cwd: string | undefined;
	private loginFn: LoginFn | undefined;

	constructor(options?: ReplSessionOptions) {
		this.loginFn = options?.loginFn;
	}

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
			case "login":
				await this.handleLogin(io);
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
			case "whoami":
				this.handleWhoami(io);
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
			const mountPoint = `/${options.bucket}`;
			const newShell = new TigrisShell(newConfig, { cwd: mountPoint });
			this.commitSession(newConfig, newShell, "access-key");
			this.cwd = mountPoint;
			io.write(`Configured. Mounted ${options.bucket} at ${mountPoint}\n`);
		} else {
			await this.listAndMountBuckets(newConfig, "access-key", io);
		}
	}

	/** Shared: list buckets, auto-mount first, commit session. */
	private async listAndMountBuckets(
		newConfig: TigrisConfig,
		authMethod: "access-key" | "oauth",
		io: ReplIO,
	): Promise<void> {
		const bucketsResult = await listBuckets({ config: newConfig });
		if ("error" in bucketsResult) {
			const newShell = new TigrisShell(newConfig);
			this.commitSession(newConfig, newShell, authMethod);
			io.write(`Could not list buckets: ${bucketsResult.error.message}\n`);
			io.write("Use 'mount <bucket> <path>' to mount manually.\n");
			return;
		}

		const bucketNames = bucketsResult.data.buckets.map((b) => b.name);
		if (bucketNames.length === 0) {
			const newShell = new TigrisShell(newConfig);
			this.commitSession(newConfig, newShell, authMethod);
			io.write("No buckets found.\n");
			io.write("Use 'mount <bucket> <path>' to mount manually.\n");
			return;
		}

		io.write("Available buckets:\n");
		for (const name of bucketNames) {
			io.write(`  ${name}\n`);
		}

		const first = bucketNames[0];
		if (first) {
			// Create shell with the first bucket so commands get the right config
			newConfig.bucket = first;
			const mountPoint = `/${first}`;
			const newShell = new TigrisShell(newConfig, { cwd: mountPoint });
			this.commitSession(newConfig, newShell, authMethod);
			this.cwd = mountPoint;
			io.write(`\nMounted ${first} at ${mountPoint}\n`);
		}

		if (bucketNames.length > 1) {
			io.write("\nTo mount additional buckets:\n");
			io.write("  mount <bucket-name> <path>\n");
		}
	}

	/** Commit a new session — replace config, shell, reset cwd. */
	private commitSession(
		config: TigrisConfig,
		shell: TigrisShell,
		authMethod: "access-key" | "oauth",
	): void {
		this.config = config;
		this.shell = shell;
		this.authMethod = authMethod;
		this.cwd = undefined;
	}

	private async handleLogin(io: ReplIO): Promise<void> {
		if (!this.loginFn) {
			io.write("login: no login method configured.\n");
			io.write("Use 'configure' with access keys instead.\n");
			return;
		}

		try {
			const result = await this.loginFn(io);

			if (result.organizations.length === 0) {
				io.write("No organizations found.\n");
				return;
			}

			let selectedOrg = result.organizations[0];

			if (result.organizations.length > 1) {
				io.write("\nSelect organization:\n");
				for (let i = 0; i < result.organizations.length; i++) {
					io.write(`  ${i + 1}) ${result.organizations[i]?.name}\n`);
				}

				const answer = await io.prompt("\nEnter number: ");
				const index = Number.parseInt(answer, 10) - 1;
				if (Number.isNaN(index) || index < 0 || index >= result.organizations.length) {
					io.write("Invalid selection.\n");
					return;
				}
				selectedOrg = result.organizations[index];
			}

			if (!selectedOrg) {
				io.write("No organization selected.\n");
				return;
			}

			io.write(`\nSelected: ${selectedOrg.name}\n`);

			const newConfig: TigrisConfig = {
				sessionToken: result.accessToken,
				organizationId: selectedOrg.id,
			};

			this.email = result.email;
			await this.listAndMountBuckets(newConfig, "oauth", io);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`login: ${message}\n`);
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
				if (this.authMethod === "oauth") {
					io.write(`Logged in as ${this.email ?? "unknown"}\n`);
				} else {
					io.write(`Access key: ${this.config.accessKeyId?.slice(0, 8)}...\n`);
				}
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

	private handleWhoami(io: ReplIO): void {
		if (!this.config) {
			io.write("Not logged in.\n");
			return;
		}

		if (this.authMethod === "oauth") {
			io.write(`Logged in as ${this.email ?? "unknown"} (OAuth)\n`);
		} else {
			io.write(
				`Access key: ${this.config.accessKeyId ? this.config.accessKeyId.slice(0, 8) : "unknown"}...\n`,
			);
		}

		const mounts = this.shell?.listMounts() ?? [];
		if (mounts.length > 0) {
			io.write("Mounts:\n");
			for (const m of mounts) {
				io.write(`  ${m.bucket} → ${m.mountPoint}\n`);
			}
		}
	}

	private handleLogout(io: ReplIO): void {
		this.shell = null;
		this.config = null;
		this.authMethod = null;
		this.email = undefined;
		this.cwd = undefined;
		io.write("Logged out. All mounts removed.\n");
	}

	private handleHelp(io: ReplIO): void {
		io.write("Commands:\n");
		io.write("  login                                                   Login (OAuth)\n");
		io.write("  configure --key <id> --secret <key> [--bucket <name>] [--endpoint <url>]\n");
		io.write("  mount <bucket> <path>                                   Mount a bucket\n");
		io.write("  mount                                                   List mounts\n");
		io.write("  umount <path>                                           Unmount a path\n");
		io.write("  df                                                      List mounts\n");
		io.write("  flush [path]                                            Flush to Tigris\n");
		io.write("  whoami                                                  Show current session\n");
		io.write("  logout                                                  Clear session\n");
		io.write("  clear                                                   Clear screen\n");
		io.write("  help                                                    Show this help\n");
		io.write("\nAll other commands are executed as bash.\n");
	}

	/** Whether a shell is configured and ready. */
	get isConfigured(): boolean {
		return this.shell !== null;
	}

	/** Get the current prompt string (e.g. "/my-bucket $ "). */
	get promptText(): string {
		if (this.cwd) {
			return `${this.cwd} $ `;
		}
		return "$ ";
	}
}
