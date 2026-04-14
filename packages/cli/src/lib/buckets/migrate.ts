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

/** Max concurrent migrate() or isMigrated() calls */
const CONCURRENCY = 50;

/** Seconds to wait between isMigrated polling rounds */
const CHECK_INTERVAL_MS = 5_000;

/** Batch size for scheduling migrate() calls before checking throttle */
const SCHEDULE_BATCH_SIZE = 50;

/** Max consecutive isMigrated failures before marking item as failed */
const MAX_CHECK_FAILURES = 3;

interface MigrationItem {
  name: string;
  size: number;
}

interface InFlightItem extends MigrationItem {
  checkFailures: number;
}

interface MigrationState {
  total: number;
  totalBytes: number;
  scheduled: number;
  confirmed: number;
  confirmedBytes: number;
  failed: number;
  inFlight: InFlightItem[];
  inFlightBytes: number;
  errors: Array<{ name: string; error: string }>;
  startTime: number;
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

function printProgress(state: MigrationState, bucket: string): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;

  const elapsed = formatElapsed(Date.now() - state.startTime);
  const line =
    `\rMigrating ${bucket}: ` +
    `${state.confirmed.toLocaleString()} / ${state.total.toLocaleString()} objects | ` +
    `${formatSize(state.confirmedBytes)} / ${formatSize(state.totalBytes)} | ` +
    `In-flight: ${formatSize(state.inFlightBytes)} | ` +
    `${elapsed}`;

  process.stderr.write(line + ' '.repeat(Math.max(0, 100 - line.length)));
}

function clearProgress(): void {
  if (!process.stderr.isTTY || globalThis.__TIGRIS_JSON_MODE) return;
  process.stderr.write('\r' + ' '.repeat(100) + '\r');
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
      state.inFlight.push({ ...item, checkFailures: 0 });
      state.inFlightBytes += item.size;
      state.scheduled++;
    }
  }
}

async function drainCompleted(
  state: MigrationState,
  config: Record<string, unknown>,
  bucket: string
): Promise<void> {
  if (state.inFlight.length === 0) return;

  // Check oldest items first (FIFO), up to CONCURRENCY at a time
  const toCheck = state.inFlight.slice(0, CONCURRENCY);

  const results = await executeWithConcurrency(
    toCheck.map(
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
    const item = toCheck[i];

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
  }

  // If nothing completed, wait before next check
  if (completedKeys.size === 0) {
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

    // Phase 2: Migration loop
    const state: MigrationState = {
      total: diff.length,
      totalBytes,
      scheduled: 0,
      confirmed: 0,
      confirmedBytes: 0,
      failed: 0,
      inFlight: [],
      inFlightBytes: 0,
      errors: [],
      startTime: Date.now(),
    };

    let batch: MigrationItem[] = [];

    for (const item of diff) {
      if (interrupted) break;

      // Throttle: wait until capacity is available
      while (
        state.inFlightBytes + item.size > MAX_IN_FLIGHT_BYTES &&
        state.inFlight.length > 0 &&
        !interrupted
      ) {
        await drainCompleted(state, config, bucket);
        printProgress(state, bucket);
      }

      if (interrupted) break;

      batch.push(item);

      if (batch.length >= SCHEDULE_BATCH_SIZE) {
        await flushScheduleBatch(batch, state, config, bucket);
        batch = [];
        printProgress(state, bucket);
      }
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
