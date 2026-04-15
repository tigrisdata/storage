import { TigrisShell } from "../src/index.js";

async function main() {
	const bucket = process.env.TIGRIS_STORAGE_BUCKET;

	if (!bucket) {
		console.error("Set TIGRIS_STORAGE_BUCKET env var");
		process.exit(1);
	}

	const shell = new TigrisShell({ bucket });

	// Write a file and flush so it exists in Tigris
	console.log("--- Setup: writing and flushing a file ---");
	await shell.exec('echo "report data" > report.txt');
	await shell.flush();

	// Generate a presigned GET URL
	console.log("\n--- presign (GET) ---");
	const presignGet = await shell.exec("presign report.txt");
	console.log("GET URL:", presignGet.stdout.trim());

	// Generate a presigned PUT URL with custom expiry
	console.log("\n--- presign (PUT, 2h expiry) ---");
	const presignPut = await shell.exec("presign report.txt --put --expires 7200");
	console.log("PUT URL:", presignPut.stdout.trim());

	// Take a bucket snapshot
	console.log("\n--- snapshot (create) ---");
	const snap = await shell.exec(`snapshot ${bucket}`);
	if (snap.exitCode === 0) {
		console.log("Snapshot version:", snap.stdout.trim());
	} else {
		console.log("Error:", snap.stderr.trim());
	}

	// List snapshots
	console.log("\n--- snapshot (list) ---");
	const snapList = await shell.exec(`snapshot ${bucket} --list`);
	if (snapList.exitCode === 0) {
		console.log("Snapshots:\n", snapList.stdout.trim());
	} else {
		console.log("Error:", snapList.stderr.trim());
	}

	// Bundle multiple files
	console.log("\n--- bundle ---");
	await shell.exec('echo "file A" > a.txt');
	await shell.exec('echo "file B" > b.txt');
	await shell.flush();
	const bundleResult = await shell.exec("bundle a.txt b.txt --gzip");
	if (bundleResult.exitCode === 0) {
		console.log("Bundle info:", bundleResult.stdout.trim());
	} else {
		console.log("Error:", bundleResult.stderr.trim());
	}
}

main().catch(console.error);
