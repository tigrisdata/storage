/**
 * Tigris storage config, passed directly to @tigrisdata/storage SDK calls.
 * Auth can be passed explicitly or read from environment variables.
 */
export interface TigrisConfig {
	/** Tigris bucket name. Falls back to TIGRIS_STORAGE_BUCKET env var. */
	bucket?: string;
	/** Access key ID. Falls back to TIGRIS_STORAGE_ACCESS_KEY_ID env var. */
	accessKeyId?: string;
	/** Secret access key. Falls back to TIGRIS_STORAGE_SECRET_ACCESS_KEY env var. */
	secretAccessKey?: string;
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
