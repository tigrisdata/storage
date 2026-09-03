/**
 * Tracks the working directory and hands every line to bash.
 *
 * Everything goes to bash, which owns the filesystem and reaches the CLI
 * through the `tigris` command. Only `clear` is intercepted, because only the
 * frontend owns the screen.
 */

import { HOME_DIR } from '@tigrisdata/cli/browser';

import type { ShellEngine } from '../shell.js';
import type { ReplIO } from './io.js';

export interface ShellSessionOptions {
  engine: ShellEngine;
  /** Directory the shell starts in. */
  home?: string;
}

/**
 * Verbs the shell owns rather than bash. Only `clear` qualifies: everything
 * else is either a bash builtin or reached through `tigris`.
 */
export const SHELL_COMMANDS = ['clear'] as const;

export class ShellSession {
  private cwd: string;

  constructor(private readonly options: ShellSessionOptions) {
    this.cwd = options.home ?? HOME_DIR;
  }

  get promptText(): string {
    return `${this.cwd} $ `;
  }

  get currentDirectory(): string {
    return this.cwd;
  }

  get shellCommands(): readonly string[] {
    return SHELL_COMMANDS;
  }

  async handle(line: string, io: ReplIO): Promise<void> {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed === 'clear') return;

    const result = await this.options.engine.exec(trimmed, this.cwd);

    if (result.stdout) io.write(result.stdout);
    if (result.stderr) io.write(result.stderr);

    // `cd` only sticks if we carry PWD forward ourselves.
    if (result.env?.PWD) {
      this.cwd = result.env.PWD.replace(/\/{2,}/g, '/');
    }
  }
}
