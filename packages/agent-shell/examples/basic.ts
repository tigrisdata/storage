import { TigrisShell } from "../src/index.js";

const bucket = process.env.TIGRIS_STORAGE_BUCKET;
const accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;
if (!bucket || !accessKeyId || !secretAccessKey) {
	console.error(
		"Set TIGRIS_STORAGE_BUCKET, TIGRIS_STORAGE_ACCESS_KEY_ID, TIGRIS_STORAGE_SECRET_ACCESS_KEY",
	);
	process.exit(1);
}

const shell = new TigrisShell({ bucket, accessKeyId, secretAccessKey });

// Write files
await shell.exec('echo "Hello from agent-shell" > greeting.txt');
await shell.exec("mkdir -p reports");
await shell.exec('echo "Q1: revenue up 15%" > reports/q1.txt');

// Read and process
const upper = await shell.exec("cat greeting.txt | tr a-z A-Z");
console.log(upper.stdout.trim()); // HELLO FROM AGENT-SHELL

const wc = await shell.exec("cat reports/q1.txt | wc -w");
console.log("words:", wc.stdout.trim()); // words: 4

// Persist to Tigris
await shell.flush();
console.log("Done — files written to bucket:", bucket);
