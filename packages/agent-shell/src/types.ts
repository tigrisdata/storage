/**
 * Tigris storage config. Supports two auth modes:
 * - Access key: accessKeyId + secretAccessKey
 * - Session token: sessionToken + organizationId
 *
 * At least one auth mode must be provided. Bucket is optional —
 * use TigrisShell.mount() to mount buckets at specific paths.
 */
export interface TigrisConfig {
	/** Access key ID. */
	accessKeyId?: string;
	/** Secret access key. */
	secretAccessKey?: string;
	/** Session token (from OAuth login). */
	sessionToken?: string;
	/** Organization ID (required with session token). */
	organizationId?: string;
	/** Tigris bucket name. If provided, auto-mounted at /workspace. */
	bucket?: string;
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

/**
 * Validates that TigrisConfig has at least one auth mode.
 * Throws if neither access key nor session token auth is provided.
 */
export function validateConfig(config: TigrisConfig): void {
	const hasAccessKey = config.accessKeyId !== undefined && config.secretAccessKey !== undefined;
	const hasSessionToken = config.sessionToken !== undefined && config.organizationId !== undefined;

	if (!hasAccessKey && !hasSessionToken) {
		throw new Error(
			"TigrisConfig requires either (accessKeyId + secretAccessKey) or (sessionToken + organizationId)",
		);
	}
}
