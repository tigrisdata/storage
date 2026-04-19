import { describe, it, expect, afterEach } from 'vitest';
import { put, get, removeBucket, getBucketInfo } from '@tigrisdata/storage';
import { createWorkspace, teardownWorkspace } from '../src/workspace';
import { createForks, teardownForks } from '../src/forks';
import type { Forks } from '../src/forks';
import { checkpoint, restore, listCheckpoints } from '../src/checkpoint';
import { setupCoordination, teardownCoordination } from '../src/coordination';
import type { Workspace } from '../src/workspace';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const uniqueName = (prefix: string) =>
  `test-ai-${prefix}-${Date.now()}`.toLowerCase();

// ── Workspace ──

describe.skipIf(skipTests)('createWorkspace / teardownWorkspace', () => {
  let workspace: Workspace | undefined;

  afterEach(async () => {
    if (workspace) {
      await teardownWorkspace(workspace);
      workspace = undefined;
    }
  });

  it('should create a basic workspace and tear it down', async () => {
    const result = await createWorkspace(uniqueName('ws'));

    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data!.bucket).toBeTruthy();
    workspace = result.data!;

    // Verify bucket exists
    const info = await getBucketInfo(workspace.bucket);
    expect(info.error).toBeUndefined();

    // Teardown
    const teardown = await teardownWorkspace(workspace);
    expect(teardown.error).toBeUndefined();
    workspace = undefined;
  });

  it('should create a workspace with TTL', async () => {
    const result = await createWorkspace(uniqueName('ws-ttl'), {
      ttl: { days: 1 },
    });

    expect(result.error).toBeUndefined();
    workspace = result.data!;

    // Verify bucket was created — TTL is a fire-and-forget config,
    // getBucketInfo may not surface it immediately
    const info = await getBucketInfo(workspace.bucket);
    expect(info.error).toBeUndefined();
  });

  it('should create a workspace with TTL and credentials', async () => {
    const result = await createWorkspace(uniqueName('ws-ttl-creds'), {
      ttl: { days: 1 },
      credentials: { role: 'Editor' },
    });

    expect(result.error).toBeUndefined();
    workspace = result.data!;

    // Credentials must be present even if TTL config fails
    expect(workspace.credentials).toBeDefined();
    expect(workspace.credentials!.accessKeyId).toBeTruthy();
    expect(workspace.credentials!.secretAccessKey).toBeTruthy();
  });

  it('should create a workspace with snapshots enabled', async () => {
    const result = await createWorkspace(uniqueName('ws-snap'), {
      enableSnapshots: true,
    });

    expect(result.error).toBeUndefined();
    workspace = result.data!;

    const info = await getBucketInfo(workspace.bucket);
    expect(info.error).toBeUndefined();
    expect(info.data?.isSnapshotEnabled).toBe(true);
  });

  it('should create a workspace with scoped credentials', async () => {
    const result = await createWorkspace(uniqueName('ws-creds'), {
      credentials: { role: 'Editor' },
    });

    expect(result.error).toBeUndefined();
    workspace = result.data!;

    expect(workspace.credentials).toBeDefined();
    expect(workspace.credentials!.accessKeyId).toBeTruthy();
    expect(workspace.credentials!.secretAccessKey).toBeTruthy();

    // Verify the scoped credentials can write to the workspace bucket
    const putResult = await put('test-file.txt', 'hello from workspace', {
      config: {
        bucket: workspace.bucket,
        accessKeyId: workspace.credentials!.accessKeyId,
        secretAccessKey: workspace.credentials!.secretAccessKey,
      },
    });
    expect(putResult.error).toBeUndefined();
  });
});

// ── Checkpoint ──

describe.skipIf(skipTests)('checkpoint / restore / listCheckpoints', () => {
  const bucketsToCleanup: string[] = [];

  afterEach(async () => {
    for (const bucket of bucketsToCleanup) {
      await removeBucket(bucket, { force: true });
    }
    bucketsToCleanup.length = 0;
  });

  it('should checkpoint and list checkpoints', async () => {
    // Create a bucket with snapshots enabled
    const wsResult = await createWorkspace(uniqueName('ckpt'), {
      enableSnapshots: true,
    });
    expect(wsResult.error).toBeUndefined();
    const bucket = wsResult.data!.bucket;
    bucketsToCleanup.push(bucket);

    // Put some data
    await put('data.json', '{"value": 1}', { config: { bucket } });

    // Checkpoint
    const ckptResult = await checkpoint(bucket, { name: 'v1' });
    expect(ckptResult.error).toBeUndefined();
    expect(ckptResult.data!.snapshotId).toBeTruthy();
    expect(ckptResult.data!.name).toBe('v1');

    // List checkpoints
    const listResult = await listCheckpoints(bucket);
    expect(listResult.error).toBeUndefined();
    expect(listResult.data!.checkpoints.length).toBeGreaterThanOrEqual(1);

    const found = listResult.data!.checkpoints.find(
      (c) => c.snapshotId === ckptResult.data!.snapshotId
    );
    expect(found).toBeDefined();
  });

  it('should restore from a checkpoint', async () => {
    // Create source bucket with snapshots
    const wsResult = await createWorkspace(uniqueName('restore-src'), {
      enableSnapshots: true,
    });
    expect(wsResult.error).toBeUndefined();
    const bucket = wsResult.data!.bucket;
    bucketsToCleanup.push(bucket);

    // Put data and checkpoint
    await put('file.txt', 'original content', { config: { bucket } });
    const ckptResult = await checkpoint(bucket);
    expect(ckptResult.error).toBeUndefined();

    // Restore to a new fork
    const forkName = uniqueName('restore-dst');
    const restoreResult = await restore(bucket, ckptResult.data!.snapshotId, {
      forkName,
    });
    expect(restoreResult.error).toBeUndefined();
    expect(restoreResult.data!.bucket).toBe(forkName);
    bucketsToCleanup.push(forkName);

    // Verify data exists in the fork
    const getResult = await get('file.txt', 'string', {
      config: { bucket: forkName },
    });
    expect(getResult.error).toBeUndefined();
    expect(getResult.data).toBe('original content');
  });
});

