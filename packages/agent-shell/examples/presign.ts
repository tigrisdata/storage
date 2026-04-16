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

// Agent produces a report
await shell.exec('echo \'{"status": "complete", "score": 0.95}\' > report.json');
await shell.flush();

// Generate a shareable link (1 hour expiry)
const result = await shell.exec("presign report.json");
console.log("Share this URL:", result.stdout.trim());

// Generate an upload URL for external systems
const upload = await shell.exec("presign report.json --put --expires 3600");
console.log("Upload URL:", upload.stdout.trim());
