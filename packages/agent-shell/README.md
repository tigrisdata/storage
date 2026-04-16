# @tigrisdata/agent-shell

A virtual bash environment for AI agents, backed by [Tigris](https://www.tigrisdata.com/) object storage.

Built on top of [just-bash](https://github.com/vercel-labs/just-bash), this package gives AI agents a full bash shell where the filesystem is a Tigris bucket. Agents can run standard Unix commands (`cat`, `grep`, `sed`, `jq`, `awk`, etc.), and all file operations are backed by Tigris.

## Quick Start

```bash
npm install @tigrisdata/agent-shell
```

```typescript
import { TigrisShell } from "@tigrisdata/agent-shell";

const shell = new TigrisShell({
  bucket: process.env.TIGRIS_STORAGE_BUCKET,
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
});

await shell.exec('echo "Hello world" > greeting.txt');
await shell.exec("cat greeting.txt"); // stdout: "Hello world\n"
await shell.exec("mkdir -p reports/2026");
await shell.exec('echo "Q1 done" > reports/2026/q1.txt');
await shell.exec("ls reports/2026"); // stdout: "q1.txt\n"
await shell.exec("cat greeting.txt | tr a-z A-Z"); // stdout: "HELLO WORLD\n"

// Persist to Tigris when you're ready
await shell.flush();
```

## Authentication

All three fields are required — bucket, access key, and secret key:

```typescript
const shell = new TigrisShell({
  bucket: process.env.TIGRIS_STORAGE_BUCKET,
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
});
```

## How It Works

The shell uses an in-memory write-back cache:

- **Writes stay local** until you call `flush()`
- **Reads check cache first**, then fetch from Tigris on cache miss
- **Deletes are tracked** locally and applied on flush

This means:

- Fast execution — most operations never hit the network
- Atomic commits — if your agent fails midway, nothing is written to the bucket
- You control when data is persisted

```typescript
const shell = new TigrisShell({
  bucket: process.env.TIGRIS_STORAGE_BUCKET,
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
});

try {
  await shell.exec('echo "processing..." > status.txt');
  await shell.exec("echo '{\"score\": 0.95}' > results.json");
  await shell.exec("cat results.json | jq .score"); // "0.95\n"

  // Only persist on success
  await shell.flush();
} catch (e) {
  // Nothing was written to Tigris
}
```

## Shell Options

The second argument configures shell behavior:

```typescript
const shell = new TigrisShell(
  {
    bucket: process.env.TIGRIS_STORAGE_BUCKET,
    accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
  },
  {
    cwd: "/workspace", // Starting directory (default: /workspace)
    env: { DEBUG: "true" }, // Initial environment variables
  },
);
```

## Built-in Tigris Commands

In addition to all standard bash commands from [just-bash](https://github.com/vercel-labs/just-bash), the shell includes Tigris-specific commands:

### presign

Generate a presigned URL for an object.

```bash
presign /path/to/file.txt                    # GET URL, 1 hour expiry
presign /path/to/file.txt --expires 7200     # GET URL, 2 hour expiry
presign /path/to/file.txt --put              # PUT URL for uploads
```

### snapshot

Create or list point-in-time bucket snapshots.

```bash
snapshot my-bucket                           # Create a snapshot
snapshot my-bucket --name "checkpoint-1"     # Create a named snapshot
snapshot my-bucket --list                    # List all snapshots
```

### fork

Create a fork of a bucket, optionally from a snapshot.

```bash
fork source-bucket my-fork                   # Fork a bucket
fork source-bucket my-fork --snapshot 1713200000   # Fork from a specific snapshot
```

### forks

List forks of a bucket.

```bash
forks my-bucket
```

### bundle

Batch-download multiple objects as a tar archive.

```bash
bundle file1.txt file2.txt                   # Download as tar
bundle file1.txt file2.txt --gzip           # Download as gzip tar
bundle file1.txt file2.txt --zstd           # Download as zstd tar
```

## Advanced: Compose with just-bash

For more control, import `TigrisAdapter` and the commands separately to build your own shell configuration. This is useful when you need multiple buckets mounted at different paths.

```typescript
import { Bash, MountableFs, InMemoryFs } from "just-bash";
import { TigrisAdapter } from "@tigrisdata/agent-shell/fs";
import { createTigrisCommands } from "@tigrisdata/agent-shell/commands";

const auth = {
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
};

const workspaceConfig = { bucket: "agent-workspace", ...auth };
const datasetsConfig = { bucket: "shared-datasets", ...auth };

// Build your own filesystem layout
const fs = new MountableFs({ base: new InMemoryFs() });
fs.mount("/workspace", new TigrisAdapter(workspaceConfig));
fs.mount("/datasets", new TigrisAdapter(datasetsConfig));

const bash = new Bash({
  fs,
  cwd: "/workspace",
  customCommands: [
    ...createTigrisCommands(workspaceConfig),
    // your own custom commands
  ],
});

await bash.exec("cat /datasets/training/labels.csv | head -10");
await bash.exec("cp /datasets/training/labels.csv ./local-copy.csv");
await bash.exec('echo "processed" > results.txt');

// Flush a specific mount
const workspaceFs = fs.getMount("/workspace") as TigrisAdapter;
await workspaceFs.flush();
```

## API Reference

### `@tigrisdata/agent-shell`

| Export         | Description                                                        |
| -------------- | ------------------------------------------------------------------ |
| `TigrisShell`  | Main class — shell backed by a Tigris bucket                       |
| `TigrisConfig` | Config type: `{ bucket, accessKeyId, secretAccessKey, endpoint? }` |
| `ShellOptions` | Shell options type: `{ cwd?, env? }`                               |

#### `TigrisShell`

```typescript
new TigrisShell(config: TigrisConfig, shellOptions?: ShellOptions)
```

| Method          | Returns                   | Description                     |
| --------------- | ------------------------- | ------------------------------- |
| `exec(command)` | `Promise<BashExecResult>` | Execute a bash command          |
| `flush()`       | `Promise<void>`           | Persist cached writes to Tigris |
| `engine`        | `Bash`                    | Underlying just-bash instance   |
| `fs`            | `TigrisAdapter`           | Underlying filesystem instance  |

### `@tigrisdata/agent-shell/fs`

| Export          | Description                                               |
| --------------- | --------------------------------------------------------- |
| `TigrisAdapter` | Filesystem adapter implementing just-bash's `IFileSystem` |
| `TigrisConfig`  | Same config type as main export                           |

### `@tigrisdata/agent-shell/commands`

| Export                           | Description                  |
| -------------------------------- | ---------------------------- |
| `createTigrisCommands(config)`   | Create all Tigris commands   |
| `createPresignCommand(config)`   | Create presign command only  |
| `createSnapshotCommand(config)`  | Create snapshot command only |
| `createForkCommand(config)`      | Create fork command only     |
| `createForksListCommand(config)` | Create forks command only    |
| `createBundleCommand(config)`    | Create bundle command only   |

## Examples

All examples require `TIGRIS_STORAGE_ACCESS_KEY_ID`, `TIGRIS_STORAGE_SECRET_ACCESS_KEY`, and `TIGRIS_STORAGE_BUCKET` env vars. Run with `npx tsx examples/<name>.ts`.

| Example                                                 | Description                                              |
| ------------------------------------------------------- | -------------------------------------------------------- |
| [`basic.ts`](examples/basic.ts)                         | Write files, pipe/process, flush to Tigris               |
| [`presign.ts`](examples/presign.ts)                     | Generate shareable and upload URLs for objects           |
| [`snapshot-and-fork.ts`](examples/snapshot-and-fork.ts) | Take snapshots and create forks — Tigris-unique features |
| [`multi-bucket.ts`](examples/multi-bucket.ts)           | Mount two buckets, copy across them (advanced)           |

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint and format
npm run lint
npm run lint:fix

# Run tests
npm test

# Build
npm run build
```

## License

MIT
