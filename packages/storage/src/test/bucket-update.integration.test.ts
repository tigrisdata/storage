import { afterEach, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { getBucketInfo } from '../lib/bucket/info';
import { removeBucket } from '../lib/bucket/remove';
import type { StorageClass } from '../lib/bucket/types';
import { updateBucket } from '../lib/bucket/update';
import { getConfig } from '../lib/config';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

const testBucket = (suffix: string) =>
  `test-update-${suffix}-${Date.now()}`.toLowerCase();

describe.skipIf(skipTests)('updateBucket Integration Tests', () => {
  const bucketsToCleanup: string[] = [];

  // The default-tier change lands via a PATCH and then has to propagate before
  // getBucketInfo reflects it, so round-trip assertions poll rather than read
  // once.
  const POLL = { timeout: 15000, interval: 1000 };

  const readTier = async (bucket: string) => {
    const info = await getBucketInfo(bucket, { config });
    return info.data?.settings.defaultTier;
  };

  afterEach(async () => {
    for (const bucket of [...bucketsToCleanup].reverse()) {
      await removeBucket(bucket, { force: true, config });
    }
    bucketsToCleanup.length = 0;
  });

  it('changes the default tier of an existing bucket and round-trips via getBucketInfo', async () => {
    const name = testBucket('tier');
    bucketsToCleanup.push(name);

    // A plain bucket starts on STANDARD.
    const created = await createBucket(name, { config });
    expect(
      created.error,
      `create failed: ${created.error?.message}`
    ).toBeUndefined();
    expect(await readTier(name)).toBe('STANDARD');

    // Change the default tier on the existing bucket.
    const updated = await updateBucket(name, {
      defaultTier: 'GLACIER',
      config,
    });
    expect(
      updated.error,
      `update failed: ${updated.error?.message}`
    ).toBeUndefined();
    expect(updated.data).toEqual({ bucket: name, updated: true });

    // The new tier should propagate to the bucket metadata.
    await expect.poll(() => readTier(name), POLL).toBe('GLACIER');
  });

  it('updates the default tier to each storage class', async () => {
    const name = testBucket('tiers');
    bucketsToCleanup.push(name);

    const created = await createBucket(name, { config });
    expect(created.error).toBeUndefined();

    // Walk through every non-default tier, then back to STANDARD.
    const tiers: StorageClass[] = [
      'STANDARD_IA',
      'GLACIER_IR',
      'GLACIER',
      'STANDARD',
    ];

    for (const tier of tiers) {
      const updated = await updateBucket(name, { defaultTier: tier, config });
      expect(
        updated.error,
        `update to ${tier} failed: ${updated.error?.message}`
      ).toBeUndefined();

      await expect.poll(() => readTier(name), POLL).toBe(tier);
    }
  });

  it('leaves the default tier unchanged when an unrelated setting is updated', async () => {
    const name = testBucket('preserve');
    bucketsToCleanup.push(name);

    // Start on a non-default tier so a reset would be observable.
    const created = await createBucket(name, {
      defaultTier: 'STANDARD_IA',
      config,
    });
    expect(created.error).toBeUndefined();
    await expect.poll(() => readTier(name), POLL).toBe('STANDARD_IA');

    // An update that omits defaultTier must not reset the tier.
    const updated = await updateBucket(name, {
      cacheControl: 'max-age=60',
      config,
    });
    expect(updated.error).toBeUndefined();

    // Give any propagation a chance, then confirm the tier is still STANDARD_IA.
    await new Promise((r) => setTimeout(r, 2000));
    expect(await readTier(name)).toBe('STANDARD_IA');
  });
});