// ── Forks ──

describe.skipIf(skipTests)('createForks / teardownForks', () => {
  let forkSet: Forks | undefined;
  const extraBucketsToCleanup: string[] = [];

  afterEach(async () => {
    if (forkSet) {
      await teardownForks(forkSet);
      forkSet = undefined;
    }
    for (const bucket of extraBucketsToCleanup) {
      await removeBucket(bucket, { force: true });
    }
    extraBucketsToCleanup.length = 0;
  });

  it('should create forks from a base bucket', async () => {
    // Create a base bucket with snapshots and data
    const baseBucket = uniqueName('forks-base');
    const wsResult = await createWorkspace(baseBucket, {
      enableSnapshots: true,
    });
    expect(wsResult.error).toBeUndefined();
    extraBucketsToCleanup.push(baseBucket);

    await put('dataset.json', '{"items": [1,2,3]}', {
      config: { bucket: baseBucket },
    });

    // Create 2 forks
    const result = await createForks(baseBucket, 2, {
      prefix: uniqueName('fork'),
    });

    expect(result.error).toBeUndefined();
    expect(result.data!.forks).toHaveLength(2);
    expect(result.data!.snapshotId).toBeTruthy();
    forkSet = result.data!;

    // Verify each fork has the data from the base bucket
    for (const fork of forkSet.forks) {
      const getResult = await get('dataset.json', 'string', {
        config: { bucket: fork.bucket },
      });
      expect(getResult.error).toBeUndefined();
      expect(getResult.data).toBe('{"items": [1,2,3]}');
    }

    // Verify forks are isolated — write to fork 0, fork 1 unchanged
    await put('fork-0-only.txt', 'only in fork 0', {
      config: { bucket: forkSet.forks[0].bucket },
    });

    const fork1Check = await get('fork-0-only.txt', 'string', {
      config: { bucket: forkSet.forks[1].bucket },
    });
    expect(fork1Check.error).toBeDefined();
  });

  it('should create forks with scoped credentials', async () => {
    const baseBucket = uniqueName('forks-creds');
    const wsResult = await createWorkspace(baseBucket, {
      enableSnapshots: true,
    });
    expect(wsResult.error).toBeUndefined();
    extraBucketsToCleanup.push(baseBucket);

    const result = await createForks(baseBucket, 2, {
      prefix: uniqueName('fork-cred'),
      credentials: { role: 'Editor' },
    });

    expect(result.error).toBeUndefined();
    forkSet = result.data!;

    // Each fork should have its own credentials
    for (const fork of forkSet.forks) {
      expect(fork.credentials).toBeDefined();
      expect(fork.credentials!.accessKeyId).toBeTruthy();
      expect(fork.credentials!.secretAccessKey).toBeTruthy();
    }

    // Verify scoped credentials can write to their own fork
    const fork = forkSet.forks[0];
    const putResult = await put('scoped-write.txt', 'written with scoped key', {
      config: {
        bucket: fork.bucket,
        accessKeyId: fork.credentials!.accessKeyId,
        secretAccessKey: fork.credentials!.secretAccessKey,
      },
    });
    expect(putResult.error).toBeUndefined();
  });

  it('should teardown forks cleanly', async () => {
    const baseBucket = uniqueName('forks-td');
    const wsResult = await createWorkspace(baseBucket, {
      enableSnapshots: true,
    });
    expect(wsResult.error).toBeUndefined();
    extraBucketsToCleanup.push(baseBucket);

    const result = await createForks(baseBucket, 2, {
      prefix: uniqueName('fork-td'),
      credentials: { role: 'Editor' },
    });
    expect(result.error).toBeUndefined();
    const created = result.data!;

    const forkBuckets = created.forks.map((f) => f.bucket);

    // Teardown
    const teardown = await teardownForks(created);
    expect(teardown.error).toBeUndefined();

    // Verify forks are deleted
    for (const bucket of forkBuckets) {
      const info = await getBucketInfo(bucket);
      expect(info.error).toBeDefined();
    }

    // Forks cleaned up, don't double-teardown in afterEach
    forkSet = undefined;
  });
});

// ── Coordination ──

describe.skipIf(skipTests)('setupCoordination / teardownCoordination', () => {
  const bucketsToCleanup: string[] = [];

  afterEach(async () => {
    for (const bucket of bucketsToCleanup) {
      await removeBucket(bucket, { force: true });
    }
    bucketsToCleanup.length = 0;
  });

  it('should setup and teardown coordination notifications', async () => {
    const bucket = uniqueName('coord');
    const wsResult = await createWorkspace(bucket);
    expect(wsResult.error).toBeUndefined();
    bucketsToCleanup.push(bucket);

    // Setup coordination
    const setupResult = await setupCoordination(bucket, {
      webhookUrl: 'https://example.com/webhook',
      filter: 'WHERE `key` REGEXP "^results/"',
      auth: { token: 'test-secret-token' },
    });
    expect(setupResult.error).toBeUndefined();

    // Teardown coordination
    const teardownResult = await teardownCoordination(bucket);
    expect(teardownResult.error).toBeUndefined();
  });
});
