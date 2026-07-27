import { describe, expect, it, vi } from 'vitest';

// Mock the SDK so drainCompleted's isMigrated() calls are controllable.
vi.mock('@tigrisdata/storage', () => ({
  isMigrated: vi.fn(),
  migrate: vi.fn(),
  list: vi.fn(),
}));

import { isMigrated, migrate } from '@tigrisdata/storage';
import {
  atCapacity,
  drainCompleted,
  flushScheduleBatch,
  formatInFlightRow,
  inFlightView,
  type MigrationState,
  orderForDisplay,
  orderForMigration,
  shouldFlushBatch,
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
    inFlight: items.map((i) => ({ ...i, checkFailures: 0, scheduledAt: 0 })),
    inFlightBytes: bytes,
    drainOffset: 0,
    drainSweepMisses: 0,
    checkBackoffMs: 5_000,
    spinnerFrame: 0,
    errors: [],
    startTime: 0,
  };
}

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

describe('shouldFlushBatch', () => {
  it('never flushes an empty batch', () => {
    expect(shouldFlushBatch(makeState([]), 0, 0, 20 * GB)).toBe(false);
  });

  it('flushes before a large item would blow the byte budget', () => {
    // The exact 2-object case from the bug report: an 877 MB batch, then a
    // ~21.9 GB file would push in-flight to 22.8 GB — flush the 877 MB first.
    expect(shouldFlushBatch(makeState([]), 1, 877 * MB, 21.9 * GB)).toBe(true);
  });

  it('keeps batching small items until the batch is full', () => {
    expect(shouldFlushBatch(makeState([]), 10, 10 * MB, 1 * MB)).toBe(false);
  });

  it('flushes once the batch reaches the batch-size limit', () => {
    expect(shouldFlushBatch(makeState([]), 50, 50 * MB, 1 * MB)).toBe(true);
  });
});

describe('flushScheduleBatch', () => {
  it('stamps each item with its own scheduleMigration resolution time, not a shared post-batch one', async () => {
    // 'slow' takes longer to schedule than 'fast'. If scheduledAt were assigned
    // once after the whole batch settles (the old bug), both would get the same
    // timestamp — understating how long 'fast' had actually been queued.
    // Stamping inside each task must give 'fast' a strictly earlier scheduledAt.
    vi.mocked(migrate).mockImplementation(async (name: string) => {
      const delayMs = name === 'slow' ? 30 : 0;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return { data: undefined } as Awaited<ReturnType<typeof migrate>>;
    });

    const state = makeState([]);
    await flushScheduleBatch(
      [
        { name: 'fast', size: 1 },
        { name: 'slow', size: 1 },
      ],
      state,
      {},
      'bucket'
    );

    const fast = state.inFlight.find((i) => i.name === 'fast');
    const slow = state.inFlight.find((i) => i.name === 'slow');
    expect(fast).toBeDefined();
    expect(slow).toBeDefined();
    expect(fast?.scheduledAt).toBeLessThan(slow?.scheduledAt as number);
  });
});

describe('orderForMigration', () => {
  it('sorts smallest first', () => {
    const items = [
      { name: 'big', size: 100 },
      { name: 'small', size: 1 },
      { name: 'mid', size: 10 },
    ];
    expect(orderForMigration(items).map((i) => i.name)).toEqual([
      'small',
      'mid',
      'big',
    ]);
  });
});

describe('atCapacity', () => {
  it('allows scheduling when under both caps', () => {
    expect(atCapacity(makeState([{ name: 'a', size: 1 }]), 1)).toBe(false);
  });

  it('blocks at the object-count cap (regardless of size)', () => {
    // MAX_IN_FLIGHT_OBJECTS is 1000; a full queue of tiny objects still blocks.
    const items = Array.from({ length: 1000 }, (_, i) => ({
      name: `k${i}`,
      size: 1,
    }));
    expect(atCapacity(makeState(items), 1)).toBe(true);
  });

  it('blocks when the byte budget would be exceeded with items in flight', () => {
    expect(atCapacity(makeState([{ name: 'a', size: 10 * GB }]), 1)).toBe(true);
  });

  it('admits a single file larger than the whole budget once the queue is empty', () => {
    expect(atCapacity(makeState([]), 20 * GB)).toBe(false);
  });
});

describe('orderForDisplay', () => {
  it('orders longest-queued (oldest scheduledAt) first, ties broken by name', () => {
    const state = makeState([
      { name: 'a', size: 1 },
      { name: 'b', size: 1 },
      { name: 'c', size: 1 },
      { name: 'd', size: 1 },
    ]);
    state.inFlight[0].scheduledAt = 300; // a
    state.inFlight[1].scheduledAt = 100; // b
    state.inFlight[2].scheduledAt = 200; // c
    state.inFlight[3].scheduledAt = 100; // d — ties with b, name breaks it
    expect(orderForDisplay(state.inFlight).map((i) => i.name)).toEqual([
      'b',
      'd',
      'c',
      'a',
    ]);
  });

  it('returns a copy and does not reorder the live in-flight array', () => {
    const state = makeState([
      { name: 'a', size: 1 },
      { name: 'b', size: 1 },
    ]);
    state.inFlight[0].scheduledAt = 200;
    state.inFlight[1].scheduledAt = 100;
    orderForDisplay(state.inFlight);
    // drainCompleted's rotating cursor relies on this order being untouched.
    expect(state.inFlight.map((i) => i.name)).toEqual(['a', 'b']);
  });
});

