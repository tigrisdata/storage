import type { CommandSpec, Messages, OperationSpec } from '../types.js';
import { getCommandSpec } from './specs.js';

export type MessageVariables = Record<
  string,
  string | number | boolean | undefined
>;

export interface MessageContext {
  command: string;
  operation?: string;
}

// Icons for different message types
const ICONS = {
  success: '✔',
  failure: '✖',
  hint: '→',
} as const;

/**
 * Check if stdout is a TTY (interactive terminal)
 * When false, output is being piped/redirected (e.g., using > operator)
 */
function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

function isJsonMode(): boolean {
  return globalThis.__TIGRIS_JSON_MODE === true;
}

function getMessages(context: MessageContext): Messages | undefined {
  const spec = getCommandSpec(context.command, context.operation);
  if (!spec) return undefined;
  return (spec as CommandSpec | OperationSpec).messages;
}

/**
 * Interpolate variables in a message template
 * Supports {{variableName}} syntax
 * Also processes \n for multiline support
 */
export function interpolate(
  template: string,
  variables?: MessageVariables
): string {
  let result = template;

  // Process escaped newlines for multiline support
  result = result.replace(/\\n/g, '\n');

  // Interpolate variables: {{name}} -> value
  if (variables) {
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : `{{${key}}}`;
    });
  }

  return result;
}

/**
 * Print the onStart message for a command/operation
 * Suppressed when output is piped/redirected
 */
export function printStart(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isTTY() || isJsonMode()) return;
  const messages = getMessages(context);
  if (messages?.onStart) {
    console.log(interpolate(messages.onStart, variables));
  }
}

/**
 * Print the onSuccess message for a command/operation
 * Suppressed when output is piped/redirected
 */
export function printSuccess(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isTTY() || isJsonMode()) return;
  const messages = getMessages(context);
  if (messages?.onSuccess) {
    console.log(
      `${ICONS.success} ${interpolate(messages.onSuccess, variables)}`
    );
  }
}

/**
 * Print the onFailure message for a command/operation
 * Suppressed in JSON mode to avoid mixing human-readable text with structured JSON on stderr
 */
export function printFailure(
  context: MessageContext,
  error?: string,
  variables?: MessageVariables
): void {
  if (globalThis.__TIGRIS_JSON_MODE === true) return;
  const messages = getMessages(context);
  if (messages?.onFailure) {
    console.error(
      `${ICONS.failure} ${interpolate(messages.onFailure, variables)}`
    );
  }
  if (error) {
    console.error(`  ${error}`);
  }
}

/**
 * Print the onEmpty message for a command/operation (when no results found)
 * Suppressed when output is piped/redirected
 */
export function printEmpty(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isTTY() || isJsonMode()) return;
  const messages = getMessages(context);
  if (messages?.onEmpty) {
    console.log(interpolate(messages.onEmpty, variables));
  }
}

/**
 * Print the onAlreadyDone message for a command/operation (when action already completed)
 * Suppressed when output is piped/redirected
 */
export function printAlreadyDone(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isTTY() || isJsonMode()) return;
  const messages = getMessages(context);
  if (messages?.onAlreadyDone) {
    console.log(interpolate(messages.onAlreadyDone, variables));
  }
}

/**
 * Print a hint message for a command/operation
 * Suppressed when output is piped/redirected
 */
export function printHint(
  context: MessageContext,
  variables?: MessageVariables
): void {
  if (!isTTY() || isJsonMode()) return;
  const messages = getMessages(context);
  if (messages?.hint) {
    console.log(`${ICONS.hint} ${interpolate(messages.hint, variables)}`);
  }
}

/**
 * Print a deprecation warning for a command
 * Suppressed when output is piped/redirected
 */
export function printDeprecated(message: string): void {
  if (!isTTY()) return;
  console.warn(`⚠ Deprecated: ${message}`);
}

/**
 * Helper to create a message context
 */
export function msg(command: string, operation?: string): MessageContext {
  return { command, operation };
}
