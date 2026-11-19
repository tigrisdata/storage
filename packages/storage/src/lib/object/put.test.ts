import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SentRequest = {
  method: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
};

let sent: SentRequest[];
let respond: (req: SentRequest) => {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
};

// A real S3Client with an in-memory transport, so the test sees the headers
// the SDK actually serializes.
const client = new S3Client({
  region: 'auto',
  endpoint: 'https://t3.example',
  forcePathStyle: true,
  credentials: { accessKeyId: 'AKIA', secretAccessKey: 'secret' },
  maxAttempts: 1,
  requestHandler: {
    handle: async (request: SentRequest & { body?: unknown }) => {
      const req = {
        method: request.method,
        query: request.query,
        headers: request.headers,
      };
      sent.push(req);
      const { statusCode, headers = {}, body = '' } = respond(req);
      return {
        response: { statusCode, headers, body: Readable.from([body]) },
      };
    },
  } as never,
});

vi.mock('../tigris-client', () => ({
  createTigrisClient: () => ({ data: client }),
}));

const mockHead = vi.fn();
vi.mock('./head', () => ({
  head: (...args: unknown[]) => mockHead(...args),
}));

import { completeMultipartUpload } from './multipart';
import { put } from './put';

const config = { bucket: 'my-bucket' };

const preconditionFailed = {
  statusCode: 412,
  body: '<Error><Code>PreconditionFailed</Code><Message>At least one of the pre-conditions you specified did not hold</Message></Error>',
};

// Answers every S3 call a single or multipart upload makes with success.
const ok = (req: SentRequest) => {
  if (req.method === 'POST' && 'uploads' in req.query) {
    return {
      statusCode: 200,
      body: '<InitiateMultipartUploadResult><UploadId>up-1</UploadId></InitiateMultipartUploadResult>',
    };
  }
  if (req.method === 'POST' && 'uploadId' in req.query) {
    return {
      statusCode: 200,
      body: '<CompleteMultipartUploadResult><ETag>"done"</ETag></CompleteMultipartUploadResult>',
    };
  }
  return { statusCode: 200, headers: { etag: '"part"' } };
};

const isComplete = (req: SentRequest) =>
  req.method === 'POST' && 'uploadId' in req.query;
const isAbort = (req: SentRequest) => req.method === 'DELETE';
const ifNoneMatch = (req: SentRequest) => req.headers['if-none-match'];

// Just over one 5 MiB part, so lib-storage uploads two parts.
const largeBody = Buffer.alloc(5 * 1024 * 1024 + 1);

beforeEach(() => {
  vi.clearAllMocks();
  sent = [];
  respond = ok;
  mockHead.mockResolvedValue({ error: new Error('Not found') });
});

describe('put allowOverwrite', () => {
  it('sends If-None-Match: * on a single-part upload', async () => {
    const result = await put('a.txt', 'hello', {
      allowOverwrite: false,
      config,
    });

    expect(result.error).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('PUT');
    expect(ifNoneMatch(sent[0])).toBe('*');
  });

  it('sends If-None-Match: * on multipart completion', async () => {
    const result = await put('big.bin', largeBody, {
      allowOverwrite: false,
      multipart: true,
      config,
    });

    expect(result.error).toBeUndefined();
    const complete = sent.filter(isComplete);
    expect(complete).toHaveLength(1);
    expect(ifNoneMatch(complete[0])).toBe('*');
  });

  it('does not send If-None-Match by default', async () => {
    await put('a.txt', 'hello', { config });

    expect(mockHead).not.toHaveBeenCalled();
    expect(ifNoneMatch(sent[0])).toBeUndefined();
  });

  it('fails fast without uploading when HEAD finds the object', async () => {
    mockHead.mockResolvedValue({ data: { size: 1 } });

    const result = await put('a.txt', 'hello', {
      allowOverwrite: false,
      config,
    });

    expect(result.error?.message).toBe('File already exists');
    expect(sent).toHaveLength(0);
  });

  it('maps a 412 from a racing writer to File already exists', async () => {
    respond = () => preconditionFailed;

    const result = await put('a.txt', 'hello', {
      allowOverwrite: false,
      config,
    });

    expect(result.error?.message).toBe('File already exists');
  });

  it('maps a 412 on multipart completion and aborts the upload', async () => {
    respond = (req) => (isComplete(req) ? preconditionFailed : ok(req));

    const result = await put('big.bin', largeBody, {
      allowOverwrite: false,
      multipart: true,
      config,
    });

    expect(result.error?.message).toBe('File already exists');
    expect(sent.some(isAbort)).toBe(true);
  });

  it('aborts a failed multipart upload even without multipart options', async () => {
    // lib-storage goes multipart for bodies over 5 MiB on its own.
    respond = (req) =>
      isComplete(req) ? { statusCode: 500, body: '<Error/>' } : ok(req);

    const result = await put('big.bin', largeBody, { config });

    expect(result.error).toBeDefined();
    expect(sent.some(isComplete)).toBe(true);
    expect(sent.some(isAbort)).toBe(true);
  });
});

describe('completeMultipartUpload allowOverwrite', () => {
  const parts = [{ 1: '"part"' }];

  it('sends If-None-Match: * when allowOverwrite is false', async () => {
    await completeMultipartUpload('big.bin', 'up-1', parts, {
      allowOverwrite: false,
      config,
    });

    expect(ifNoneMatch(sent[0])).toBe('*');
  });

  it('does not send If-None-Match by default', async () => {
    await completeMultipartUpload('big.bin', 'up-1', parts, { config });

    expect(ifNoneMatch(sent[0])).toBeUndefined();
  });

  it('maps a 412 to File already exists and aborts the upload', async () => {
    respond = (req) => (isComplete(req) ? preconditionFailed : ok(req));

    const result = await completeMultipartUpload('big.bin', 'up-1', parts, {
      allowOverwrite: false,
      config,
    });

    expect(result.error?.message).toBe('File already exists');
    expect(sent.filter(isAbort)).toHaveLength(1);
    expect(sent.find(isAbort)?.query.uploadId).toBe('up-1');
  });

  it('keeps the upload when completion fails for another reason', async () => {
    respond = () => ({ statusCode: 500, body: '<Error/>' });

    const result = await completeMultipartUpload('big.bin', 'up-1', parts, {
      allowOverwrite: false,
      config,
    });

    expect(result.error?.message).toBe('Unable to complete multipart upload');
    expect(sent.some(isAbort)).toBe(false);
  });
});
