import { getStorageConfig } from '@auth/provider.js';
import type { ListItem } from '@tigrisdata/storage';
import {
  isMigrated,
  list,
  migrate as scheduleMigration,
} from '@tigrisdata/storage';
import { executeWithConcurrency } from '@utils/concurrency.js';
import { failWithError } from '@utils/exit.js';
import { formatSize } from '@utils/format.js';
import { msg, printFailure } from '@utils/messages.js';
import { getOption } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

const context = msg('buckets', 'migrate');

/** Max total bytes of in-flight (scheduled but not confirmed) migrations */
const MAX_IN_FLIGHT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/**
 * Max number of in-flight objects, independent of size. Keeps the poll set
 * bounded so a run with millions of tiny files can't balloon in-flight (which
 * would make each drain sweep huge), and paces how far ahead we schedule.
 */
const MAX_IN_FLIGHT_OBJECTS = 1000;

/** Max concurrent migrate() or isMigrated() calls */
const CONCURRENCY = 50;

/** Seconds to wait between isMigrated polling rounds */
const CHECK_INTERVAL_MS = 5_000;

/** Batch size for scheduling migrate() calls before checking throttle */
const SCHEDULE_BATCH_SIZE = 50;

/** Max consecutive isMigrated failures before marking item as failed */
const MAX_CHECK_FAILURES = 3;

/**
 * Surface the oldest in-flight object once it has been pulling this long, so a
 * slow/large transfer is visibly named instead of looking like a stall.
 */
const SLOW_IN_FLIGHT_MS = 30_000;

/** Window over which the displayed confirmed-object/byte rate is averaged. */
const RATE_WINDOW_MS = 5_000;

interface MigrationItem {
  name: string;
  size: number;
}

export interface InFlightItem extends MigrationItem {
  checkFailures: number;
  /** ms epoch when scheduled; used for the oldest-in-flight display. */
  scheduledAt: number;
}

export interface MigrationState {
  total: number;
  totalBytes: number;
  scheduled: number;
  confirmed: number;
  confirmedBytes: number;
  failed: number;
  inFlight: InFlightItem[];
  inFlightBytes: number;
  /** Rotating cursor into inFlight so drainCompleted sweeps the whole set. */
  drainOffset: number;
  /** In-flight items checked since the last completion (for backoff). */
  drainSweepMisses: number;
  /** Rolling anchor for the displayed confirmed-object/byte rate. */
  rate: {
    anchorTime: number;
    anchorConfirmed: number;
    anchorBytes: number;
    objPerSec: number;
    bytesPerSec: number;
  };
  errors: Array<{ name: string; error: string }>;
  startTime: number;
}

/**
 * Migrate smallest objects first. This front-loads visible progress — the
 * object count climbs fast while the many small files flow — and pushes large
 * files to the end, where a slow pull reads as "finishing the big ones" rather
 * than a mid-run stall. Sorts in place; ties keep their relative order.
 */
export function orderForMigration(items: MigrationItem[]): MigrationItem[] {
  items.sort((a, b) => a.size - b.size);
  return items;
}

/**
 * Whether scheduling `itemSize` more bytes should wait for the in-flight set to
 * drain. Blocks when the object-count cap is hit, or when the byte budget would
 * be exceeded and there is something to drain. A single file larger than the
 * whole byte budget is admitted once the queue empties (it can never otherwise
 * fit) instead of deadlocking.
 */
export function atCapacity(state: MigrationState, itemSize: number): boolean {
  if (state.inFlight.length >= MAX_IN_FLIGHT_OBJECTS) {
    return true;
  }
  return (
    state.inFlightBytes + itemSize > MAX_IN_FLIGHT_BYTES &&
    state.inFlight.length > 0
  );
}

/**
 * Whether the pending schedule batch should be flushed before adding `itemSize`.
 * Flushing moves the batch's bytes into `inFlight` where the byte/object budget
 * is actually enforced — without this, a batch that hasn't reached
 * SCHEDULE_BATCH_SIZE (e.g. a run with only a couple of objects) is scheduled
 * all at once at the end, blowing the in-flight budget and letting a huge file
 * be scheduled alongside others instead of running on its own.
 */
export function shouldFlushBatch(
  state: MigrationState,
  batchLength: number,
  batchBytes: number,
  itemSize: number
): boolean {
  if (batchLength === 0) return false;
  return (
    batchLength >= SCHEDULE_BATCH_SIZE ||
    state.inFlight.length + batchLength >= MAX_IN_FLIGHT_OBJECTS ||
    state.inFlightBytes + batchBytes + itemSize > MAX_IN_FLIGHT_BYTES
  );
}

