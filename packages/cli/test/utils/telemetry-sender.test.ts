import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Keep the anonymous id and opt-out state out of the developer's real config.
const TEST_HOME = mkdtempSync(join(tmpdir(), 'tigris-sender-'));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

// Stand in for the detached child: capture the requests it would be handed.
const { handed } = vi.hoisted(() => ({
  handed: [] as Array<{
    url: string;
    headers: Record<string, string>;
    body: string;
  }>,
}));
vi.mock('node:child_process', async () => {
  const fs = await import('node:fs');
  return {
    spawn: (_command: string, args: string[]) => {
      const file = args[args.length - 1];
      handed.push(...JSON.parse(fs.readFileSync(file, 'utf8')));
      fs.unlinkSync(file);
      return { pid: 1, on() {}, unref() {} };
    },
  };
});

const {
  PAYLOAD_FILE_PREFIX,
  queueTelemetry,
  resetTelemetryQueueForTesting,
  runTelemetrySender,
  sendQueuedTelemetry,
} = await import('../../src/utils/telemetry-sender.js');

/** A local stand-in for PostHog and Sentry that records every POST. */
const received: Array<{
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}> = [];
const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({
      path: req.url ?? '',
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    res.end('{}');
  });
});
let base = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  received.length = 0;
  handed.length = 0;
  resetTelemetryQueueForTesting();
});

afterAll(() => {
  server.close();
  rmSync(TEST_HOME, { recursive: true, force: true });
});

function payloadFile(content: string, dir = tmpdir()): string {
  const file = join(
    dir,
    `${PAYLOAD_FILE_PREFIX}test-${Math.random().toString(16).slice(2)}.json`
  );
  writeFileSync(file, content, { mode: 0o600 });
  return file;
}

describe('the __telemetry-send handler', () => {
  it('posts every request in the payload file, then deletes it', async () => {
    const file = payloadFile(
      JSON.stringify([
        {
          url: `${base}/i/v0/e/`,
          headers: { 'content-type': 'application/json' },
          body: '{"event":"cli_command"}',
        },
        {
          url: `${base}/api/42/envelope/`,
          headers: { 'x-sentry-auth': 'Sentry sentry_version=7, sentry_key=k' },
          body: '{"event_id":"e"}\n{"type":"event"}\n{}',
        },
      ])
    );

    await runTelemetrySender(file);

    expect(received.map((r) => r.path).sort()).toEqual([
      '/api/42/envelope/',
      '/i/v0/e/',
    ]);
    const envelope = received.find((r) => r.path === '/api/42/envelope/');
    expect(envelope?.headers['x-sentry-auth']).toContain('sentry_key=k');
    expect(envelope?.body).toContain('"type":"event"');
    expect(existsSync(file)).toBe(false);
  });

  it('deletes a malformed payload file without sending anything', async () => {
    const file = payloadFile('not json');
    await runTelemetrySender(file);
    expect(received).toHaveLength(0);
    expect(existsSync(file)).toBe(false);
  });

  it('skips entries that are not well-formed requests', async () => {
    const file = payloadFile(
      JSON.stringify([
        { url: 'file:///etc/passwd', headers: {}, body: 'x' },
        { url: `${base}/ok`, headers: {}, body: 'x' },
      ])
    );
    await runTelemetrySender(file);
    expect(received.map((r) => r.path)).toEqual(['/ok']);
  });

  it('never reads or deletes a file it did not write', async () => {
    const elsewhere = mkdtempSync(join(TEST_HOME, 'elsewhere-'));
    const outside = payloadFile('[]', elsewhere);
    const misnamed = join(tmpdir(), `not-ours-${Date.now()}.json`);
    writeFileSync(misnamed, '[]');
    try {
      await runTelemetrySender(outside);
      await runTelemetrySender(misnamed);
      await runTelemetrySender(undefined);
      expect(existsSync(outside)).toBe(true);
      expect(existsSync(misnamed)).toBe(true);
    } finally {
      rmSync(misnamed, { force: true });
    }
  });
});

describe('the queue', () => {
  it('hands everything queued to one child, once', () => {
    queueTelemetry({ url: `${base}/a`, headers: {}, body: '1' });
    queueTelemetry({ url: `${base}/b`, headers: {}, body: '2' });
    sendQueuedTelemetry();
    sendQueuedTelemetry();
    expect(handed.map((r) => r.body)).toEqual(['1', '2']);
  });
});

describe('Sentry delivery', () => {
  it('queues envelopes for the child instead of sending them', async () => {
    const { makeQueuedTransport } = await import(
      '../../src/utils/telemetry.js'
    );
    const transport = makeQueuedTransport({
      url: 'https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=pub123&sentry_version=7',
      recordDroppedEvent: () => {},
    } as Parameters<typeof makeQueuedTransport>[0]);

    await transport.send([
      { event_id: 'abc' },
      [[{ type: 'event' }, { message: 'hello' }]],
    ] as unknown as Parameters<typeof transport.send>[0]);
    expect(handed).toHaveLength(0);
    sendQueuedTelemetry();

    expect(handed).toHaveLength(1);
    const [request] = handed;
    // Auth moves from the query string to the header.
    expect(request.url).toBe('https://o1.ingest.sentry.io/api/42/envelope/');
    expect(request.headers['x-sentry-auth']).toMatch(
      /^Sentry sentry_version=7, sentry_key=pub123, sentry_client=tigris-cli\//
    );
    expect(request.body.split('\n').map((line) => JSON.parse(line))).toEqual([
      { event_id: 'abc' },
      { type: 'event' },
      { message: 'hello' },
    ]);
  });

  it('captures synchronously and scrubbed, and sends nothing for a clean run', async () => {
    const originalEnv = { ...process.env };
    process.env.NODE_ENV = 'production';
    process.env.TIGRIS_SENTRY_DSN = 'http://pub123@127.0.0.1:9/42';
    delete process.env.TIGRIS_NO_TELEMETRY;
    delete process.env.DO_NOT_TRACK;
    delete process.env.TIGRIS_ENV;
    try {
      const { captureError, initTelemetry } = await import(
        '../../src/utils/telemetry.js'
      );
      initTelemetry();

      // Nothing captured: no envelope at all (no session, no client report).
      sendQueuedTelemetry();
      expect(handed).toHaveLength(0);

      captureError(new Error('upload failed for tsec_LIVESECRET456'), {
        crash: true,
      });
      // No await: the envelope must be queued before a process.exit() could run.
      sendQueuedTelemetry();

      expect(handed).toHaveLength(1);
      expect(handed[0].url).toBe('http://127.0.0.1:9/api/42/envelope/');
      expect(handed[0].body).toContain('"type":"event"');
      expect(handed[0].body).toContain('upload failed for [redacted]');
      expect(handed[0].body).not.toContain('LIVESECRET456');
    } finally {
      process.env = originalEnv;
    }
  });
});
