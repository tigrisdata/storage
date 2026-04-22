import type { ReplIO } from "@tigrisdata/agent-shell/repl";
import { ReplSession } from "@tigrisdata/agent-shell/repl";
import type { Terminal } from "@xterm/xterm";
import { browserLogin } from "./auth.js";

const PROMPT = "\x1b[32m$ \x1b[0m";

/**
 * Thin xterm.js adapter over ReplSession.
 * Handles keyboard input, history, and line editing.
 * Delegates all command execution to the shared REPL layer.
 */
export class ShellLoop {
	private currentLine = "";
	private cursorPos = 0;
	private history: string[] = [];
	private historyIndex = -1;
	private terminal: Terminal;
	private session: ReplSession;
	private busy = false;
	private pendingPromptResolve: ((value: string) => void) | null = null;
	private pendingPromptText = "";

	constructor(terminal: Terminal) {
		this.terminal = terminal;
		this.session = new ReplSession({ loginFn: browserLogin });
	}

	start() {
		this.prompt();
		this.terminal.onData((data) => this.handleInput(data));
	}

	private get io(): ReplIO {
		return {
			write: (text: string) => {
				this.terminal.write(text.replace(/\r?\n/g, "\r\n"));
			},
			prompt: (message: string) => {
				this.terminal.write(message.replace(/\r?\n/g, "\r\n"));
				// Store only the last line for redrawing (strip leading newlines)
				const lines = message.split(/\r?\n/);
				this.pendingPromptText = lines[lines.length - 1] ?? "";
				return new Promise<string>((resolve) => {
					this.pendingPromptResolve = resolve;
				});
			},
		};
	}

	private prompt() {
		this.terminal.write(`\r\n${PROMPT}`);
		this.currentLine = "";
		this.cursorPos = 0;
	}

	private async handleInput(data: string) {
		if (this.busy && !this.pendingPromptResolve) return;

		if (data === "\r") {
			this.terminal.write("\r\n");
			const line = this.currentLine.trim();
			this.currentLine = "";
			this.cursorPos = 0;

			// If a prompt is waiting for input, resolve it
			if (this.pendingPromptResolve) {
				const resolve = this.pendingPromptResolve;
				this.pendingPromptResolve = null;
				this.pendingPromptText = "";
				resolve(line);
				return;
			}

			if (line) {
				this.history.push(line);
				this.historyIndex = this.history.length;
				this.busy = true;

				if (line === "clear") {
					this.terminal.clear();
				} else {
					await this.session.handle(line, this.io);
				}

				this.busy = false;
			}

			this.prompt();
			return;
		}

		if (data === "\x7f") {
			if (this.cursorPos > 0) {
				this.currentLine =
					this.currentLine.slice(0, this.cursorPos - 1) + this.currentLine.slice(this.cursorPos);
				this.cursorPos--;
				this.redrawLine();
			}
			return;
		}

		if (data === "\x03") {
			this.terminal.write("^C\r\n");
			if (this.pendingPromptResolve) {
				const resolve = this.pendingPromptResolve;
				this.pendingPromptResolve = null;
				this.pendingPromptText = "";
				resolve("");
				// Don't prompt here — the session flow will resume and prompt when done
				return;
			}
			this.prompt();
			return;
		}

		if (data === "\x0c") {
			this.terminal.clear();
			const prefix = this.pendingPromptResolve ? this.pendingPromptText : PROMPT;
			this.terminal.write(prefix + this.currentLine);
			return;
		}

		// Arrow keys only when not in prompt mode
		if (!this.pendingPromptResolve) {
			if (data === "\x1b[A") {
				if (this.historyIndex > 0) {
					this.historyIndex--;
					this.setLine(this.history[this.historyIndex] ?? "");
				}
				return;
			}
			if (data === "\x1b[B") {
				if (this.historyIndex < this.history.length - 1) {
					this.historyIndex++;
					this.setLine(this.history[this.historyIndex] ?? "");
				} else {
					this.historyIndex = this.history.length;
					this.setLine("");
				}
				return;
			}
		}

		if (data === "\x1b[C") {
			if (this.cursorPos < this.currentLine.length) {
				this.cursorPos++;
				this.terminal.write(data);
			}
			return;
		}
		if (data === "\x1b[D") {
			if (this.cursorPos > 0) {
				this.cursorPos--;
				this.terminal.write(data);
			}
			return;
		}

		this.currentLine =
			this.currentLine.slice(0, this.cursorPos) + data + this.currentLine.slice(this.cursorPos);
		this.cursorPos += data.length;
		this.redrawLine();
	}

	private setLine(line: string) {
		this.currentLine = line;
		this.cursorPos = line.length;
		this.redrawLine();
	}

	private redrawLine() {
		const prefix = this.pendingPromptResolve ? this.pendingPromptText : PROMPT;
		this.terminal.write(`\r\x1b[K${prefix}${this.currentLine}`);
		const back = this.currentLine.length - this.cursorPos;
		if (back > 0) {
			this.terminal.write(`\x1b[${back}D`);
		}
	}
}
