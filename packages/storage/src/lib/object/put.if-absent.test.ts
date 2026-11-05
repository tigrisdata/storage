import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTigrisClient } from '../tigris-client';
import { put } from './put';

// Keep the repository-wide integration cleanup inert for this offline suite.
vi.mock('./list', () => ({
  list: vi.fn(async () => ({ data: { items: [] } })),
}));
vi.mock('./remove', () => ({
  remove: vi.fn(() => {
    throw new Error('Unexpected cleanup delete');
  }),
}));
vi.mock('../tigris-client', () => ({ createTigrisClient: vi.fn() }));

const limit = 5 * 1024 * 1024;
type Request = {
  method: string;
  headers: Record<string, string>;
  body?: unknown;
};
let requests: Request[];
let client: S3Client;
let status: number;
let foreignBody: string | undefined;

beforeEach(() => {
  requests = [];
  status = 200;
  foreignBody = undefined;
  client = new S3Client({
    region: 'auto',
    endpoint: 'https://offline.invalid',
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'offline-test-id',
      secretAccessKey: 'offline-test-secret',
    },
    maxAttempts: 3,
    requestHandler: {
      handle: async (request: Request) => {
        requests.push(request);
        let code = status;
        if (foreignBody !== undefined && request.method === 'PUT') {
          if (request.headers['if-none-match'] === '*') code = 412;
          else foreignBody = 'overwritten';
        }
        return {
          response: {
            statusCode: code,
            headers: { etag: '"offline-etag"', 'content-length': '1' },
            body: Readable.from(
              code === 200
                ? []
                : [
                    `<Error><Code>${code === 412 ? 'PreconditionFailed' : 'ConditionalRequestConflict'}</Code><Message>conflict</Message></Error>`,
                  ]
            ),
          },
        };
      },
    },
  });
  vi.mocked(createTigrisClient).mockReturnValue({ data: client });
});
afterEach(() => {
  client.destroy();
  vi.clearAllMocks();
});

const config = { bucket: 'offline-bucket' };
describe('put ifAbsent with real AWS serialization and an inert transport', () => {
  it.each(['text', Buffer.from('text'), new Blob(['text'])])(
    'serializes a conditional private PUT for %s',
    async (body) => {
      const result = await put('nested/key', body, { ifAbsent: true, config });
      expect(result.error).toBeUndefined();
      const writes = requests.filter((r) => r.method === 'PUT');
      expect(writes).toHaveLength(1);
      expect(writes[0].headers['if-none-match']).toBe('*');
      expect(writes[0].headers['x-amz-acl']).toBe('private');
      expect(requests.map((r) => r.method)).toEqual(['PUT']);
    }
  );
  it('accepts exactly 5 MiB as a single PUT', async () => {
    expect(
      (await put('key', Buffer.alloc(limit), { ifAbsent: true, config })).error
    ).toBeUndefined();
    expect(requests.map((r) => r.method)).toEqual(['PUT']);
  });
  it.each([409, 412])(
    'returns %s without unconditional retry or fallback',
    async (code) => {
      status = code;
      const result = await put('key', 'ours', { ifAbsent: true, config });
      expect(result.error).toBeDefined();
      expect(result.data).toBeUndefined();
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe('PUT');
      expect(requests[0].headers['if-none-match']).toBe('*');
    }
  );
  it('does not replace the simulated foreign object inserted before PUT', async () => {
    foreignBody = 'foreign';
    expect(
      (await put('key', 'ours', { ifAbsent: true, config })).error
    ).toBeDefined();
    expect(foreignBody).toBe('foreign');
    expect(requests.map((r) => r.method)).toEqual(['PUT']);
    expect(requests[0].headers['if-none-match']).toBe('*');
  });
  it.each([
    { body: Buffer.alloc(limit + 1), options: {} },
    { body: 'é'.repeat(limit / 2 + 1), options: {} },
    { body: new Blob([Buffer.alloc(limit + 1)]), options: {} },
    { body: new ReadableStream(), options: {} },
    { body: 'ok', options: { multipart: true } },
    { body: 'ok', options: { partSize: limit } },
  ])(
    'rejects unsupported body or upload mode before client resolution',
    async ({ body, options }) => {
      const result = await put('key', body, {
        ...options,
        ifAbsent: true,
        config,
      });
      expect(result.error?.message).toContain('ifAbsent requires');
      expect(createTigrisClient).not.toHaveBeenCalled();
      expect(requests).toEqual([]);
    }
  );
  it.each([undefined, false])(
    'preserves the unconditional default for ifAbsent=%s',
    async (ifAbsent) => {
      const result = await put('key', 'ours', {
        ifAbsent,
        config,
      });
      expect(result.error).toBeUndefined();
      expect(requests[0].headers['if-none-match']).toBeUndefined();
      expect(requests[0].method).toBe('PUT');
    }
  );
});
