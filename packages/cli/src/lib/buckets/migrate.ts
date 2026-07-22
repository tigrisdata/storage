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

/** Base wait between isMigrated polling rounds (grows with backoff). */
const CHECK_INTERVAL_MS = 5_000;

/** Upper bound on the isMigrated poll backoff. */
const MAX_CHECK_INTERVAL_MS = 30_000;

/** Batch size for scheduling migrate() calls before checking throttle */
const SCHEDULE_BATCH_SIZE = 50;

/** Max consecutive isMigrated failures before marking item as failed */
const MAX_CHECK_FAILURES = 3;

/** Spinner frames for the live progress indicator. */
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** How often the progress line re-renders (spinner + clock) while polling. */
const RENDER_INTERVAL_MS = 250;

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
  /** Current isMigrated poll backoff, grown after each empty full sweep. */
  checkBackoffMs: number;
  /** Current spinner frame index for the live progress indicator. */
  spinnerFrame: number;
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

/**
 * The activity segment of the progress line: the oldest in-flight object (the
 * one scheduled-but-unconfirmed the longest), or a waiting indicator. The time
 * shown is how long we have been *waiting* for that file since it was scheduled
 * (`now - scheduledAt`), NOT an active-transfer time — the gateway exposes no
 * per-object progress, so we can only report how long it has been in-flight.
 * There is likewise no throughput figure: confirmations are lumpy binary flips
 * of isMigrated (the gateway does the transfer), not a byte stream, so an
 * "obj/s · MB/s" rate would misrepresent progress.
 */
