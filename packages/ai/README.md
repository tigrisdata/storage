# @tigrisdata/ai

Composed workflows for AI agents on [Tigris](https://www.tigrisdata.com) object storage. Builds on `@tigrisdata/storage` and `@tigrisdata/iam` to provide higher-level operations for common agent patterns — sandboxes, workspaces, checkpoints, and coordination.

## Install

```bash
npm install @tigrisdata/ai
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

## Sandboxes

Give each agent an isolated, copy-on-write clone of a shared dataset. Snapshots a base bucket, forks it N times, and optionally creates scoped credentials per fork.

```typescript
import { createSandbox, teardownSandbox } from '@tigrisdata/ai';

// Create 3 isolated forks of a dataset bucket
const { data: sandbox, error } = await createSandbox({
  baseBucket: 'my-dataset',       // must have snapshots enabled
  count: 3,
  prefix: 'experiment-run-42',    // optional, controls fork bucket names
  credentials: { role: 'Editor' }, // optional, creates scoped keys per fork
});

// Each fork has its own bucket and (optionally) credentials
for (const fork of sandbox.forks) {
  console.log(fork.bucket);
  // fork.credentials?.accessKeyId
  // fork.credentials?.secretAccessKey
}

// Clean up — revokes credentials, deletes all fork buckets
await teardownSandbox(sandbox);
```

## Workspaces

Provision a fresh working area for a single agent — a new bucket with optional TTL and scoped credentials in one call.

```typescript
import { createWorkspace, teardownWorkspace } from '@tigrisdata/ai';

const { data: workspace } = await createWorkspace({
  name: 'agent-workspace-abc',
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

Snapshot a bucket at a point in time and restore from it later by forking.

```typescript
import { checkpoint, restore, listCheckpoints } from '@tigrisdata/ai';

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

// Restore from a checkpoint into a new fork
const { data: restored } = await restore(
  'training-data',
  ckpt.snapshotId,
  { forkName: 'training-data-retry' },
);
// restored.bucket — a copy-on-write clone at that point in time
```

## Coordination

Set up event-driven multi-agent pipelines using bucket notifications. One agent writes, Tigris fires a webhook, another agent reacts.

```typescript
import { setupCoordination, teardownCoordination } from '@tigrisdata/ai';

// Configure notifications on a bucket
await setupCoordination({
  bucket: 'pipeline-bucket',
  webhookUrl: 'https://my-service.com/webhook',
  filter: 'WHERE `key` REGEXP "^results/"',
  auth: { token: 'my-webhook-secret' },
});

// Disable notifications
await teardownCoordination({ bucket: 'pipeline-bucket' });
```

## API Reference

### Sandboxes

| Function | Description |
|---|---|
| `createSandbox(options)` | Snapshot + fork N times + scoped credentials |
| `teardownSandbox(sandbox, options?)` | Revoke credentials + delete forks |

### Workspaces

| Function | Description |
|---|---|
| `createWorkspace(options)` | Create bucket + TTL + scoped credentials |
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
| `setupCoordination(options)` | Configure bucket notifications |
| `teardownCoordination(options)` | Clear bucket notifications |

## License

MIT
