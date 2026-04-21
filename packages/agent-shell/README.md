# @tigrisdata/agent-shell

Persistent sandboxed storage for AI agents — a bash filesystem backed by [Tigris](https://www.tigrisdata.com/) object storage.

AI agents produce artifacts — reports, data, configs, logs. These need to go somewhere durable, shareable, and globally accessible. `@tigrisdata/agent-shell` gives agents a familiar bash interface (`cat`, `grep`, `sed`, `jq`, `awk`, pipes, redirects) where every file operation is backed by a Tigris bucket.

**What makes it a storage sandbox:**

- **Isolated** — writes stay in-memory until you explicitly flush. No partial state leaks to storage.
- **Durable** — flush persists files to Tigris, globally distributed.
- **Checkpointable** — take snapshots of your storage at any point. Roll back if needed.
- **Forkable** — create copy-on-write forks of a bucket for safe experimentation.
- **Shareable** — generate presigned URLs for any stored file.

Built on [just-bash](https://github.com/vercel-labs/just-bash) for the shell engine and [@tigrisdata/storage](https://www.npmjs.com/package/@tigrisdata/storage) for the storage layer.

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

Two auth modes are supported. At least one is required:

```typescript
// Access key auth
const shell = new TigrisShell({
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
  bucket: process.env.TIGRIS_STORAGE_BUCKET, // optional — auto-mounts at /workspace
});

// Session token auth (from OAuth login)
const shell = new TigrisShell({
  sessionToken: "...",
  organizationId: "...",
});
```

## Storage Sandbox Model

The shell uses an in-memory write-back cache that acts as a storage sandbox:

```
Agent writes file  →  cached locally (isolated)
Agent reads file   →  cache hit or fetch from Tigris
Agent calls flush  →  all changes persisted atomically
```

This gives you:

- **Isolation** — nothing touches storage until you say so
- **Atomic commits** — if your agent fails midway, no partial state is written
- **Fast execution** — most operations never hit the network

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
  // Nothing was written to Tigris — storage is clean
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

Generate presigned URLs for sharing or uploading.

```bash
presign /path/to/file.txt                    # GET URL, 1 hour expiry
presign /path/to/file.txt --expires 7200     # GET URL, 2 hour expiry
presign /path/to/file.txt --put              # PUT URL for uploads
```

### snapshot

Checkpoint your dataset. Create or list point-in-time bucket snapshots.

```bash
snapshot my-bucket                           # Create a snapshot
snapshot my-bucket --name "checkpoint-1"     # Create a named snapshot
snapshot my-bucket --list                    # List all snapshots
```

### fork

Branch your dataset. Create a copy-on-write fork for safe experimentation.

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

Batch-download multiple files as a tar archive.

```bash
bundle file1.txt file2.txt                   # Download as tar
bundle file1.txt file2.txt --gzip           # Download as gzip tar
bundle file1.txt file2.txt --zstd           # Download as zstd tar
```

## Multi-Bucket

Mount multiple buckets at different paths:

```typescript
import { TigrisShell } from "@tigrisdata/agent-shell";

const shell = new TigrisShell({
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
  bucket: "agent-workspace", // auto-mounted at /workspace
});

shell.mount("shared-datasets", "/datasets");

await shell.exec("cat /datasets/training/labels.csv | head -10");
await shell.exec("cp /datasets/training/labels.csv ./local-copy.csv");
await shell.exec('echo "processed" > results.txt');

// Flush all mounts, or a specific one
await shell.flush(); // all
await shell.flush("/datasets"); // just /datasets

// List and unmount
shell.listMounts(); // [{ bucket: "agent-workspace", mountPoint: "/workspace" }, ...]
shell.unmount("/datasets");
```

### Advanced: Compose with just-bash

For full control over the filesystem layout, install [just-bash](https://github.com/vercel-labs/just-bash) alongside agent-shell:

```bash
npm install @tigrisdata/agent-shell just-bash
```

```typescript
import { Bash, MountableFs, InMemoryFs } from "just-bash";
import { TigrisAdapter } from "@tigrisdata/agent-shell/fs";
import { createTigrisCommands } from "@tigrisdata/agent-shell/commands";

const auth = {
  accessKeyId: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
  secretAccessKey: process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
};

const fs = new MountableFs({ base: new InMemoryFs() });
fs.mount("/workspace", new TigrisAdapter(auth, "agent-workspace"));
fs.mount("/datasets", new TigrisAdapter(auth, "shared-datasets"));

const bash = new Bash({
  fs,
  cwd: "/workspace",
  customCommands: [
    ...createTigrisCommands({ ...auth, bucket: "agent-workspace" }),
  ],
});

await bash.exec("cp /datasets/data.csv ./local.csv");
```

## API Reference

### `@tigrisdata/agent-shell`

| Export         | Description                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `TigrisShell`  | Main class — sandboxed storage shell backed by Tigris                                                 |
| `TigrisConfig` | Config type: `{ accessKeyId?, secretAccessKey?, sessionToken?, organizationId?, bucket?, endpoint? }` |
| `ShellOptions` | Shell options type: `{ cwd?, env? }`                                                                  |

#### `TigrisShell`

```typescript
new TigrisShell(config: TigrisConfig, shellOptions?: ShellOptions)
```

| Method                      | Returns                         | Description                        |
| --------------------------- | ------------------------------- | ---------------------------------- |
| `exec(command)`             | `Promise<BashExecResult>`       | Execute a bash command             |
| `mount(bucket, mountPoint)` | `void`                          | Mount a bucket at a path           |
| `unmount(mountPoint)`       | `void`                          | Unmount a path                     |
| `listMounts()`              | `Array<{ bucket, mountPoint }>` | List current mounts                |
| `flush(mountPoint?)`        | `Promise<void>`                 | Flush all mounts or a specific one |
| `engine`                    | `Bash`                          | Underlying just-bash instance      |

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

| Example                                                 | Description                                            |
| ------------------------------------------------------- | ------------------------------------------------------ |
| [`basic.ts`](examples/basic.ts)                         | Write files, pipe/process, flush to Tigris             |
| [`presign.ts`](examples/presign.ts)                     | Generate shareable and upload URLs for stored files    |
| [`snapshot-and-fork.ts`](examples/snapshot-and-fork.ts) | Checkpoint and branch storage — Tigris-unique features |
| [`multi-bucket.ts`](examples/multi-bucket.ts)           | Mount multiple buckets, copy across them (advanced)    |

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