describe('inFlightView', () => {
  it('shows every object when the count is within the row budget', () => {
    const state = makeState([
      { name: 'a', size: 1 },
      { name: 'b', size: 1 },
      { name: 'c', size: 1 },
    ]);
    const { shown, hidden } = inFlightView(state.inFlight, 20);
    expect(shown.length).toBe(3);
    expect(hidden.length).toBe(0);
  });

  it('collapses the overflow into hidden, reserving a row for the summary', () => {
    // 30 in flight, MAX_INFLIGHT_ROWS (10) is the cap: 9 shown + 1 overflow row.
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `k${String(i).padStart(2, '0')}`,
      size: 1,
    }));
    const { shown, hidden } = inFlightView(makeState(items).inFlight, 20);
    expect(shown.length).toBe(9);
    expect(hidden.length).toBe(21);
    expect(shown.length + hidden.length).toBe(30);
  });

  it('clamps the shown count to a tight terminal row budget', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `k${i}`,
      size: 1,
    }));
    // Only 4 rows fit: 3 shown + 1 overflow.
    const { shown, hidden } = inFlightView(makeState(items).inFlight, 4);
    expect(shown.length).toBe(3);
    expect(hidden.length).toBe(27);
  });

  it('shows nothing but the overflow line when only 1 row fits', () => {
    // cap === 1 with overflow: the reservation for the "+ N more" line must
    // consume the whole budget (0 shown), or the caller emits 2 lines
    // (1 shown + 1 overflow) against a 1-line budget.
    const items = Array.from({ length: 5 }, (_, i) => ({
      name: `k${i}`,
      size: 1,
    }));
    const { shown, hidden } = inFlightView(makeState(items).inFlight, 1);
    expect(shown.length).toBe(0);
    expect(hidden.length).toBe(5);
  });
});

describe('formatInFlightRow', () => {
  it('shows size and the queued duration, and fits the width', () => {
    const [item] = makeState([
      { name: 'Videos/big.mp4', size: 21.9 * GB },
    ]).inFlight;
    const row = formatInFlightRow(item, 60_000, 80);
    expect(row).toContain('Videos/big.mp4');
    expect(row).toContain('GB');
    expect(row).toContain('queued 1m 0s');
    expect(row).not.toContain('%');
    expect(row.length).toBeLessThanOrEqual(80);
  });

  it('truncates a long key to the available width, keeping the tail', () => {
    const [item] = makeState([
      { name: 'Videos/some/really/long/nested/path/merged.jsonl', size: GB },
    ]).inFlight;
    const row = formatInFlightRow(item, 0, 48);
    expect(row).toContain('…');
    expect(row).toContain('merged.jsonl'); // tail (filename) preserved
    expect(row).not.toContain('Videos/some'); // head dropped
    expect(row).toContain('queued 0s');
  });

  it('keeps the queued column aligned for a 9-char size at a unit boundary', () => {
    // formatSize's toFixed(1) rounds a value just under 1 MB up to "1024.0 KB"
    // (9 chars) — SIZE_COL must reserve 9, or this row's queued column would
    // start one character later than a normal (7-8 char) size.
    const [normal, boundary] = makeState([
      { name: 'normal.bin', size: 21.9 * GB },
      { name: 'boundary.bin', size: 1024 * 1024 - 50 },
    ]).inFlight;
    const normalRow = formatInFlightRow(normal, 0, 80);
    const boundaryRow = formatInFlightRow(boundary, 0, 80);
    expect(boundaryRow).toContain('1024.0 KB');
    expect(boundaryRow.indexOf('queued')).toBe(normalRow.indexOf('queued'));
  });
});

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

describe('drainCompleted — poll backoff', () => {
  it('grows the poll backoff after each all-stuck sweep, up to the cap', async () => {
    // Nothing ever migrates. An already-aborted signal makes the backoff sleep
    // resolve instantly, so we can observe the interval growing without waiting.
    vi.mocked(isMigrated).mockResolvedValue({
      data: false,
    } as Awaited<ReturnType<typeof isMigrated>>);
    const aborted = new AbortController();
    aborted.abort();

    const state = makeState([{ name: 'a', size: 1 }]);
    expect(state.checkBackoffMs).toBe(5_000);

    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      await drainCompleted(state, {}, 'bucket', aborted.signal);
      seen.push(state.checkBackoffMs);
    }
    // 5s → 10s → 20s → 30s (capped at MAX_CHECK_INTERVAL_MS).
    expect(seen).toEqual([10_000, 20_000, 30_000, 30_000]);
  });

  it('resets the poll backoff once something completes', async () => {
    // 'a' migrates, 'b' is stuck — the completion resets the backoff.
    vi.mocked(isMigrated).mockImplementation(
      async (name: string) =>
        ({ data: name === 'a' }) as Awaited<ReturnType<typeof isMigrated>>
    );

    const state = makeState([
      { name: 'a', size: 1 },
      { name: 'b', size: 1 },
    ]);
    state.checkBackoffMs = 20_000; // as if we'd already backed off

    await drainCompleted(state, {}, 'bucket');

    expect(state.checkBackoffMs).toBe(5_000);
  });
});
