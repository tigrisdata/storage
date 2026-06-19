import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { listBuckets } from '../lib/bucket/list';
import { removeBucket } from '../lib/bucket/remove';
import { config } from '../lib/config';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

// Pagination regression coverage for the listing endpoint: the gateway expects
// `max-buckets` / `continuation-token` query params and returns the next page
// token in `ContinuationToken`. Earlier param/field names silently broke paging.
describe.skipIf(skipTests)('listBuckets pagination', () => {
  const ts = Date.now();
  const created = [
    `test-listpage-a-${ts}`.toLowerCase(),
    `test-listpage-b-${ts}`.toLowerCase(),
    `test-listpage-c-${ts}`.toLowerCase(),
  ];

  beforeAll(async () => {
    for (const name of created) {
      const res = await createBucket(name, { config });
      expect(
        res.error,
        `create ${name} failed: ${res.error?.message}`
      ).toBeUndefined();
    }
    // Bucket listing is eventually consistent.
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  });

  afterAll(async () => {
    for (const name of created) {
      await removeBucket(name, { force: true, config });
    }
  });

  it('honors the requested page size and returns a continuation token', async () => {
    const page = await listBuckets({ config, limit: 2 });

    expect(page.error).toBeUndefined();
    expect(page.data).toBeDefined();
    // `max-buckets` must cap the page.
    expect(page.data?.buckets.length).toBeLessThanOrEqual(2);
    // We created three buckets, so the account has more than one page of two.
    expect(page.data?.paginationToken).toBeTruthy();
  });

  it('advances to a different page when the continuation token is supplied', async () => {
    const first = await listBuckets({ config, limit: 2 });
    expect(first.error).toBeUndefined();

    const second = await listBuckets({
      config,
      limit: 2,
      paginationToken: first.data?.paginationToken,
    });
    expect(second.error).toBeUndefined();

    const firstNames = first.data?.buckets.map((b) => b.name) ?? [];
    const secondNames = second.data?.buckets.map((b) => b.name) ?? [];
    // The continuation token must yield a distinct page, not repeat the first.
    expect(secondNames.some((n) => !firstNames.includes(n))).toBe(true);
  });
});
