/**
 * `enquirer` mapped onto the host terminal.
 *
 * The CLI uses `const { prompt } = enquirer` and calls `prompt(descriptor)` or
 * `prompt([descriptor, ...])`, receiving an object keyed by each `name`.
 * Supported types match what the CLI actually uses: input, password, select,
 * confirm and multiselect.
 */

import { getHost, type SelectChoice } from '../host.js';

type RawChoice =
  | string
  | { name: string; message?: string; value?: string; hint?: string };

interface PromptDescriptor {
  type: string;
  name: string;
  message: string;
  choices?: RawChoice[];
  initial?: string | number | boolean;
  required?: boolean;
}

function toChoices(raw: RawChoice[] = []): SelectChoice[] {
  return raw.map((choice) =>
    typeof choice === 'string'
      ? { value: choice, label: choice }
      : {
          // Enquirer resolves an object choice to its `name`, so callers that
          // parse the answer keep working.
          value: choice.name,
          label: choice.message ?? choice.name,
          ...(choice.hint ? { hint: choice.hint } : {}),
        }
  );
}

/**
 * A line of text, re-asked while a `required` answer is empty — enquirer
 * refuses an empty required field; submitting it would make `login`,
 * `configure` and `buckets create` fail validation instead of asking again.
 */
async function askText(
  descriptor: PromptDescriptor,
  options: { password?: boolean; initial?: string }
): Promise<string> {
  const host = getHost();
  let message = descriptor.message;

  for (;;) {
    const answer = await host.input(message, options);
    if (!descriptor.required || answer.trim() !== '') return answer;
    message = `${descriptor.message} (required)`;
  }
}

async function ask(descriptor: PromptDescriptor): Promise<unknown> {
  const host = getHost();

  switch (descriptor.type) {
    case 'password':
      return askText(descriptor, { password: true });

    case 'input':
      return askText(descriptor, {
        ...(typeof descriptor.initial === 'string'
          ? { initial: descriptor.initial }
          : {}),
      });

    case 'confirm':
      return host.confirm(descriptor.message, {
        ...(typeof descriptor.initial === 'boolean'
          ? { initial: descriptor.initial }
          : {}),
      });

    case 'select':
      return host.select(descriptor.message, toChoices(descriptor.choices), {
        ...(typeof descriptor.initial === 'number' ||
        typeof descriptor.initial === 'string'
          ? { initial: descriptor.initial }
          : {}),
      });

    case 'multiselect': {
      // No multi-select primitive on the host; ask for a comma-separated list
      // of the offered values, which reads fine in a terminal.
      const choices = toChoices(descriptor.choices);
      const menu = choices
        .map((choice, index) => `  ${index + 1}) ${choice.label}`)
        .join('\n');
      const answer = await host.input(
        `${descriptor.message}\n${menu}\nEnter numbers or names, comma-separated:`
      );
      return answer
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const index = Number.parseInt(entry, 10);
          if (!Number.isNaN(index) && choices[index - 1])
            return choices[index - 1].value;
          const matched = choices.find(
            (choice) => choice.value === entry || choice.label === entry
          );
          return matched?.value ?? entry;
        });
    }

    default:
      throw new Error(
        `Unsupported prompt type in the browser build: ${descriptor.type}`
      );
  }
}

export async function prompt<T = Record<string, unknown>>(
  questions: PromptDescriptor | PromptDescriptor[]
): Promise<T> {
  const list = Array.isArray(questions) ? questions : [questions];
  const answers: Record<string, unknown> = {};

  for (const descriptor of list) {
    answers[descriptor.name] = await ask(descriptor);
  }

  return answers as T;
}

export const Enquirer = { prompt };
export default { prompt, Enquirer };
