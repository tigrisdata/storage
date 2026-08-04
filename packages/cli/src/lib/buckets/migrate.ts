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

const BYTES_PER_GB = 1024 * 1024 * 1024;

/**
 * Default cap on total bytes of in-flight (scheduled but not confirmed)
 * migrations. Overridable per run with --max-in-flight-gb.
 */
const DEFAULT_MAX_IN_FLIGHT_GB = 50;

/** Bounds accepted for the --max-in-flight-gb override. */
const MIN_MAX_IN_FLIGHT_GB = 1;
const MAX_MAX_IN_FLIGHT_GB = 100;

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

/**
 * Preferred number of in-flight objects to list individually before collapsing
 * the remainder into a "+ N more" summary. The count actually shown is clamped
 * further to fit the terminal height so the sticky block never fills the screen
 * (which would break the cursor-up redraw).
 */
const MAX_INFLIGHT_ROWS = 10;

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
  /**
   * ms epoch when scheduled; drives the per-object "queued Xs" duration and the
   * longest-queued-first ordering of the in-flight list.
   */
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
  /**
   * Byte budget for the in-flight set — DEFAULT_MAX_IN_FLIGHT_GB unless the run
   * overrode it with --max-in-flight-gb. Lives on the state (not a module
   * constant) because it is per-run configuration that both capacity checks
   * read.
   */
  maxInFlightBytes: number;
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
 * Resolve the in-flight byte budget from a raw --max-in-flight-gb value.
 * Absent → the default. Values outside [MIN_MAX_IN_FLIGHT_GB,
 * MAX_MAX_IN_FLIGHT_GB] are rejected rather than clamped: a run silently using
 * a budget the user didn't ask for would keep far more or far less data queued
 * than the flag says. Note the flag registers as `[value]` (commander makes the
 * value optional), so a bare `--max-in-flight-gb` arrives as `true` — that is
 * an error, not 1 GB.
 */
export function parseMaxInFlightBytes(
  raw: unknown
): { ok: true; bytes: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, bytes: DEFAULT_MAX_IN_FLIGHT_GB * BYTES_PER_GB };
  }

  const gb =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim())
        : Number.NaN;

  if (!Number.isFinite(gb)) {
    return {
      ok: false,
      error: '--max-in-flight-gb must be a number of gigabytes',
    };
  }
  if (gb < MIN_MAX_IN_FLIGHT_GB || gb > MAX_MAX_IN_FLIGHT_GB) {
    return {
      ok: false,
      error: `--max-in-flight-gb must be between ${MIN_MAX_IN_FLIGHT_GB} and ${MAX_MAX_IN_FLIGHT_GB} (got ${gb})`,
    };
  }

  return { ok: true, bytes: Math.round(gb * BYTES_PER_GB) };
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
    state.inFlightBytes + itemSize > state.maxInFlightBytes &&
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
    state.inFlightBytes + batchBytes + itemSize > state.maxInFlightBytes
  );
}

/**
 * In-flight objects ordered for display: longest-queued (oldest `scheduledAt`)
 * first, ties broken by name for a stable order. Returns a copy — the live
 * `state.inFlight` order matters to drainCompleted's rotating cursor and must
 * not be reordered by a render. Longest-queued-first surfaces the objects that
 * look stuck (a small key that has sat for minutes floats to the top) and, at
 * the tail of a run, the large files that are legitimately still transferring.
 */
export function orderForDisplay(inFlight: InFlightItem[]): InFlightItem[] {
  return [...inFlight].sort(
    (a, b) =>
      a.scheduledAt - b.scheduledAt ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  );
}

/**
 * Split the in-flight set into the rows to list individually and the remainder
 * to collapse into a "+ N more" summary. `rowBudget` is how many list lines the
 * terminal can fit; the shown count is the smaller of that and MAX_INFLIGHT_ROWS.
 * When anything is hidden, one row is reserved for the overflow summary line.
 */
export function inFlightView(
  inFlight: InFlightItem[],
  rowBudget: number
): { shown: InFlightItem[]; hidden: InFlightItem[] } {
  const sorted = orderForDisplay(inFlight);
  const cap = Math.min(MAX_INFLIGHT_ROWS, Math.max(1, rowBudget));
  if (sorted.length <= cap) {
    return { shown: sorted, hidden: [] };
  }
  // Reserve a line for the "+ N more" summary. When cap is 1 (an extremely
  // short terminal), that reservation must consume the entire budget — 0 shown
  // rows, 1 overflow row — or the caller would emit 2 lines against a 1-line
  // budget and the sticky block could exceed the screen height.
  const shownCount = Math.max(0, cap - 1);
  return {
    shown: sorted.slice(0, shownCount),
    hidden: sorted.slice(shownCount),
  };
}

/**
 * Width reserved for the size column (right-aligned, e.g. "380.0 MB"). 9, not
 * 8: formatSize's toFixed(1) rounds up at unit boundaries (e.g. a value just
 * under 1 GB can print as "1024.0 MB", 9 chars) — 8 would misalign that row.
 */
const SIZE_COL = 9;

