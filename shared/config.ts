import dotenv from 'dotenv';

export function isNode(): boolean {
  return (
    typeof process !== 'undefined' &&
    !!process.versions &&
    !!process.versions.node
  );
}

export function loadEnv(): void {
  if (isNode()) {
    dotenv.config({ quiet: true });
  }
}

export const missingConfigError = (key: string, envVar?: string) => ({
  error: new Error(
    `Tigris Config incomplete: ${key} is missing. ${envVar ? `Set ${envVar} in environment or pass it as an option.` : 'Pass it as an option.'}`
  ),
});
