/**
 * Tigris storage config, passed directly to @tigrisdata/storage SDK calls.
 */
export interface TigrisConfig {
	/** Tigris bucket name. */
	bucket: string;
	/** Access key ID. */
	accessKeyId: string;
	/** Secret access key. */
	secretAccessKey: string;
	/** Tigris endpoint. Defaults to https://t3.storage.dev */
	endpoint?: string;
}

/**
 * Shell-specific options.
 */
export interface ShellOptions {
	/** Starting working directory. Defaults to /workspace. */
	cwd?: string;
	/** Initial environment variables for the shell. */
	env?: Record<string, string>;
}
