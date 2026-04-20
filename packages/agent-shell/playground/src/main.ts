import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { ShellLoop } from "./shell-loop.js";
import { showWelcome } from "./welcome.js";

const terminal = new Terminal({
	theme: {
		background: "#0e1920",
		foreground: "#c5d1d8",
		cursor: "#62feb5",
		cursorAccent: "#0e1920",
		selectionBackground: "#1e3a47",
		black: "#0e1920",
		green: "#62feb5",
		yellow: "#f5c842",
		red: "#ff6b6b",
		blue: "#5ba3d9",
		cyan: "#62feb5",
		white: "#c5d1d8",
		brightBlack: "#6b8a99",
	},
	fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
	fontSize: 14,
	cursorBlink: true,
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const container = document.getElementById("terminal-container");
if (!container) throw new Error("terminal-container not found");

terminal.open(container);
fitAddon.fit();

window.addEventListener("resize", () => fitAddon.fit());

showWelcome(terminal);

const loop = new ShellLoop(terminal);
loop.start();
