/**
 * Bridges the CLI's prompt calls onto a `ReplIO`.
 *
 * The CLI asks questions through enquirer and `node:readline`; its browser
 * build turns those into `BrowserHost` calls, and this turns those into
 * terminal writes and line reads.
 */

import type { BrowserHost, SelectChoice } from '@tigrisdata/cli/browser';
import { PROMPT_CANCELLED, type ReplIO } from './io.js';

export interface HostOptions {
  io: ReplIO;
  /** Runs interactive login. Without it, `tigris login` explains what to do. */
  login?: () => Promise<void>;
  columns?: () => number;
  env?: () => Record<string, string>;
  /** Discards the host's own session on `tigris logout`. */
  logout?: () => Promise<void>;
  /** Renews the OAuth session when the CLI asks — see BrowserHost.refreshSession. */
  refreshSession?: () => Promise<void>;
}

/** Matches how the Node CLI reports an interrupted prompt. */
function cancelled(): Error {
  return new Error('Operation cancelled');
}

/**
 * The index an empty answer selects. Enquirer's `initial` is an index or a
 * choice name; anything that does not resolve falls back to the first choice,
 * as enquirer does.
 */
function defaultChoice(
  choices: SelectChoice[],
  initial: number | string | undefined
): number {
  if (typeof initial === 'number') {
    return Number.isInteger(initial) && initial >= 0 && initial < choices.length
      ? initial
      : 0;
  }
  if (typeof initial === 'string') {
    const index = choices.findIndex(
      (choice) => choice.value === initial || choice.label === initial
    );
    return index === -1 ? 0 : index;
  }
  return 0;
}

export function createReplHost(options: HostOptions): BrowserHost {
  const { io, login, columns, env, logout, refreshSession } = options;

  return {
    get columns() {
      return columns?.() ?? 120;
    },

    get env() {
      return env?.() ?? {};
    },

    confirm: async (message, options) => {
      // Enquirer semantics: an empty answer means `initial`, shown the way
      // enquirer shows it. Without this, Enter on "Enable snapshots?" —
      // default yes in the CLI — answered no.
      const initial = options?.initial;
      const hint = initial === undefined ? '' : initial ? ' (Y/n)' : ' (y/N)';
      const answer = await io.prompt(`${message}${hint} `);
      // Ctrl+C aborts the command, as at every other prompt. Answering "no"
      // instead would let `buckets create` carry on and create the bucket.
      if (answer === PROMPT_CANCELLED) throw cancelled();
      if (answer.trim() === '') return initial ?? false;
      return /^y(es)?$/i.test(answer.trim());
    },

    input: async (message, options) => {
      // Enquirer semantics: an empty answer takes `initial`. Without this a
      // prompt with a prefilled default — an endpoint, a region — would store
      // an empty string when the user just presses enter.
      const initial = options?.initial;
      const label = initial ? `${message} [${initial}] ` : `${message} `;
      const answer = await io.prompt(label, {
        password: options?.password === true,
      });
      if (answer === PROMPT_CANCELLED) throw cancelled();
      return answer === '' && initial !== undefined ? initial : answer;
    },

    select: async (message, choices: SelectChoice[], options) => {
      if (choices.length === 0) return '';

      io.write(`${message}\n`);
      choices.forEach((choice, index) => {
        const hint = choice.hint ? `  (${choice.hint})` : '';
        io.write(`  ${index + 1}) ${choice.label}${hint}\n`);
      });

      const fallback = defaultChoice(choices, options?.initial);

      // Loop rather than guess: a mistyped answer here would otherwise be
      // silently coerced into the first choice.
      for (;;) {
        const raw = await io.prompt(`Select [${fallback + 1}]: `);
        if (raw === PROMPT_CANCELLED) throw cancelled();

        const answer = raw.trim();
        if (answer === '') return choices[fallback].value;

        const index = Number.parseInt(answer, 10);
        if (!Number.isNaN(index) && choices[index - 1]) {
          return choices[index - 1].value;
        }

        const matched = choices.find(
          (choice) => choice.value === answer || choice.label === answer
        );
        if (matched) return matched.value;

        io.write(`Not one of the choices: ${answer}\n`);
      }
    },

    ...(logout ? { logout } : {}),
    ...(refreshSession ? { refreshSession } : {}),

    login: async () => {
      if (!login) {
        throw new Error(
          'Not authenticated. Please run "tigris login" or "tigris configure" first.'
        );
      }
      await login();
    },

    openUrl: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}
