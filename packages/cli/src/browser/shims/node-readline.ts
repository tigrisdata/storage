/**
 * `node:readline` mapped onto the host terminal.
 *
 * Reached by `utils/interactive.ts:confirm()`, which builds an interface and
 * calls `rl.question('... (y/N): ', cb)`. The prompt text already carries its
 * own hint, so it goes straight to the host's line input.
 */

import { getHost } from '../host.js';
import { interruptRun } from '../interrupt.js';
import { writeErr } from '../output.js';

export interface ReadlineInterface {
  question(message: string, callback: (answer: string) => void): void;
  close(): void;
  on(event: string, handler: () => void): ReadlineInterface;
}

export function createInterface(): ReadlineInterface {
  const iface: ReadlineInterface = {
    question(message, callback) {
      void getHost()
        .input(message)
        .then((answer) => callback(answer))
        .catch((error: unknown) => {
          // Ctrl+C. In Node this is SIGINT and the process ends; answering ''
          // instead read as "no", and `buckets delete` finished as declined
          // rather than interrupted.
          const message =
            error instanceof Error ? error.message : String(error);
          if (!/cancelled/i.test(message)) writeErr(`${message}\n`);
          if (!interruptRun()) callback('');
        });
    },
    close() {},
    on() {
      return iface;
    },
  };
  return iface;
}

export default { createInterface };
