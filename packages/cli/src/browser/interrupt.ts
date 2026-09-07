/**
 * Ending a run from inside a prompt.
 *
 * In Node, Ctrl+C at a `readline` question raises SIGINT and the process
 * dies — the handler waiting on the answer never resumes. Here a run is one
 * `cli.run()` call; interrupting it settles that call with SIGINT's exit
 * status and abandons the handler the same way.
 */

import { ExitSignal } from './exit-signal.js';

export const INTERRUPTED_EXIT_CODE = 130;

let interrupter: ((signal: ExitSignal) => void) | null = null;

/** Installed by `run()` for its duration. */
export function setRunInterrupter(
  fn: ((signal: ExitSignal) => void) | null
): void {
  interrupter = fn;
}

/** End the current run as SIGINT would. False when no run is active. */
export function interruptRun(): boolean {
  if (!interrupter) return false;
  interrupter(new ExitSignal(INTERRUPTED_EXIT_CODE));
  return true;
}
