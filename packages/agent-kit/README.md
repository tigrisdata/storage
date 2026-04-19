# @tigrisdata/agent-kit

Storage workflows for AI agents on [Tigris](https://www.tigrisdata.com). Gives agents isolated storage environments, persistent checkpoints, scoped credentials, and event-driven coordination — all backed by Tigris object storage.

Builds on `@tigrisdata/storage` and `@tigrisdata/iam` to compose higher-level operations from low-level storage and IAM primitives.

## Install

```bash
npm install @tigrisdata/agent-kit
```

## Configuration

All functions accept an optional `config` parameter. When omitted, the underlying SDKs read from environment variables:

```bash
TIGRIS_STORAGE_ACCESS_KEY_ID=tid_...
TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_...
```

Or pass config explicitly:

```typescript
const config = {
  accessKeyId: 'tid_...',
  secretAccessKey: 'tsec_...',
};
```

All functions return a `TigrisResponse<T>` — a discriminated union of `{ data: T }` or `{ error: Error }`.

## Forks

Give each agent its own isolated copy of a shared dataset using copy-on-write storage forks. Each fork is an independent bucket — agents can read and write freely without affecting the original data or each other. Forks are instant at any size with zero data duplication.

```typescript
import { createForks, teardownForks } from '@tigrisdata/agent-kit';

// 'my-dataset' must have snapshots enabled
const { data: forkSet, error } = await createForks('my-dataset', 3, {
  prefix: 'experiment-run-42',    // optional, controls fork bucket names
  credentials: { role: 'Editor' }, // optional, creates scoped keys per fork
});

// Each fork is its own bucket with isolated storage
for (const fork of forkSet.forks) {
  console.log(fork.bucket);
  // fork.credentials?.accessKeyId
  // fork.credentials?.secretAccessKey
}

// Clean up — revokes credentials, deletes all fork buckets
await teardownForks(forkSet);
```

## Workspaces

Provision dedicated storage for a single agent — a new bucket with optional TTL for auto-cleanup and scoped credentials for least-privilege access.

```typescript
import { createWorkspace, teardownWorkspace } from '@tigrisdata/agent-kit';

const { data: workspace } = await createWorkspace('agent-workspace-abc', {
  ttl: { days: 1 },               // auto-expire objects after 1 day
  enableSnapshots: true,           // allow checkpointing later
  credentials: { role: 'Editor' }, // optional scoped access key
});

// Use workspace.bucket and workspace.credentials
// to read/write with @tigrisdata/storage

// Clean up — revokes credentials, deletes bucket
await teardownWorkspace(workspace);
```

## Checkpoints

Capture the state of a bucket at a point in time and restore from it later. Restore creates a copy-on-write fork from that snapshot, leaving the original untouched.

```typescript
import { checkpoint, restore, listCheckpoints } from '@tigrisdata/agent-kit';

// Take a checkpoint
const { data: ckpt } = await checkpoint('training-data', {
  name: 'epoch-50',  // optional label
});
// ckpt.snapshotId — use this to restore later

// List all checkpoints
const { data: list } = await listCheckpoints('training-data');
for (const c of list.checkpoints) {
  console.log(c.snapshotId, c.name, c.createdAt);
}

// Restore into a new fork from that checkpoint
const { data: restored } = await restore(
  'training-data',
  ckpt.snapshotId,
  { forkName: 'training-data-retry' },
);
// restored.bucket — an independent copy-on-write clone at that point in time
```

## Coordination

Wire up event-driven multi-agent pipelines using bucket notifications. When objects are created, deleted, or modified, Tigris fires a webhook — no polling required.

```typescript
import { setupCoordination, teardownCoordination } from '@tigrisdata/agent-kit';

// Configure notifications on a bucket
await setupCoordination('pipeline-bucket', {
  webhookUrl: 'https://my-service.com/webhook',
  filter: 'WHERE `key` REGEXP "^results/"',
  auth: { token: 'my-webhook-secret' },
});

// Disable notifications
await teardownCoordination('pipeline-bucket');
```

## API Reference

### Forks

| Function | Description |
|---|---|
| `createForks(baseBucket, count, options?)` | Snapshot + fork N times + scoped credentials |
| `teardownForks(forkSet, options?)` | Revoke credentials + delete forks |

### Workspaces

| Function | Description |
|---|---|
| `createWorkspace(name, options?)` | Create bucket + TTL + scoped credentials |
| `teardownWorkspace(workspace, options?)` | Revoke credentials + delete bucket |

### Checkpoints

| Function | Description |
|---|---|
| `checkpoint(bucket, options?)` | Snapshot a bucket, returns snapshot ID |
| `restore(bucket, snapshotId, options?)` | Fork from a snapshot |
| `listCheckpoints(bucket, options?)` | List all snapshots for a bucket |

### Coordination

| Function | Description |
|---|---|
| `setupCoordination(bucket, options)` | Configure bucket notifications |
| `teardownCoordination(bucket, options?)` | Clear bucket notifications |

## License

MIT
