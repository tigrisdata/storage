import dotenv from 'dotenv';

export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions &&
    !!process.versions.node
  );
}

let cachedDotenv: Record<string, string> | undefined;

/**
 * Parse the consumer's `.env` file into a private, memoized object, keeping
 * only `TIGRIS_`-prefixed keys.
 *
 * `dotenv`'s `processEnv` option redirects its writes to the throwaway object
 * we hand it, so the global `process.env` is never mutated. Importing or using
 * the SDK therefore cannot leak a consumer's `.env` — including unrelated
 * secrets in it — into the process environment. Returns `{}` outside Node or
 * when there is no readable `.env`.
 */
function readDotenv(): Record<string, string> {
  if (!isNode()) {
    return {};
  }
  if (cachedDotenv) {
    return cachedDotenv;
  }

  const parsed = dotenv.config({ quiet: true, processEnv: {} }).parsed ?? {};
  cachedDotenv = Object.fromEntries(
    Object.entries(parsed).filter(([key]) => key.startsWith('TIGRIS_'))
  );
  return cachedDotenv;
}

/**
 * Resolve a single Tigris env var at call time. An explicitly-set `process.env`
 * value wins (matching dotenv's non-override behavior); otherwise fall back to
 * the value parsed from `.env`. Never writes to `process.env`.
 */
export function getEnvVar(key: string): string | undefined {
  if (!isNode()) {
    return undefined;
  }
  return process.env[key] ?? readDotenv()[key];
}

export const missingConfigError = (key: string, envVar?: string) => ({
  error: new Error(
    `Tigris Config incomplete: ${key} is missing. ${envVar ? `Set ${envVar} in environment or pass it as an option.` : 'Pass it as an option.'}`
  ),
});
