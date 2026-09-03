/**
 * Line editing on top of xterm.js.
 *
 * xterm gives you raw keystrokes, so everything `node:readline` provides for
 * free — history, cursor movement, redraw, Ctrl+C — is implemented here. The
 * shell itself sees only the two-method {@link ReplIO}.
 */

import type { Terminal } from '@xterm/xterm';
import type { ShellEngine } from '../shell.js';
import { computeCompletions } from './complete.js';
import type { ReplIO } from './io.js';
import { PROMPT_CANCELLED } from './io.js';
import type { ShellSession } from './session.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const CLEAR_LINE = '\r\x1b[K';

export interface TerminalLoopOptions {
  terminal: Terminal;
  engine: ShellEngine;
  session: ShellSession;
}

export class TerminalLoop {
  private line = '';
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = 0;
  private busy = false;

  /** Set while a command is awaiting an answer from `ReplIO.prompt`. */
  private pendingResolve: ((answer: string) => void) | null = null;
  private pendingPrompt = '';

  /** True while the pending prompt is for a secret, so keystrokes are masked. */
  private masked = false;

  /**
   * Pasted text not yet consumed. xterm delivers a paste as one event, so a
   * multi-line paste is fed from here one line at a time, each line as the
   * loop becomes ready for it — the way a tty's input queue feeds a shell.
   */
  private pasted = '';

  /**
   * Whether the last thing written ended a line. The prompt clears the line it
   * starts on, so output that does not end in a newline — `head -c 8`, a file
   * with no trailing newline — would otherwise be erased by the next prompt.
   */
  private atLineStart = true;

  constructor(private readonly options: TerminalLoopOptions) {}

  get io(): ReplIO {
    return {
      // xterm needs CRLF; everything upstream emits LF.
      write: (text) => {
        if (text === '') return;
        this.atLineStart = text.endsWith('\n');
        this.options.terminal.write(text.replace(/\r?\n/g, '\r\n'));
      },
      prompt: (message, options) => {
        this.options.terminal.write(message.replace(/\r?\n/g, '\r\n'));
        const lines = message.split(/\r?\n/);
        this.pendingPrompt = lines[lines.length - 1] ?? '';
        this.masked = options?.password === true;
        this.atLineStart = false;
        const answer = new Promise<string>((resolve) => {
          this.pendingResolve = resolve;
        });
        // A paste may already hold the answer.
        this.drain();
        return answer;
      },
    };
  }

  start(): void {
    this.drawPrompt();
    this.options.terminal.onData((data) => void this.onData(data));
  }

  private get prefix(): string {
    return this.pendingResolve
      ? this.pendingPrompt
      : `${GREEN}${this.options.session.promptText}${RESET}`;
  }

  private drawPrompt(): void {
    // Preserve output that stopped mid-line rather than clearing over it.
    if (!this.atLineStart) {
      this.options.terminal.write('\r\n');
      this.atLineStart = true;
    }
    this.options.terminal.write(CLEAR_LINE + this.prefix);
    this.drain();
  }

  private redraw(): void {
    const shown = this.masked ? '*'.repeat(this.line.length) : this.line;
    this.options.terminal.write(CLEAR_LINE + this.prefix + shown);
    const back = this.line.length - this.cursor;
    if (back > 0) this.options.terminal.write(`\x1b[${back}D`);
  }

  private async onData(data: string): Promise<void> {
    // Drop keystrokes while a command runs — unless it is waiting on a prompt.
    if (this.busy && !this.pendingResolve) return;

    // Anything longer than a key that is not an escape sequence is a paste.
    // xterm has already turned its newlines into \r, and a trailing one would
    // otherwise never match the submit case below.
    if (data.length > 1 && !data.startsWith('\x1b')) {
      this.pasted += data.replace(/\r\n|\r|\n/g, '\r');
      this.drain();
      return;
    }

    switch (data) {
      case '\r':
        return this.submit();

      case '\x7f': // Backspace
        if (this.cursor > 0) {
          this.line =
            this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
          this.cursor--;
          this.redraw();
        }
        return;

      case '\x03': // Ctrl+C
        return this.cancel();

      case '\x0c': // Ctrl+L
        this.options.terminal.clear();
        this.redraw();
        return;

      case '\t':
        return this.complete();

      case '\x1b[A': // Up
        return this.recall(-1);

      case '\x1b[B': // Down
        return this.recall(1);

      case '\x1b[C': // Right
        if (this.cursor < this.line.length) {
          this.cursor++;
          this.options.terminal.write('\x1b[C');
        }
        return;

      case '\x1b[D': // Left
        if (this.cursor > 0) {
          this.cursor--;
          this.options.terminal.write('\x1b[D');
        }
        return;

      default:
        // Ignore other escape sequences and control characters.
        if (data < ' ' || data.startsWith('\x1b')) return;
        this.insert(data);
    }
  }

  private insert(text: string): void {
    this.line =
      this.line.slice(0, this.cursor) + text + this.line.slice(this.cursor);
    this.cursor += text.length;
    this.redraw();
  }

  /**
   * Feed pasted text for as long as the loop can take a line: at the shell
   * prompt, or at a prompt a command is waiting on. Each newline submits;
   * whatever follows the last one stays on the line, editable. Stops when a
   * submitted line starts a command, and resumes from the next prompt.
   */
  private drain(): void {
    while (this.pasted !== '' && (!this.busy || this.pendingResolve)) {
      const newline = this.pasted.indexOf('\r');
      const chunk =
        newline === -1 ? this.pasted : this.pasted.slice(0, newline);
      this.pasted = newline === -1 ? '' : this.pasted.slice(newline + 1);

      // Control characters have no line-editing meaning inside a paste.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
      const text = chunk.replace(/[\x00-\x1f\x7f]/g, '');
      if (text !== '') this.insert(text);

      if (newline !== -1) void this.submit();
    }
  }

  private cancel(): void {
    this.options.terminal.write('^C\r\n');
    this.atLineStart = true;

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.masked = false;
      resolve(PROMPT_CANCELLED);
      return;
    }

    this.line = '';
    this.cursor = 0;
    this.drawPrompt();
  }

  private async submit(): Promise<void> {
    const input = this.line;
    this.options.terminal.write('\r\n');
    this.atLineStart = true;
    this.line = '';
    this.cursor = 0;

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.masked = false;
      resolve(input);
      return;
    }

    if (input.trim() !== '') {
      this.history.push(input);
      this.historyIndex = this.history.length;
    }

    // `clear` is intercepted here because only the frontend owns the screen.
    if (input.trim() === 'clear') {
      this.options.terminal.clear();
      this.drawPrompt();
      return;
    }

    this.busy = true;
    try {
      await this.options.session.handle(input, this.io);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.io.write(`${RED}${message}${RESET}\n`);
    } finally {
      this.busy = false;
      this.drawPrompt();
    }
  }

  private recall(direction: number): void {
    if (this.pendingResolve || this.history.length === 0) return;

    const next = this.historyIndex + direction;
    if (next < 0 || next > this.history.length) return;

    this.historyIndex = next;
    this.line = this.history[next] ?? '';
    this.cursor = this.line.length;
    this.redraw();
  }

  private async complete(): Promise<void> {
    if (this.pendingResolve) return;

    const [hits, token] = await computeCompletions(
      this.line.slice(0, this.cursor),
      {
        engine: this.options.engine,
        session: this.options.session,
        cwd: this.options.session.currentDirectory,
      }
    );

    if (hits.length === 0) return;

    const shared = longestCommonPrefix(hits);
    if (shared.length > token.length) {
      const suffix = shared.slice(token.length);
      this.line =
        this.line.slice(0, this.cursor) + suffix + this.line.slice(this.cursor);
      this.cursor += suffix.length;
      this.redraw();
      return;
    }

    if (hits.length > 1) {
      this.options.terminal.write('\r\n');
      this.io.write(`${hits.join('  ')}\n`);
      this.redraw();
    }
  }
}

export function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) return '';

  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix === '') return '';
    }
  }
  return prefix;
}
