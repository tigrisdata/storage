import { TigrisShell } from "../src/index.js";

async function main() {
	const shell = new TigrisShell();

	// Write some files
	console.log("--- Writing files ---");
	await shell.exec('echo "Hello from agent-shell" > greeting.txt');
	await shell.exec("mkdir -p reports/2026");
	await shell.exec('echo "Q1 results: all good" > reports/2026/q1.txt');
	await shell.exec('echo "Q2 results: even better" > reports/2026/q2.txt');

	// Read them back
	console.log("--- Reading files ---");
	const cat = await shell.exec("cat greeting.txt");
	console.log("greeting.txt:", cat.stdout.trim());

	// List directory
	console.log("\n--- Listing directory ---");
	const ls = await shell.exec("ls reports/2026");
	console.log("reports/2026:", ls.stdout.trim());

	// Pipes and text processing
	console.log("\n--- Pipes ---");
	const upper = await shell.exec("cat greeting.txt | tr a-z A-Z");
	console.log("uppercase:", upper.stdout.trim());

	const wc = await shell.exec("cat reports/2026/q1.txt | wc -w");
	console.log("word count:", wc.stdout.trim());

	// Flush to Tigris
	console.log("\n--- Flushing to Tigris ---");
	await shell.flush();
	console.log("Done! Files persisted to Tigris.");
}

main().catch(console.error);
