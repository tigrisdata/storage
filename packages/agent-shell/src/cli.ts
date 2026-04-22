#!/usr/bin/env node

import * as readline from "node:readline";
import { deviceLogin } from "./cli/auth.js";
import type { ReplIO } from "./repl/index.js";
import { ReplSession } from "./repl/index.js";

function parseArgs(args: string[]): {
	key?: string;
	secret?: string;
	bucket?: string;
	endpoint?: string;
} {
	const result: Record<string, string> = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];
		if (next === undefined) break;
		if (arg === "--key") {
			result.key = next;
			i++;
		} else if (arg === "--secret") {
			result.secret = next;
			i++;
		} else if (arg === "--bucket") {
			result.bucket = next;
			i++;
		} else if (arg === "--endpoint") {
			result.endpoint = next;
			i++;
		}
	}
	return result;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const session = new ReplSession({ loginFn: deviceLogin });

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: "$ ",
	});

	const io: ReplIO = {
		write(text: string) {
			process.stdout.write(text);
		},
		prompt(message: string): Promise<string> {
			return new Promise((resolve) => {
				rl.question(message, resolve);
			});
		},
	};

	// Auto-configure if credentials provided via args
	if (args.key && args.secret) {
		try {
			await session.configure(
				{
					accessKeyId: args.key,
					secretAccessKey: args.secret,
					...(args.bucket !== undefined && { bucket: args.bucket }),
					...(args.endpoint !== undefined && { endpoint: args.endpoint }),
				},
				io,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			io.write(`configure: ${message}\n`);
			io.write("Use 'configure' to try again.\n");
		}
	}

	io.write("\nTigris Agent Shell\n");
	io.write("Type 'help' for available commands.\n\n");

	// Process lines sequentially using async iterator
	rl.prompt();

	for await (const line of rl) {
		const trimmed = line.trim();

		if (trimmed === "exit" || trimmed === "quit") {
			break;
		}

		if (trimmed === "clear") {
			process.stdout.write("\x1bc");
		} else if (trimmed) {
			await session.handle(trimmed, io);
		}

		rl.prompt();
	}

	rl.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
