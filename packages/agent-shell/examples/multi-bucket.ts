import { Bash, InMemoryFs, MountableFs } from "just-bash";
import { createTigrisCommands } from "../src/commands/index.js";
import { TigrisAdapter } from "../src/fs/tigris-adapter.js";

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

// Mount two buckets at different paths
const workspaceFs = new TigrisAdapter({ bucket: bucket1, accessKeyId, secretAccessKey });
const datasetsFs = new TigrisAdapter({ bucket: bucket2, accessKeyId, secretAccessKey });

const fs = new MountableFs({ base: new InMemoryFs() });
fs.mount("/workspace", workspaceFs);
fs.mount("/datasets", datasetsFs);

const bash = new Bash({
	fs,
	cwd: "/workspace",
	customCommands: createTigrisCommands(workspaceFs.config),
});

// Copy across buckets and process
await bash.exec("cp /datasets/data.csv ./local.csv");
await bash.exec("cat local.csv | sort -t, -k2 -rn > sorted.csv");

// Flush each independently
await workspaceFs.flush();
await datasetsFs.flush();
console.log("Both buckets flushed.");
