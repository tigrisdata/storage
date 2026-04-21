/**
 * Abstraction for terminal I/O. Implemented differently by
 * CLI (readline/stdout) and playground (xterm.js).
 */
export interface ReplIO {
	/** Write text to the terminal. */
	write(text: string): void;
	/** Prompt the user for input and wait for response. */
	prompt(message: string): Promise<string>;
}
