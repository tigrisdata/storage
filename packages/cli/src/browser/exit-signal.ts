/**
 * Thrown by the browser `process.exit` shim in place of terminating the process.
 *
 * The Node CLI reaches `process.exit()` from ~330 call sites (302 via
 * `exitWithError`/`failWithError`, plus direct calls). Those functions are typed
 * `: never`, and throwing preserves that contract exactly — so no handler needs
 * to change for the browser build. `runCli()` catches this and turns it back
 * into an exit code.
 */
export class ExitSignal extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super(`process.exit(${exitCode})`);
    this.name = 'ExitSignal';
    this.exitCode = exitCode;
  }
}

export function isExitSignal(error: unknown): error is ExitSignal {
  return error instanceof ExitSignal;
}
