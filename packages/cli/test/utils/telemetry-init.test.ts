import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The telemetry module keeps its state in module scope, so every test gets a
// fresh copy through resetModules() and a dynamic import.
const sdk = {
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  setContext: vi.fn(),
  setTag: vi.fn(),
};

async function load(options: { sdkLoads?: boolean; optedOut?: boolean } = {}) {
  vi.resetModules();
  vi.doMock('../../src/utils/telemetry-config.js', () => ({
    isTelemetryDisabled: () => options.optedOut === true,
  }));
  if (options.sdkLoads === false) {
    vi.doMock('@sentry/node', () => {
      throw new Error('unsupported runtime');
    });
  } else {
    vi.doMock('@sentry/node', () => sdk);
  }
  return import('../../src/utils/telemetry.js');
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TIGRIS_SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
});

afterEach(() => {
  delete process.env.TIGRIS_SENTRY_DSN;
  vi.doUnmock('@sentry/node');
  vi.doUnmock('../../src/utils/telemetry-config.js');
});

describe('initTelemetry', () => {
  it('configures the SDK with collection kept off and our integration filter', async () => {
    const telemetry = await load();
    telemetry.initTelemetry();
    await telemetry.flushTelemetry();

    expect(sdk.init).toHaveBeenCalledTimes(1);
    const options = sdk.init.mock.calls[0][0];
    expect(options.dataCollection).toEqual(telemetry.DATA_COLLECTION);
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(options.tracesSampleRate).toBe(0);
    expect(options.integrations).toBe(telemetry.selectIntegrations);
    expect(options.beforeSend).toBe(telemetry.beforeSend);
    expect(sdk.setContext).toHaveBeenCalledWith(
      'cli',
      expect.objectContaining({ node: process.version })
    );
  });

  it('replays a report made while the SDK was still loading', async () => {
    const telemetry = await load();
    telemetry.initTelemetry();
    // Reported synchronously, before the dynamic import can have resolved.
    telemetry.captureError(new Error('boom'), { crash: true });
    expect(sdk.captureException).not.toHaveBeenCalled();

    await telemetry.flushTelemetry();

    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    expect(sdk.captureException.mock.calls[0][0]).toEqual(new Error('boom'));
    expect(sdk.flush).toHaveBeenCalledWith(2000);
  });

  it('reports directly once the SDK is up', async () => {
    const telemetry = await load();
    telemetry.initTelemetry();
    await telemetry.flushTelemetry();

    telemetry.captureError(new Error('later'), { category: 'network' });
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });

  it('degrades to no telemetry when the SDK cannot load', async () => {
    const telemetry = await load({ sdkLoads: false });
    telemetry.initTelemetry();
    telemetry.captureError(new Error('boom'), { crash: true });

    await expect(telemetry.flushTelemetry()).resolves.toBeUndefined();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    // And later reports are dropped, not queued forever.
    telemetry.captureError(new Error('again'), { crash: true });
    await telemetry.flushTelemetry();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('never loads the SDK when the user opted out', async () => {
    // The DSN is embedded at build time, so the opt-out is what keeps the
    // SDK off disk and out of memory for these users.
    const telemetry = await load({ optedOut: true });
    telemetry.initTelemetry();
    telemetry.captureError(new Error('boom'), { crash: true });
    await telemetry.flushTelemetry();

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });
});
