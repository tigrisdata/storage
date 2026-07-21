import type { NextAction } from '../types.js';
import { classifyError } from './errors.js';
import type { MessageContext, MessageVariables } from './messages.js';
import { interpolate, printFailure } from './messages.js';
import { getCommandSpec } from './specs.js';
import { captureError } from './telemetry.js';

function isJsonMode(): boolean {
  return globalThis.__TIGRIS_JSON_MODE === true;
}

function isStderrTTY(): boolean {
  return process.stderr.isTTY === true;
}

function isStdoutTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Exit with a classified error code.
 * - JSON mode: outputs structured error JSON to stderr
 * - Non-JSON without context: prints the error message to stderr
 *   (callers that pass context already printed via printFailure)
 * - TTY mode: prints "Next steps:" hints to stderr
 * - Always exits with the classified exit code
 */
export function exitWithError(
  error: unknown,
  context?: MessageContext,
  opts?: { skipCapture?: boolean }
): never {
  const classified = classifyError(error);

  if (isJsonMode()) {
    const errorOutput: Record<string, unknown> = {
      error: {
        message: classified.message,
        code: classified.exitCode,
        category: classified.category,
      },
    };
    if (classified.nextActions.length > 0) {
      errorOutput.nextActions = classified.nextActions;
    }
    console.error(JSON.stringify(errorOutput));
  } else {
    if (!context) {
      console.error(`\nError: ${classified.message}`);
    }
    if (isStderrTTY() && classified.nextActions.length > 0) {
      console.error('\nNext steps:');
      for (const action of classified.nextActions) {
        console.error(`  → ${action.command}  ${action.description}`);
      }
    }
  }

  // Best-effort capture on the synchronous command path: the exit below halts
  // immediately (callers rely on this `never` contract), so the event may not
  // flush in time. Crashes are captured and flushed reliably by the global
  // handlers in setupErrorHandlers(), which pass skipCapture to avoid a double
  // report here.
  if (!opts?.skipCapture) {
    captureError(error, {
      category: classified.category,
      command: context?.command,
      exitCode: classified.exitCode,
    });
  }

  process.exit(classified.exitCode);
}

/**
 * Print failure message and exit. Combines printFailure + exitWithError.
 */
export function failWithError(context: MessageContext, error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  printFailure(context, message);
  exitWithError(error, context);
}

/**
 * Read nextActions from specs.yaml for a command and interpolate variables.
 * Returns empty array if no nextActions defined.
 */
export function getSuccessNextActions(
  context: MessageContext,
  variables?: MessageVariables
): NextAction[] {
  const spec = getCommandSpec(context.command, context.operation);
  if (!spec?.messages?.nextActions) return [];

  return spec.messages.nextActions.map((action) => ({
    command: interpolate(action.command, variables),
    description: interpolate(action.description, variables),
  }));
}

/**
 * Print "Next steps:" hints for success cases.
 * Only prints in TTY mode and only when nextActions are defined.
 */
export function printNextActions(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isStdoutTTY() || isJsonMode()) return;
  const nextActions = getSuccessNextActions(context, variables);
  if (nextActions.length === 0) return;

  console.log('\nNext steps:');
  for (const action of nextActions) {
    console.log(`  → ${action.command}  ${action.description}`);
  }
}