/** The in-flight item that has been pulling longest, or null if none. */
export function oldestInFlight(inFlight: InFlightItem[]): InFlightItem | null {
  let oldest: InFlightItem | null = null;
  for (const item of inFlight) {
    if (oldest === null || item.scheduledAt < oldest.scheduledAt) {
      oldest = item;
    }
  }
  return oldest;
}

// ---------------------------------------------------------------------------
// PaginatedCursor: wraps list() with source-based pagination
// ---------------------------------------------------------------------------

class PaginatedCursor {
  private buffer: ListItem[] = [];
  private index = 0;
  private token: string | undefined;
  private _done = false;

  constructor(
    private bucket: string,
    private source: 'tigris' | 'shadow',
    private prefix: string | undefined,
    private config: Record<string, unknown>
  ) {}

  get done(): boolean {
    return this._done && this.index >= this.buffer.length;
  }

  async current(): Promise<ListItem | null> {
    if (this.index < this.buffer.length) {
      return this.buffer[this.index];
    }
    if (this._done) return null;
    await this.fetchPage();
    return this.index < this.buffer.length ? this.buffer[this.index] : null;
  }

  advance(): void {
    this.index++;
  }

  private async fetchPage(): Promise<void> {
    if (this._done) return;

    const { data, error } = await list({
      prefix: this.prefix,
      source: this.source,
      ...(this.token ? { paginationToken: this.token } : {}),
      config: {
        ...this.config,
        bucket: this.bucket,
      },
    });

    if (error) {
      throw error;
    }

    this.buffer = data.items ?? [];
    this.index = 0;
    this.token = data.paginationToken;

    if (!data.paginationToken && !data.hasMore) {
      this._done = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Discovery: sorted merge-diff
// ---------------------------------------------------------------------------

async function discoverDiff(
  bucket: string,
  prefix: string | undefined,
  config: Record<string, unknown>
): Promise<MigrationItem[]> {
  const shadow = new PaginatedCursor(bucket, 'shadow', prefix, config);
  const tigris = new PaginatedCursor(bucket, 'tigris', prefix, config);

  const diff: MigrationItem[] = [];

  let shadowItem = await shadow.current();
  let tigrisItem = await tigris.current();

  while (shadowItem !== null) {
    if (tigrisItem === null) {
      // Tigris exhausted — all remaining shadow items need migration
      diff.push({ name: shadowItem.name, size: shadowItem.size });
      shadow.advance();
      shadowItem = await shadow.current();
      continue;
    }

    if (shadowItem.name < tigrisItem.name) {
      // In shadow but not in tigris
      diff.push({ name: shadowItem.name, size: shadowItem.size });
      shadow.advance();
      shadowItem = await shadow.current();
    } else if (shadowItem.name > tigrisItem.name) {
      // In tigris but not in shadow — skip
      tigris.advance();
      tigrisItem = await tigris.current();
    } else {
      // In both — already migrated
      shadow.advance();
      tigris.advance();
      shadowItem = await shadow.current();
      tigrisItem = await tigris.current();
    }
  }

  return diff;
}

// ---------------------------------------------------------------------------
// Migration loop
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Recompute the rolling confirmed rate once per RATE_WINDOW_MS. */
function updateRate(state: MigrationState, now: number): void {
  const dt = now - state.rate.anchorTime;
  if (dt < RATE_WINDOW_MS) return;
  state.rate.objPerSec =
    ((state.confirmed - state.rate.anchorConfirmed) * 1000) / dt;
  state.rate.bytesPerSec =
    ((state.confirmedBytes - state.rate.anchorBytes) * 1000) / dt;
  state.rate.anchorTime = now;
  state.rate.anchorConfirmed = state.confirmed;
  state.rate.anchorBytes = state.confirmedBytes;
}

function printProgress(state: MigrationState, bucket: string): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;

  const now = Date.now();
  updateRate(state, now);

  const pct =
    state.total > 0 ? Math.floor((state.confirmed / state.total) * 100) : 0;

  const parts = [
    `Migrating ${bucket}: ${state.confirmed.toLocaleString()} / ${state.total.toLocaleString()} (${pct}%)`,
    `${Math.round(state.rate.objPerSec).toLocaleString()} obj/s, ${formatSize(state.rate.bytesPerSec)}/s`,
    `in-flight ${state.inFlight.length.toLocaleString()} (${formatSize(state.inFlightBytes)})`,
    formatElapsed(now - state.startTime),
  ];

  // Name the oldest in-flight object once it has been pulling a while, so a
  // slow/large transfer is visibly attributed instead of looking like a stall.
  const oldest = oldestInFlight(state.inFlight);
  if (oldest && now - oldest.scheduledAt >= SLOW_IN_FLIGHT_MS) {
    const label =
      oldest.name.length > 40 ? `…${oldest.name.slice(-39)}` : oldest.name;
    parts.push(
      `pulling ${label} (${formatSize(oldest.size)}, ${formatElapsed(now - oldest.scheduledAt)})`
    );
  }

  const width = process.stderr.columns ?? 100;
  let text = parts.join(' | ');
  if (text.length > width) {
    text = `${text.slice(0, width - 1)}…`;
  }
  process.stderr.write(
    `\r${text}${' '.repeat(Math.max(0, width - text.length))}`
  );
}

function clearProgress(): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;
  const width = process.stderr.columns ?? 100;
  process.stderr.write(`\r${' '.repeat(width)}\r`);
}

async function flushScheduleBatch(
  batch: MigrationItem[],
  state: MigrationState,
  config: Record<string, unknown>,
  bucket: string
): Promise<void> {
  const results = await executeWithConcurrency(
    batch.map(
      (item) => () =>
        scheduleMigration(item.name, {
          config: { ...config, bucket },
        })
    ),
    CONCURRENCY
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const item = batch[i];

    if (result.error) {
      state.failed++;
      state.errors.push({
        name: item.name,
        error: result.error.message,
      });
    } else {
      state.inFlight.push({
        ...item,
        checkFailures: 0,
        scheduledAt: Date.now(),
      });
      state.inFlightBytes += item.size;
      state.scheduled++;
    }
  }
}

export async function drainCompleted(
  state: MigrationState,
  config: Record<string, unknown>,
  bucket: string
): Promise<void> {
  const n = state.inFlight.length;
  if (n === 0) return;

  // Poll a rotating window across the WHOLE in-flight set — never a fixed head.
  // Migrations don't complete in FIFO order, so only checking the oldest items
  // lets a slow object at the front hide the completed objects behind it: their
  // bytes are never freed, inFlightBytes stays pinned at the cap, and the whole
  // migration deadlocks (head-of-line blocking). The cursor advances each call
  // so every in-flight object is polled over successive rounds.
  const start = state.drainOffset % n;
  const window: InFlightItem[] = [];
  for (let k = 0; k < Math.min(CONCURRENCY, n); k++) {
    window.push(state.inFlight[(start + k) % n]);
  }
  state.drainOffset = start + window.length;

  const results = await executeWithConcurrency(
    window.map(
      (item) => () =>
        isMigrated(item.name, {
          config: { ...config, bucket },
        })
    ),
    CONCURRENCY
  );

  const completedKeys = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const item = window[i];

    if (result.error) {
      item.checkFailures++;
      if (item.checkFailures >= MAX_CHECK_FAILURES) {
        completedKeys.add(item.name);
        state.failed++;
        state.inFlightBytes -= item.size;
        state.errors.push({
          name: item.name,
          error: `Failed to verify migration status after ${MAX_CHECK_FAILURES} attempts`,
        });
      }
    } else if (result.data) {
      completedKeys.add(item.name);
      state.confirmed++;
      state.confirmedBytes += item.size;
      state.inFlightBytes -= item.size;
    }
  }

