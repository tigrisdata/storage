import { Bash, InMemoryFs, MountableFs } from "just-bash";
import { createTigrisCommands } from "../src/commands/index.js";
import { TigrisAdapter } from "../src/fs/tigris-adapter.js";

async function main() {
	const bucket1 = process.env.TIGRIS_STORAGE_BUCKET;
	const bucket2 = process.env.TIGRIS_STORAGE_BUCKET_2;
	if (!bucket1 || !bucket2) {
		console.error("Set TIGRIS_STORAGE_BUCKET and TIGRIS_STORAGE_BUCKET_2 env vars");
		process.exit(1);
	}

	// Mount two different buckets at different paths
	const workspaceFs = new TigrisAdapter({ bucket: bucket1 });
	const datasetsFs = new TigrisAdapter({ bucket: bucket2 });

	const fs = new MountableFs({ base: new InMemoryFs() });
	fs.mount("/workspace", workspaceFs);
	fs.mount("/datasets", datasetsFs);

	const bash = new Bash({
		fs,
		cwd: "/workspace",
		customCommands: createTigrisCommands(workspaceFs.config),
	});

	// Write to each bucket
	console.log("--- Writing to /workspace (bucket 1) ---");
	await bash.exec('echo "workspace file" > output.txt');

	console.log("--- Writing to /datasets (bucket 2) ---");
	await bash.exec('echo "col1,col2\na,b\nc,d" > /datasets/data.csv');

	// Read across buckets
	console.log("\n--- Reading across buckets ---");
	const csv = await bash.exec("cat /datasets/data.csv");
	console.log("/datasets/data.csv:", csv.stdout.trim());

	// Copy from one bucket to another
	console.log("\n--- Copying across buckets ---");
	await bash.exec("cp /datasets/data.csv /workspace/local-data.csv");
	const copied = await bash.exec("cat /workspace/local-data.csv");
	console.log("/workspace/local-data.csv:", copied.stdout.trim());

	// Flush each bucket independently
	console.log("\n--- Flushing both buckets ---");
	await workspaceFs.flush();
	console.log("Bucket 1 flushed.");
	await datasetsFs.flush();
	console.log("Bucket 2 flushed.");
}

main().catch(console.error);