/**
 * Width reserved for the trailing "queued …" column when sizing the key column.
 * Fits e.g. "queued 120m 59s"; the column is last, so a rare longer value only
 * lengthens that one row (the renderer trims it), never shifting the columns
 * before it.
 */
const QUEUED_COL = 15;

/**
 * One in-flight row: `key   size   queued Xs`. The key column is sized from the
 * terminal width alone (fixed size/queued reservations), so it is identical on
 * every row and the size/queued columns line up. The key is truncated keeping
 * its tail (the filename) when it doesn't fit. The duration is time since the
 * object was scheduled — how long it has been queued, NOT an active-transfer
 * time: the gateway exposes no per-object progress and confirmation is a lumpy
 * binary flip of isMigrated, so there is deliberately no per-file percentage,
 * throughput, or ETA.
 */
export function formatInFlightRow(
  item: InFlightItem,
  now: number,
  width: number
): string {
  // 4 (indent) + name + 2 + size + 2 + queued. Depends only on `width`, so the
  // key column width is the same for every row → the columns align.
  const nameCol = Math.max(8, width - 4 - 2 - SIZE_COL - 2 - QUEUED_COL);
  const name =
    item.name.length > nameCol
      ? `…${item.name.slice(-Math.max(1, nameCol - 1))}`
      : item.name.padEnd(nameCol);
  const size = formatSize(item.size).padStart(SIZE_COL);
  const queued = `queued ${formatElapsed(now - item.scheduledAt)}`;
  return `    ${name}  ${size}  ${queued}`;
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
 *
 * Every value shown is a fact we actually have: counts of confirmed/failed
 * files, bytes confirmed vs. bytes still in flight, and — per in-flight object —
 * its size and how long it has been queued. There is no percentage, throughput,
 * or ETA: the gateway does the transfer and exposes no per-object progress, so a
 * large file mid-migration has no partial state to report. Listing each queued
 * object with its wait time is what keeps a slow large file from reading as a
 * hung process — it shows the run working through named files, not a frozen bar.
 */
function progressLines(state: MigrationState, bucket: string): string[] {
  const now = Date.now();
  state.spinnerFrame = (state.spinnerFrame + 1) % SPINNER.length;
  const spin = SPINNER[state.spinnerFrame];

  const elapsed = formatElapsed(now - state.startTime);
  const width = process.stderr.columns ?? 80;

  const lines = [
    `${spin} Migrating ${bucket} · ${elapsed} elapsed`,
    `  ${state.confirmed.toLocaleString()} / ${state.total.toLocaleString()} files done` +
      ` · ${state.failed.toLocaleString()} failed` +
      ` · ${formatSize(state.confirmedBytes)} confirmed, ${formatSize(state.inFlightBytes)} in flight`,
  ];

  const n = state.inFlight.length;
  if (n === 0) {
    lines.push('  0 in flight');
    return lines;
  }

  // Rows the list + overflow line may occupy: the terminal height minus the two
  // lines above, the in-flight header line, and one spare row — so the whole
  // block stays under the screen height and the cursor-up redraw stays correct.
  const rowBudget = Math.max(1, (process.stderr.rows ?? 24) - 1 - 3);
  const { shown, hidden } = inFlightView(state.inFlight, rowBudget);

  lines.push(
    hidden.length === 0
      ? `  ${n.toLocaleString()} in flight:`
      : `  ${n.toLocaleString()} in flight (showing ${shown.length} longest-queued):`
  );
  for (const item of shown) {
    lines.push(formatInFlightRow(item, now, width));
  }
  if (hidden.length > 0) {
    const hiddenBytes = hidden.reduce((sum, item) => sum + item.size, 0);
    lines.push(
      `    + ${hidden.length.toLocaleString()} more in flight (${formatSize(hiddenBytes)})`
    );
  }

  return lines;
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

export async function flushScheduleBatch(
  batch: MigrationItem[],
  state: MigrationState,
  config: Record<string, unknown>,
  bucket: string
): Promise<void> {
  // Capture the timestamp inside each task, right when its own scheduleMigration
  // call resolves — not after the whole batch settles. With CONCURRENCY (50)
  // requests in flight at once, individual latency varies (network, gateway
  // load); stamping all of them with one post-batch Date.now() would understate
  // the queued duration of whichever items finished first and isn't the actual
  // time they were scheduled.
  const results = await executeWithConcurrency(
    batch.map((item) => async () => ({
      result: await scheduleMigration(item.name, {
        config: { ...config, bucket },
      }),
      scheduledAt: Date.now(),
    })),
    CONCURRENCY
  );

  for (let i = 0; i < results.length; i++) {
    const { result, scheduledAt } = results[i];
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
        scheduledAt,
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

  // Validate before touching the network so a bad flag fails immediately
  // instead of after discovery has listed the whole bucket.
  const maxInFlight = parseMaxInFlightBytes(
    getOption(options, ['max-in-flight-gb', 'maxInFlightGb'])
  );
  if (!maxInFlight.ok) {
    failWithError(context, maxInFlight.error);
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
      maxInFlightBytes: maxInFlight.bytes,
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
