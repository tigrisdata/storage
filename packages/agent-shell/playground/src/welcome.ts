import type { Terminal } from "@xterm/xterm";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

export function showWelcome(terminal: Terminal) {
	terminal.writeln(`${GREEN}Tigris Agent Shell${RESET}`);
	terminal.writeln(`${DIM}Persistent sandboxed storage for AI agents${RESET}`);
	terminal.writeln("");
	terminal.writeln(
		`${YELLOW}WARNING: This is a browser-based shell. Credentials you enter${RESET}`,
	);
	terminal.writeln(
		`${YELLOW}are stored in browser memory only and never sent to any server${RESET}`,
	);
	terminal.writeln(
		`${YELLOW}other than Tigris. Do not use on shared or untrusted devices.${RESET}`,
	);
	terminal.writeln("");
	terminal.writeln(`${DIM}Connect to Tigris:${RESET}`);
	terminal.writeln(`${DIM}  configure --key <id> --secret <key>  Set credentials${RESET}`);
	terminal.writeln("");
	terminal.writeln(`${DIM}Type 'help' for all commands.${RESET}`);
}
