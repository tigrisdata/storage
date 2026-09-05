/**
 * Piped stdin for one CLI invocation.
 *
 * A browser has no stdin, but the shell around the CLI does: in
 * `echo hi | tigris objects put …`, just-bash hands the upstream bytes to the
 * `tigris` command. Those land here, and the `process` shim exposes them as a
 * readable stream with `isTTY` false — which is exactly how the CLI decides
 * whether it was piped to.
 */

let piped: Uint8Array | null = null;
let workingDirectory = '/home/tigris';

export function setStdin(bytes: Uint8Array | null): void {
  piped = bytes;
}

/** True when this invocation was piped to, i.e. stdin is not a terminal. */
export function hasStdin(): boolean {
  return piped !== null;
}

export function readStdin(): Uint8Array {
  return piped ?? new Uint8Array();
}

/**
 * The directory the CLI should treat as current.
 *
 * The shell has its own cwd that `cd` moves around; without forwarding it, a
 * relative path in `tigris objects put ./notes.txt` would resolve against home
 * rather than where the user actually is.
 */
export function setWorkingDirectory(cwd: string | null): void {
  workingDirectory = cwd ?? '/home/tigris';
}

export function getWorkingDirectory(): string {
  return workingDirectory;
}
