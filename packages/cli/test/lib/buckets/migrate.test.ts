import { describe, expect, it, vi } from 'vitest';

// Mock the SDK so drainCompleted's isMigrated() calls are controllable.
vi.mock('@tigrisdata/storage', () => ({
  isMigrated: vi.fn(),
  migrate: vi.fn(),
  list: vi.fn(),
}));

import { isMigrated } from '@tigrisdata/storage';
import {
  drainCompleted,
  type MigrationState,
} from '../../../src/lib/buckets/migrate.js';

function makeState(items: { name: string; size: number }[]): MigrationState {
  const bytes = items.reduce((s, i) => s + i.size, 0);
  return {
    total: items.length,
    totalBytes: bytes,
    scheduled: items.length,
    confirmed: 0,
    confirmedBytes: 0,
    failed: 0,
    inFlight: items.map((i) => ({ ...i, checkFailures: 0 })),
    inFlightBytes: bytes,
    drainOffset: 0,
    drainSweepMisses: 0,
    errors: [],
    startTime: 0,
  };
}

describe('drainCompleted — head-of-line blocking', () => {
  it('frees completed objects behind a slow/stuck head instead of deadlocking', async () => {
    // 120 in-flight (1 MB each). The first 50 — a full CONCURRENCY window —
    // never migrate (slow/stuck head); objects 50..119 are already done. The
    // old fixed-head drain only ever polled the first 50, so it would free
    // nothing and leave inFlightBytes pinned. The rotating sweep must free the
    // 70 completed objects regardless of the stuck head.
    const SIZE = 1024 * 1024;
    const items = Array.from({ length: 120 }, (_, i) => ({
      name: `obj-${String(i).padStart(3, '0')}`,
      size: SIZE,
    }));
    const stuckHead = new Set(items.slice(0, 50).map((i) => i.name));

    vi.mocked(isMigrated).mockImplementation(
      async (name: string) =>
        ({ data: !stuckHead.has(name) }) as Awaited<
          ReturnType<typeof isMigrated>
        >
    );

    const state = makeState(items);
    const startBytes = state.inFlightBytes;

    // Stop as soon as the 70 completable objects are confirmed — before any
    // all-stuck sweep would back off (sleep). A fixed-head drain never reaches
    // 70, so the round cap also guards against an infinite loop on regression.
    let rounds = 0;
    while (state.confirmed < 70 && rounds < 8) {
      await drainCompleted(state, {}, 'bucket');
      rounds++;
    }

    expect(state.confirmed).toBe(70);
    expect(state.inFlight.length).toBe(50);
    expect(state.inFlightBytes).toBe(startBytes - 70 * SIZE);
    expect(state.inFlight.every((i) => stuckHead.has(i.name))).toBe(true);
  });

  it('confirms every object across rounds when none are stuck', async () => {
    const items = Array.from({ length: 130 }, (_, i) => ({
      name: `k${i}`,
      size: 10,
    }));
    vi.mocked(isMigrated).mockResolvedValue({
      data: true,
    } as Awaited<ReturnType<typeof isMigrated>>);

    const state = makeState(items);
    let rounds = 0;
    while (state.inFlight.length > 0 && rounds < 8) {
      await drainCompleted(state, {}, 'bucket');
      rounds++;
    }

    expect(state.confirmed).toBe(130);
    expect(state.inFlight.length).toBe(0);
    expect(state.inFlightBytes).toBe(0);
  });
});
