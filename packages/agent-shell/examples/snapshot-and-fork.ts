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

// Write some data and flush
await shell.exec('echo "production data" > data.txt');
await shell.flush();

// Take a snapshot before making changes
const snap = await shell.exec(`snapshot ${bucket} --name before-experiment`);
console.log("Snapshot:", snap.stdout.trim());

// Create a fork to experiment safely
const forkName = `${bucket}-experiment`;
const fork = await shell.exec(`fork ${bucket} ${forkName}`);
console.log("Fork created:", fork.stdout.trim());

// List snapshots
const snapshots = await shell.exec(`snapshot ${bucket} --list`);
console.log(`Snapshots:\n${snapshots.stdout}`);
