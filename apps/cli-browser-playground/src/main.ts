/**
 * Local harness for `@tigrisdata/cli/browser`.
 *
 * Deliberately plain DOM: this exists to prove the CLI itself runs in a real
 * browser. The xterm.js React component is `@tigrisdata/cli-shell`.
 */

import {
  type BrowserHost,
  createBrowserCli,
  type SelectChoice,
} from '@tigrisdata/cli/browser';

interface Prefill {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

declare const __PREFILL__: Prefill | undefined;

/**
 * Vite substitutes `__PREFILL__` at transform time. If the dev server's config
 * has gone stale the identifier is left unresolved, so read it defensively —
 * an empty form is a far better failure than a blank page.
 */
const prefill: Prefill =
  typeof __PREFILL__ === 'undefined'
    ? { accessKeyId: '', secretAccessKey: '', bucket: '' }
    : __PREFILL__;

const outputEl = document.getElementById('output') as HTMLDivElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const commandEl = document.getElementById('command') as HTMLInputElement;
const authForm = document.getElementById('auth') as HTMLFormElement;
const replForm = document.getElementById('repl') as HTMLFormElement;
const keyIdEl = document.getElementById('accessKeyId') as HTMLInputElement;
const secretEl = document.getElementById('secretAccessKey') as HTMLInputElement;

keyIdEl.value = prefill.accessKeyId;
secretEl.value = prefill.secretAccessKey;

/** Credentials live here and nowhere else — no localStorage, no cookies. */
const env: Record<string, string> = {};

function print(text: string, className?: string): void {
  if (!text) return;
  const block = document.createElement('pre');
  if (className) block.className = className;
  block.textContent = text.replace(/\n$/, '');
  outputEl.append(block);
  outputEl.scrollTop = outputEl.scrollHeight;
}

/**
 * Render an inline prompt and resolve when the user answers. This is what
 * backs `host.confirm` / `input` / `select`, which the CLI reaches through its
 * normal enquirer and readline call sites.
 */
function ask(
  message: string,
  options: { password?: boolean; choices?: SelectChoice[] } = {}
): Promise<string> {
  return new Promise((resolve) => {
    const row = document.createElement('div');
    row.className = 'ask';

    const label = document.createElement('div');
    label.className = 'ask-label';
    label.textContent = message;
    row.append(label);

    if (options.choices) {
      for (const choice of options.choices) {
        const button = document.createElement('button');
        button.textContent = choice.label;
        button.onclick = () => {
          row.remove();
          print(`${message} ${choice.label}`, 'echo');
          resolve(choice.value);
        };
        row.append(button);
      }
    } else {
      const input = document.createElement('input');
      input.type = options.password ? 'password' : 'text';
      input.onkeydown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        row.remove();
        print(`${message} ${options.password ? '••••' : input.value}`, 'echo');
        resolve(input.value);
      };
      row.append(input);
      queueMicrotask(() => input.focus());
    }

    outputEl.append(row);
    outputEl.scrollTop = outputEl.scrollHeight;
  });
}

const host: BrowserHost = {
  get columns() {
    // Roughly match the output pane so tables wrap sensibly.
    return Math.max(60, Math.floor(outputEl.clientWidth / 8));
  },
  env,
  confirm: async (message) =>
    /^y(es)?$/i.test((await ask(`${message}`)).trim()),
  input: (message, options) => ask(message, { password: options?.password }),
  select: (message, choices) => ask(message, { choices }),
  login: async () => {
    throw new Error(
      'OAuth login arrives with @tigrisdata/cli-shell. Use access keys above for now.'
    );
  },
  openUrl: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
};

const cli = createBrowserCli(host);

authForm.onsubmit = (event) => {
  event.preventDefault();
  env.TIGRIS_STORAGE_ACCESS_KEY_ID = keyIdEl.value.trim();
  env.TIGRIS_STORAGE_SECRET_ACCESS_KEY = secretEl.value.trim();
  statusEl.textContent = `Using access key ${keyIdEl.value.trim().slice(0, 8)}…`;
  statusEl.classList.add('ok');
  print('Credentials set (in memory only). Try: ls', 'echo');
  commandEl.focus();
};

let running = false;

replForm.onsubmit = async (event) => {
  event.preventDefault();
  const line = commandEl.value.trim();
  if (!line || running) return;

  commandEl.value = '';
  print(`$ ${line}`, 'echo');

  running = true;
  try {
    // Split on whitespace, honouring simple quoting.
    const argv =
      line
        .match(/"[^"]*"|'[^']*'|\S+/g)
        ?.map((a) => a.replace(/^["']|["']$/g, '')) ?? [];
    const result = await cli.run(argv);
    print(result.stdout);
    print(result.stderr, 'err');
    if (result.exitCode !== 0) print(`exit ${result.exitCode}`, 'err');
  } catch (error) {
    print(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
      'err'
    );
  } finally {
    running = false;
    commandEl.focus();
  }
};

print(
  `Tigris CLI browser build — ${cli.commands().length} commands available.`,
  'echo'
);
print(
  'Set credentials above, then try:  ls  ·  whoami  ·  buckets get <name>  ·  --help',
  'echo'
);
if (prefill.bucket) print(`Bucket from repo .env: ${prefill.bucket}`, 'echo');
