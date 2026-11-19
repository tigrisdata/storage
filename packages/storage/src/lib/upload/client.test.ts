import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../object/multipart', () => ({
  completeMultipartUpload: vi.fn(),
  getPartsPresignedUrls: vi.fn(),
  initMultipartUpload: vi.fn(),
}));

import { upload } from './client';
import { UploadAction } from './shared';

// Minimal XMLHttpRequest stand-in that records headers and answers with the
// status the test sets.
class FakeXHR {
  static status = 200;
  static instances: FakeXHR[] = [];
  status = 0;
  headers: Record<string, string> = {};
  upload = { addEventListener: () => {} };
  private listeners: Record<string, () => void> = {};

  constructor() {
    FakeXHR.instances.push(this);
  }
  addEventListener(event: string, cb: () => void) {
    this.listeners[event] = cb;
  }
  open() {}
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return '"etag"';
  }
  send() {
    this.status = FakeXHR.status;
    queueMicrotask(() => this.listeners.load?.());
  }
}

let fetchBodies: Record<string, unknown>[];
let completeResponse: unknown;

beforeEach(() => {
  FakeXHR.status = 200;
  FakeXHR.instances = [];
  fetchBodies = [];
  completeResponse = { data: { path: 'a.txt', url: 'https://t3/a.txt' } };
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      fetchBodies.push(body);
      const json = {
        [UploadAction.SinglepartInit]: { data: { url: 'https://put-url' } },
        [UploadAction.MultipartInit]: { data: { uploadId: 'up-1' } },
        [UploadAction.MultipartGetParts]: {
          data: [{ part: 1, url: 'https://part-1' }],
        },
        [UploadAction.MultipartComplete]: completeResponse,
      }[body.action as UploadAction];
      return { ok: true, json: async () => json };
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const file = new Blob(['hello'], { type: 'text/plain' });

describe('upload allowOverwrite (single part)', () => {
  it('sends If-None-Match: * when allowOverwrite is false', async () => {
    const result = await upload('a.txt', file, {
      url: '/api/upload',
      allowOverwrite: false,
    });

    expect(result.error).toBeUndefined();
    expect(FakeXHR.instances[0].headers['If-None-Match']).toBe('*');
  });

  it('does not send If-None-Match by default', async () => {
    await upload('a.txt', file, { url: '/api/upload' });

    expect(FakeXHR.instances[0].headers['If-None-Match']).toBeUndefined();
  });

  it('maps a 412 to File already exists', async () => {
    FakeXHR.status = 412;

    const result = await upload('a.txt', file, {
      url: '/api/upload',
      allowOverwrite: false,
    });

    expect(result.error?.message).toBe('File already exists');
  });

  it('keeps the status in other upload errors', async () => {
    FakeXHR.status = 403;

    const result = await upload('a.txt', file, { url: '/api/upload' });

    expect(result.error?.message).toBe('Upload failed with status: 403');
  });
});

describe('upload allowOverwrite (multipart)', () => {
  const completeBody = () =>
    fetchBodies.find((b) => b.action === UploadAction.MultipartComplete);

  it('asks the server to complete only if absent', async () => {
    const result = await upload('a.txt', file, {
      url: '/api/upload',
      multipart: true,
      allowOverwrite: false,
    });

    expect(result.error).toBeUndefined();
    expect(completeBody()?.allowOverwrite).toBe(false);
  });

  it('does not send allowOverwrite by default', async () => {
    await upload('a.txt', file, { url: '/api/upload', multipart: true });

    expect(completeBody()).not.toHaveProperty('allowOverwrite');
  });

  it('reports a failed completion returned in the response body', async () => {
    completeResponse = { error: { message: 'File already exists' } };

    const result = await upload('a.txt', file, {
      url: '/api/upload',
      multipart: true,
      allowOverwrite: false,
    });

    expect(result.error?.message).toBe('File already exists');
  });

  it('reports the conflict from a handleClientUpload route', async () => {
    const { handleClientUpload } = await import('./server');
    const { completeMultipartUpload } = await import('../object/multipart');
    vi.mocked(completeMultipartUpload).mockResolvedValue({
      error: new Error('File already exists'),
    });
    // What `Response.json(await handleClientUpload(body))` sends back.
    completeResponse = JSON.parse(
      JSON.stringify(
        await handleClientUpload({
          action: UploadAction.MultipartComplete,
          name: 'a.txt',
          uploadId: 'up-1',
          partIds: [{ 1: '"etag"' }],
          allowOverwrite: false,
        })
      )
    );

    const result = await upload('a.txt', file, {
      url: '/api/upload',
      multipart: true,
      allowOverwrite: false,
    });

    expect(result.error?.message).toBe('File already exists');
  });

  it('reports a failed completion whose Error serialized to {}', async () => {
    completeResponse = JSON.parse(JSON.stringify({ error: new Error('x') }));

    const result = await upload('a.txt', file, {
      url: '/api/upload',
      multipart: true,
    });

    expect(result.error?.message).toBe('Failed to complete multipart upload');
  });
});
