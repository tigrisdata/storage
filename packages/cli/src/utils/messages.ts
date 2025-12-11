import { getCommandSpec } from './specs.js';
import type { CommandSpec, OperationSpec, Messages } from '../types.js';

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
function interpolate(template: string, variables?: MessageVariables): string {
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
 */
export function printStart(
  context: MessageContext,
  variables?: MessageVariables
): void {
  const messages = getMessages(context);
  if (messages?.onStart) {
    console.log(interpolate(messages.onStart, variables));
  }
}

/**
 * Print the onSuccess message for a command/operation
 */
export function printSuccess(
  context: MessageContext,
  variables?: MessageVariables
): void {
  const messages = getMessages(context);
  if (messages?.onSuccess) {
    console.log(
      `${ICONS.success} ${interpolate(messages.onSuccess, variables)}`
    );
  }
}

/**
 * Print the onFailure message for a command/operation
 */
export function printFailure(
  context: MessageContext,
  error?: string,
  variables?: MessageVariables
): void {
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
 */
export function printEmpty(
  context: MessageContext,
  variables?: MessageVariables
): void {
  const messages = getMessages(context);
  if (messages?.onEmpty) {
    console.log(interpolate(messages.onEmpty, variables));
  }
}

/**
 * Print the onAlreadyDone message for a command/operation (when action already completed)
 */
export function printAlreadyDone(
  context: MessageContext,
  variables?: MessageVariables
): void {
  const messages = getMessages(context);
  if (messages?.onAlreadyDone) {
    console.log(interpolate(messages.onAlreadyDone, variables));
  }
}

/**
 * Print a hint message for a command/operation
 */
export function printHint(
  context: MessageContext,
  variables?: MessageVariables
): void {
  const messages = getMessages(context);
  if (messages?.hint) {
    console.log(`${ICONS.hint} ${interpolate(messages.hint, variables)}`);
  }
}

/**
 * Helper to create a message context
 */
export function msg(command: string, operation?: string): MessageContext {
  return { command, operation };
}
