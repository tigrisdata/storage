import { TigrisShell } from "../src/index.js";

const bucket1 = process.env.TIGRIS_STORAGE_BUCKET;
const bucket2 = process.env.TIGRIS_STORAGE_BUCKET_2;
const accessKeyId = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;
if (!bucket1 || !bucket2 || !accessKeyId || !secretAccessKey) {
	console.error(
		"Set TIGRIS_STORAGE_BUCKET, TIGRIS_STORAGE_BUCKET_2, TIGRIS_STORAGE_ACCESS_KEY_ID, TIGRIS_STORAGE_SECRET_ACCESS_KEY",
	);
	process.exit(1);
}

// Create shell and mount two buckets
const shell = new TigrisShell(
	{ accessKeyId, secretAccessKey, bucket: bucket1 },
	{ cwd: "/workspace" },
);
shell.mount(bucket2, "/datasets");

// Copy across buckets and process
await shell.exec("cp /datasets/data.csv ./local.csv");
await shell.exec("cat local.csv | sort -t, -k2 -rn > sorted.csv");

// Flush all mounts
await shell.flush();
console.log("Both buckets flushed.");
