import type { Terminal } from "@xterm/xterm";
import type { Bash, BashExecResult } from "just-bash";
import type { TigrisConfig } from "../../src/index.js";
import { TigrisShell } from "../../src/index.js";
import { getCredentials, setCredentials } from "./credentials.js";

const PROMPT = "\x1b[32m$ \x1b[0m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export class ShellLoop {
	private currentLine = "";
	private cursorPos = 0;
	private history: string[] = [];
	private historyIndex = -1;
	private shell: TigrisShell | null = null;
	private bash: Bash;
	private terminal: Terminal;
	private busy = false;

	constructor(terminal: Terminal, bash: Bash) {
		this.terminal = terminal;
		this.bash = bash;
	}

	start() {
		this.prompt();
		this.terminal.onData((data) => this.handleInput(data));
	}

	private prompt() {
		this.terminal.write(`\r\n${PROMPT}`);
		this.currentLine = "";
		this.cursorPos = 0;
	}

	private async handleInput(data: string) {
		// Block input while a command is executing
		if (this.busy) return;

		if (data === "\r") {
			this.terminal.write("\r\n");
			const line = this.currentLine.trim();

			if (line) {
				this.history.push(line);
				this.historyIndex = this.history.length;
				this.busy = true;
				await this.execute(line);
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
			this.terminal.write("^C");
			this.prompt();
			return;
		}

		if (data === "\x0c") {
			this.terminal.clear();
			this.terminal.write(PROMPT + this.currentLine);
			return;
		}

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
		this.terminal.write(`\r\x1b[K${PROMPT}${this.currentLine}`);
		const back = this.currentLine.length - this.cursorPos;
		if (back > 0) {
			this.terminal.write(`\x1b[${back}D`);
		}
	}

	private async execute(command: string) {
		if (command === "clear") {
			this.terminal.clear();
			return;
		}

		const firstToken = command.split(/\s+/)[0];

		if (firstToken === "configure") {
			this.handleConfigure(command);
			return;
		}

		if (command === "flush") {
			await this.handleFlush();
			return;
		}

		// Use TigrisShell if configured, otherwise plain bash
		const engine = this.shell ? this.shell : { exec: (cmd: string) => this.bash.exec(cmd) };

		try {
			const result: BashExecResult = await engine.exec(command);

			if (result.stdout) {
				this.writeOutput(result.stdout);
			}
			if (result.stderr) {
				this.writeOutput(`${RED}${result.stderr}${RESET}`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.writeOutput(`${RED}Error: ${message}${RESET}\r\n`);
		}
	}

	private handleConfigure(command: string) {
		const args = command.split(/\s+/);
		let bucket: string | undefined;
		let accessKeyId: string | undefined;
		let secretAccessKey: string | undefined;

		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--bucket" && args[i + 1]) {
				bucket = args[i + 1];
				i++;
			} else if (args[i] === "--key" && args[i + 1]) {
				accessKeyId = args[i + 1];
				i++;
			} else if (args[i] === "--secret" && args[i + 1]) {
				secretAccessKey = args[i + 1];
				i++;
			}
		}

		if (!bucket || !accessKeyId || !secretAccessKey) {
			const creds = getCredentials();
			if (creds) {
				this.writeOutput(`${GREEN}Connected to bucket: ${creds.bucket}${RESET}\r\n`);
				this.writeOutput(`${DIM}Access key: ${creds.accessKeyId.slice(0, 8)}...${RESET}\r\n`);
			} else {
				this.writeOutput(
					"Usage: configure --bucket <name> --key <accessKeyId> --secret <secretAccessKey>\r\n",
				);
			}
			return;
		}

		const config: TigrisConfig = { bucket, accessKeyId, secretAccessKey };
		setCredentials(config);

		// Create TigrisShell with BUCKET env var for use in snapshot/fork commands
		this.shell = new TigrisShell(config, {
			env: { BUCKET: bucket },
		});

		this.writeOutput(`${GREEN}Connected to bucket: ${bucket}${RESET}\r\n`);
		this.writeOutput("\r\n");
		this.writeOutput(
			`${YELLOW}WARNING: Credentials are stored in browser memory only.${RESET}\r\n`,
		);
		this.writeOutput(`${YELLOW}They will be lost when you close or refresh this tab.${RESET}\r\n`);
		this.writeOutput("\r\n");
		this.writeOutput(`${DIM}Commands available: flush, presign, snapshot, fork${RESET}\r\n`);
		this.writeOutput(`${DIM}Use $BUCKET in commands, e.g.: snapshot $BUCKET --list${RESET}\r\n`);
	}

	private async handleFlush() {
		if (!this.shell) {
			this.writeOutput(`${RED}Not configured. Run 'configure' first.${RESET}\r\n`);
			return;
		}

		try {
			await this.shell.flush();
			const creds = getCredentials();
			this.writeOutput(`${GREEN}Flushed to bucket: ${creds?.bucket}${RESET}\r\n`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.writeOutput(`${RED}Flush failed: ${message}${RESET}\r\n`);
		}
	}

	private writeOutput(text: string) {
		const lines = text.replace(/\r?\n/g, "\r\n");
		this.terminal.write(lines);
	}
}
