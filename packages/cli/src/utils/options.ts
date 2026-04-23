/**
 * Gets an option value from multiple possible keys (for handling aliases)
 * @param options - Options object
 * @param keys - Array of possible keys to check
 * @param defaultValue - Optional default value
 * @returns The first found value or default
 */
export function getOption<T>(
  options: Record<string, unknown>,
  keys: string[],
  defaultValue?: T
): T | undefined {
  for (const key of keys) {
    if (options[key] !== undefined) {
      return options[key] as T;
    }
  }
  return defaultValue;
}

/**
 * Resolve the output format from --json flag and --format option.
 * --json takes precedence; falls back to --format or the given default.
 */
export function getFormat(
  options: Record<string, unknown>,
  defaultFormat = 'table'
): string {
  const json = getOption<boolean>(options, ['json']);
  if (json) return 'json';
  return getOption<string>(options, ['format'], defaultFormat) ?? defaultFormat;
}

export interface PaginationOptions {
  limit?: number;
  pageToken?: string;
  isPaginated: boolean;
}

/**
 * Extract pagination flags from command options.
 * Returns isPaginated=true when at least one pagination flag was provided.
 */
export function getPaginationOptions(
  options: Record<string, unknown>
): PaginationOptions {
  const rawLimit = getOption<string | number>(options, ['limit']);
  const limit = rawLimit !== undefined ? Number(rawLimit) : undefined;
  const pageToken = getOption<string>(options, [
    'page-token',
    'pageToken',
    'pt',
  ]);
  return {
    limit,
    pageToken,
    isPaginated: limit !== undefined || pageToken !== undefined,
  };
}

/**
 * Parses a boolean value from string or boolean input
 * - undefined → undefined
 * - true (boolean) → true
 * - false (boolean) → false
 * - "true" (string) → true
 * - "false" (string) → false
 */
export function parseBoolean(
  value: string | boolean | undefined
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return value === 'true';
}

/**
 * Read all of stdin as a UTF-8 string.
 * Use when stdin is piped (i.e. `!process.stdin.isTTY`).
 */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