  if (completedKeys.size > 0) {
    state.inFlight = state.inFlight.filter(
      (item) => !completedKeys.has(item.name)
    );
    state.drainSweepMisses = 0;
    return;
  }

  // No completions in this window: advance to the next one instead of sleeping
  // right away, so a slow head can't stall polling of the rest. Only back off
  // once we've swept the whole in-flight set without a single completion —
  // i.e. we are genuinely waiting on the gateway.
  state.drainSweepMisses += window.length;
  if (state.drainSweepMisses >= n) {
    state.drainSweepMisses = 0;
    await sleep(CHECK_INTERVAL_MS);
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function migrate(
  options: Record<string, unknown>
): Promise<void> {
  const pathString = getOption<string>(options, ['path']);

  if (!pathString) {
    failWithError(context, 'Bucket name or path is required');
  }

  const { bucket, path: prefix } = parseAnyPath(pathString);

  if (!bucket) {
    failWithError(context, 'Invalid path');
  }

  const config = await getStorageConfig();

  // Handle SIGINT gracefully
  let interrupted = false;
  const sigintHandler = () => {
    interrupted = true;
  };
  process.on('SIGINT', sigintHandler);

  try {
    // Phase 1: Discovery
    if (process.stderr.isTTY && !globalThis.__TIGRIS_JSON_MODE) {
      process.stderr.write('Discovering objects to migrate...');
    }

    let diff: MigrationItem[];
    try {
      diff = await discoverDiff(bucket, prefix, config);
    } catch (err) {
      clearProgress();
      failWithError(context, err);
    }

    clearProgress();

    if (diff.length === 0) {
      if (process.stderr.isTTY && !globalThis.__TIGRIS_JSON_MODE) {
        console.error('All objects are already migrated.');
      }
      if (globalThis.__TIGRIS_JSON_MODE) {
        console.log(
          JSON.stringify({
            action: 'migrate',
            bucket,
            toMigrate: 0,
            confirmed: 0,
            failed: 0,
          })
        );
      }
      return;
    }

    const totalBytes = diff.reduce((sum, item) => sum + item.size, 0);

    if (process.stderr.isTTY && !globalThis.__TIGRIS_JSON_MODE) {
      console.error(
        `Found ${diff.length.toLocaleString()} objects to migrate (${formatSize(totalBytes)})`
      );
    }

    // Migrate smallest first so progress climbs quickly and large files finish
    // last (a slow pull there reads as "finishing up", not a mid-run stall).
    orderForMigration(diff);

    // Phase 2: Migration loop
    const now = Date.now();
    const state: MigrationState = {
      total: diff.length,
      totalBytes,
      scheduled: 0,
      confirmed: 0,
      confirmedBytes: 0,
      failed: 0,
      inFlight: [],
      inFlightBytes: 0,
      drainOffset: 0,
      drainSweepMisses: 0,
      rate: {
        anchorTime: now,
        anchorConfirmed: 0,
        anchorBytes: 0,
        objPerSec: 0,
        bytesPerSec: 0,
      },
      errors: [],
      startTime: now,
    };

    let batch: MigrationItem[] = [];
    let batchBytes = 0;

    for (const item of diff) {
      if (interrupted) break;

      // Flush the pending batch before it would exceed the in-flight budget (or
      // fill a batch), so scheduled bytes are accounted and a large file isn't
      // scheduled alongside a full batch.
      if (shouldFlushBatch(state, batch.length, batchBytes, item.size)) {
        await flushScheduleBatch(batch, state, config, bucket);
        batch = [];
        batchBytes = 0;
        printProgress(state, bucket);
      }

      // Throttle: wait until in-flight capacity (object count and bytes) frees.
      while (atCapacity(state, item.size) && !interrupted) {
        await drainCompleted(state, config, bucket);
        printProgress(state, bucket);
      }

      if (interrupted) break;

      batch.push(item);
      batchBytes += item.size;
    }

    // Flush remaining batch
    if (batch.length > 0 && !interrupted) {
      await flushScheduleBatch(batch, state, config, bucket);
      printProgress(state, bucket);
    }

    // Phase 3: Drain all remaining in-flight items
    while (state.inFlight.length > 0 && !interrupted) {
      await drainCompleted(state, config, bucket);
      printProgress(state, bucket);
    }

    clearProgress();

    // Summary
    const elapsed = formatElapsed(Date.now() - state.startTime);

    if (globalThis.__TIGRIS_JSON_MODE) {
      console.log(
        JSON.stringify({
          action: 'migrate',
          bucket,
          toMigrate: state.total,
          scheduled: state.scheduled,
          confirmed: state.confirmed,
          failed: state.failed,
          elapsed,
          ...(state.errors.length > 0
            ? { errors: state.errors.slice(0, 20) }
            : {}),
        })
      );
    }

    if (interrupted) {
      console.error(
        `\nInterrupted. ${state.confirmed} confirmed, ${state.inFlight.length} still in-flight, ${state.total - state.scheduled} not yet scheduled.`
      );
      process.exit(1);
    }

    if (state.failed > 0) {
      printFailure(
        context,
        `${state.failed} object(s) failed to migrate. ${state.confirmed} migrated successfully in ${elapsed}.`
      );
      if (
        process.stderr.isTTY &&
        !globalThis.__TIGRIS_JSON_MODE &&
        state.errors.length > 0
      ) {
        const shown = state.errors.slice(0, 10);
        for (const err of shown) {
          console.error(`  ${err.name}: ${err.error}`);
        }
        if (state.errors.length > 10) {
          console.error(`  ... and ${state.errors.length - 10} more`);
        }
      }
      process.exit(1);
    }

    console.error(
      `\nMigration complete: ${state.confirmed.toLocaleString()} object(s) migrated (${formatSize(state.confirmedBytes)}) in ${elapsed}`
    );
  } finally {
    process.removeListener('SIGINT', sigintHandler);
  }
}