export function activityLabel(
  oldest: InFlightItem | null,
  now: number,
  maxNameLen = 40
): string {
  if (oldest) {
    // Keep the tail of the key (the filename) when truncating.
    const name =
      oldest.name.length > maxNameLen
        ? `…${oldest.name.slice(-Math.max(1, maxNameLen - 1))}`
        : oldest.name;
    return `migrating ${name} (${formatSize(oldest.size)}, waiting ${formatElapsed(now - oldest.scheduledAt)})`;
  }
  return 'waiting…';
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
  config: Record<string, unknown>,
  signal?: AbortSignal
): Promise<MigrationItem[]> {
  const shadow = new PaginatedCursor(bucket, 'shadow', prefix, config);
  const tigris = new PaginatedCursor(bucket, 'tigris', prefix, config);

  const diff: MigrationItem[] = [];

  let shadowItem = await shadow.current();
  let tigrisItem = await tigris.current();

  while (shadowItem !== null) {
    // Stop listing promptly on Ctrl-C instead of paging through the whole
    // bucket first (which would look like a hang after the cancel).
    if (signal?.aborted) break;
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * The multi-line progress block. Each line is kept to one row (the renderer
 * truncates to the terminal width) so nothing wraps — wrapping is what let the
 * old single-line `\r` redraw leave duplicated rows behind on Ctrl-C and resize.
 */
function progressLines(state: MigrationState, bucket: string): string[] {
  const now = Date.now();
  state.spinnerFrame = (state.spinnerFrame + 1) % SPINNER.length;
  const spin = SPINNER[state.spinnerFrame];

  const filePct =
    state.total > 0 ? Math.floor((state.confirmed / state.total) * 100) : 0;
  const bytePct =
    state.totalBytes > 0
      ? Math.floor((state.confirmedBytes / state.totalBytes) * 100)
      : 0;
  const elapsed = formatElapsed(now - state.startTime);
  const oldest = oldestInFlight(state.inFlight);
  const width = process.stderr.columns ?? 80;

  return [
    `${spin} Migrating ${bucket} · ${elapsed} elapsed`,
    // File count climbs fast (smallest-first); the byte figure shows how much
    // data has actually moved (the big files are last).
    `  ${state.confirmed.toLocaleString()} / ${state.total.toLocaleString()} files (${filePct}%)` +
      ` · ${formatSize(state.confirmedBytes)} / ${formatSize(state.totalBytes)} (${bytePct}%)`,
    `  ${activityLabel(oldest, now, Math.max(20, width - 45))}` +
      ` · in-flight ${state.inFlight.length.toLocaleString()} (${formatSize(state.inFlightBytes)})`,
  ];
}

// Lines the sticky renderer last drew, so it can move the cursor up and clear
// exactly that block before redrawing. A single `\r` can only rewrite one row,
// which is why a wrapped or multi-line block used to duplicate itself.
let renderedLines = 0;

function renderProgress(state: MigrationState, bucket: string): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;
  const width = process.stderr.columns ?? 80;
  const lines = progressLines(state, bucket).map((line) =>
    line.length > width ? `${line.slice(0, Math.max(1, width - 1))}…` : line
  );

  let out = '';
  if (renderedLines > 0) {
    out += `\x1b[${renderedLines}A`; // up to the first line of the last block
  }
  out += '\x1b[0J'; // clear from the cursor to the end of the screen
  out += `${lines.join('\n')}\n`;
  renderedLines = lines.length;
  process.stderr.write(out);
}

function clearProgress(): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;
  if (renderedLines > 0) {
    process.stderr.write(`\x1b[${renderedLines}A\x1b[0J`);
    renderedLines = 0;
    return;
  }
  // No sticky block yet — clear any partial single line (e.g. "Discovering…").
  process.stderr.write('\r\x1b[K');
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
  bucket: string,
  signal?: AbortSignal
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
    state.checkBackoffMs = CHECK_INTERVAL_MS;
    return;
  }

  // No completions in this window: advance to the next one instead of sleeping
  // right away, so a slow head can't stall polling of the rest. Only back off
  // once we've swept the whole in-flight set without a single completion — and
  // grow the wait each time (up to MAX_CHECK_INTERVAL_MS) so a genuinely idle
  // migration isn't hammering the gateway with HEADs every few seconds.
  state.drainSweepMisses += window.length;
  if (state.drainSweepMisses >= n) {
    state.drainSweepMisses = 0;
    await sleep(state.checkBackoffMs, signal);
    state.checkBackoffMs = Math.min(
      state.checkBackoffMs * 2,
      MAX_CHECK_INTERVAL_MS
    );
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

  // Handle SIGINT: the first Ctrl-C stops scheduling and polling, prints a
  // summary of what has been confirmed, and exits. Objects already scheduled
  // remain queued for migration server-side (the pull is the gateway's, not
  // ours), so re-running migrate resumes from there. A second Ctrl-C
  // force-quits. The
  // AbortController wakes any in-progress poll backoff so the first Ctrl-C is
  // felt immediately instead of after a sleep of up to MAX_CHECK_INTERVAL_MS.
  let interrupted = false;
  let renderTimer: ReturnType<typeof setInterval> | undefined;
  const abortController = new AbortController();
  const stopRendering = () => {
    if (renderTimer) {
      clearInterval(renderTimer);
      renderTimer = undefined;
    }
  };
  const sigintHandler = () => {
    if (interrupted) {
      process.exit(130);
    }
    interrupted = true;
    abortController.abort();
    stopRendering();
    clearProgress();
  };
  process.on('SIGINT', sigintHandler);
  // On resize, clear the block at its current height so the next render tick
  // repaints it at the new width. Just zeroing the height would append a fresh
  // block under the old one (orphaning it) and desync clearProgress.
  const resizeHandler = () => {
    clearProgress();
  };
  process.stderr.on('resize', resizeHandler);

  try {
    // Phase 1: Discovery
    if (process.stderr.isTTY && !globalThis.__TIGRIS_JSON_MODE) {
      process.stderr.write('Discovering objects to migrate...');
    }

    let diff: MigrationItem[];
    try {
      diff = await discoverDiff(bucket, prefix, config, abortController.signal);
    } catch (err) {
      clearProgress();
      failWithError(context, err);
    }

    clearProgress();

    if (interrupted) {
      console.error('\nCancelled.');
      process.exit(1);
    }

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
      checkBackoffMs: CHECK_INTERVAL_MS,
      spinnerFrame: 0,
      errors: [],
      startTime: now,
    };

    // Re-render the progress block on a timer so the spinner and elapsed clock
    // keep moving while a large file transfers (and during poll backoff),
    // instead of the block looking frozen.
    if (process.stderr.isTTY && !globalThis.__TIGRIS_JSON_MODE) {
      renderTimer = setInterval(
        () => renderProgress(state, bucket),
        RENDER_INTERVAL_MS
      );
      renderTimer.unref?.();
    }

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
      }

      // Throttle: wait until in-flight capacity (object count and bytes) frees.
      while (atCapacity(state, item.size) && !interrupted) {
        await drainCompleted(state, config, bucket, abortController.signal);
      }

      if (interrupted) break;

      batch.push(item);
      batchBytes += item.size;
    }

    // Flush remaining batch
    if (batch.length > 0 && !interrupted) {
      await flushScheduleBatch(batch, state, config, bucket);
    }

    // Phase 3: Drain all remaining in-flight items
    while (state.inFlight.length > 0 && !interrupted) {
      await drainCompleted(state, config, bucket, abortController.signal);
    }

    stopRendering();
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
        `\nCancelled — ${state.confirmed.toLocaleString()} confirmed, ` +
          `${state.inFlight.length.toLocaleString()} queued for migration, ` +
          `${(state.total - state.scheduled).toLocaleString()} not scheduled. ` +
          'Re-run migrate to resume.'
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
    stopRendering();
    process.removeListener('SIGINT', sigintHandler);
    process.stderr.removeListener('resize', resizeHandler);
  }
}
