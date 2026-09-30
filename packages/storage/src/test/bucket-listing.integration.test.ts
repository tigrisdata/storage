import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBucket } from '../lib/bucket/create';
import { listBuckets } from '../lib/bucket/list';
import { removeBucket } from '../lib/bucket/remove';
import { getConfig } from '../lib/config';
import { shouldSkipIntegrationTests } from './setup';

const skipTests = shouldSkipIntegrationTests();

const config = getConfig();

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

describe.skipIf(skipTests)('listBuckets filters', () => {
  const stamp = `${Date.now()}-${process.pid}`;
  const sourceName = `tigris-list-filter-src-${stamp}`;
  const forkName = `tigris-list-filter-fork-${stamp}`;

  beforeAll(async () => {
    const source = await createBucket(sourceName, {
      enableSnapshot: true,
      config,
    });
    expect(source.error).toBeUndefined();
    const fork = await createBucket(forkName, {
      sourceBucketName: sourceName,
      config,
    });
    expect(fork.error).toBeUndefined();
    // Bucket listing is eventually consistent: filter only once the plain
    // listing shows both, so a miss below means the filter, not the lag.
    await waitUntilListed([sourceName, forkName]);
  }, 60_000);

  afterAll(async () => {
    for (const name of [forkName, sourceName]) {
      await removeBucket(name, { force: true, config });
    }
  });

  /** Poll the unfiltered listing until every name is in it. */
  async function waitUntilListed(names: string[]): Promise<void> {
    const deadline = Date.now() + 45_000;
    for (;;) {
      const listed = await allNames({});
      const missing = names.filter((name) => !listed.includes(name));
      if (missing.length === 0) return;
      if (Date.now() > deadline) {
        throw new Error(`Not listed after 45s: ${missing.join(', ')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }

  /** Every page of a listing, so the assertion does not depend on ordering. */
  async function allNames(
    options: Parameters<typeof listBuckets>[0]
  ): Promise<string[]> {
    const names: string[] = [];
    let paginationToken: string | undefined;
    do {
      const { data, error } = await listBuckets({
        ...options,
        paginationToken,
        config,
      });
      expect(error).toBeUndefined();
      names.push(...(data?.buckets.map((bucket) => bucket.name) ?? []));
      paginationToken = data?.paginationToken;
    } while (paginationToken);
    return names;
  }

  it('forksOnly lists the fork but not its source', async () => {
    const names = await allNames({ forksOnly: true });
    expect(names).toContain(forkName);
    expect(names).not.toContain(sourceName);
  });

  it('an unknown owner lists nothing', async () => {
    const names = await allNames({ owner: `nobody-${stamp}@example.com` });
    expect(names).toEqual([]);
  });

  it('the listing owner as owner includes the buckets it just created', async ({
    skip,
  }) => {
    const { data, error } = await listBuckets({ config, limit: 1 });
    expect(error).toBeUndefined();
    // OwnedBy takes a username (an email address). The listing's owner
    // display name is that username on the gateway this runs against; if it
    // ever is not, skip visibly rather than assert nothing.
    const owner = data?.owner?.name;
    if (!owner?.includes('@')) {
      skip(`owner display name is not a username: ${JSON.stringify(owner)}`);
    }
    const names = await allNames({ owner: owner });
    expect(names).toEqual(expect.arrayContaining([sourceName, forkName]));
  });
});
