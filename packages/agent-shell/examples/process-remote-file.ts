import { TigrisShell } from "../src/index.js";

async function main() {
	const shell = new TigrisShell();

	// Read a file that already exists in the bucket
	// TigrisAdapter fetches it from Tigris on cache miss
	console.log("--- Loading file from Tigris ---");
	const result = await shell.exec("cat data.csv");
	if (result.exitCode !== 0) {
		console.error("File not found. Create and upload data.csv to your bucket first:");
		console.error("  printf 'name,score\\nalice,95\\nbob,87\\ncharlie,92\\n' > /tmp/data.csv");
		console.error("  t3 cp /tmp/data.csv t3://$TIGRIS_STORAGE_BUCKET/data.csv");
		process.exit(1);
	}
	console.log("Raw data:\n", result.stdout);

	// Process it with bash commands
	console.log("--- Processing ---");
	const sorted = await shell.exec("cat data.csv | tail -n +2 | sort -t, -k2 -rn");
	console.log("Sorted by score (desc):\n", sorted.stdout);

	const count = await shell.exec("cat data.csv | tail -n +2 | wc -l");
	console.log("Row count:", count.stdout.trim());

	const topScorer = await shell.exec(
		"cat data.csv | tail -n +2 | sort -t, -k2 -rn | head -1 | cut -d, -f1",
	);
	console.log("Top scorer:", topScorer.stdout.trim());

	// Write processed results back
	console.log("\n--- Writing results ---");
	await shell.exec("cat data.csv | tail -n +2 | sort -t, -k2 -rn > sorted.csv");
	await shell.exec(`echo "total_rows: ${count.stdout.trim()}" > summary.txt`);
	await shell.exec(`echo "top_scorer: ${topScorer.stdout.trim()}" >> summary.txt`);

	const summary = await shell.exec("cat summary.txt");
	console.log("Summary:\n", summary.stdout);

	// Flush processed results back to Tigris
	console.log("--- Flushing results to Tigris ---");
	await shell.flush();
	console.log("Done! sorted.csv and summary.txt persisted to bucket.");
}

main().catch(console.error);
