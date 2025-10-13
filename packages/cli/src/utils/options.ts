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
