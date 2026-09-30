import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/http-client', () => ({
  createStorageClient: vi.fn(),
}));

import { listBuckets } from '../lib/bucket/list';
import { fetchBucketListing } from '../lib/bucket/listing';
import { createStorageClient } from '../lib/http-client';

type Request = (options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
}) => Promise<{ data: unknown }>;

const request = vi.fn<Request>(async () => ({
  data: { Buckets: { Bucket: [] } },
}));

/** The query string of the one request the call under test made. */
function requestedQuery(): URLSearchParams {
  expect(request).toHaveBeenCalledOnce();
  const { path } = request.mock.calls[0][0];
  return new URLSearchParams(path.slice(path.indexOf('?') + 1));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createStorageClient).mockReturnValue({
    data: { request },
  } as unknown as ReturnType<typeof createStorageClient>);
});

describe('fetchBucketListing query', () => {
  it('sends OnlyForked only when asked', async () => {
    await fetchBucketListing({ flags: { forksOnly: true } });
    expect(requestedQuery().get('OnlyForked')).toBe('true');
  });

  it('sends OwnedBy with the username, encoded', async () => {
    await fetchBucketListing({ flags: { owner: 'alice@example.com' } });
    const query = requestedQuery();
    expect(query.get('OwnedBy')).toBe('alice@example.com');
    expect(request.mock.calls[0][0]).toMatchObject({
      path: expect.stringContaining('OwnedBy=alice%40example.com'),
    });
  });

  it('sends neither by default', async () => {
    await fetchBucketListing();
    const query = requestedQuery();
    expect(query.has('OnlyForked')).toBe(false);
    expect(query.has('OwnedBy')).toBe(false);
  });

  it('does not tie OnlyForked to IncludeForkInfo', async () => {
    await fetchBucketListing({ flags: { forksOnly: true } });
    expect(requestedQuery().has('IncludeForkInfo')).toBe(false);
  });
});

describe('listBuckets filters', () => {
  it('passes forksOnly and owner through alongside the usual flags', async () => {
    await listBuckets({ forksOnly: true, owner: 'alice@example.com' });
    const query = requestedQuery();
    expect(query.get('OnlyForked')).toBe('true');
    expect(query.get('OwnedBy')).toBe('alice@example.com');
    expect(query.get('IncludeOwnerInfo')).toBe('true');
    expect(query.has('OnlyDeleted')).toBe(false);
  });

  it('composes with deleted and pagination', async () => {
    await listBuckets({
      deleted: true,
      forksOnly: true,
      limit: 5,
      paginationToken: 'next',
    });
    const query = requestedQuery();
    expect(query.get('OnlyDeleted')).toBe('true');
    expect(query.get('OnlyForked')).toBe('true');
    expect(query.get('max-buckets')).toBe('5');
    expect(query.get('continuation-token')).toBe('next');
  });
});
