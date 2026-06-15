import { config, missingConfigError } from '../config';
import { createStorageClient } from '../http-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { listVersions } from './list-versions';

export type GetPresignedUrlOperation = 'get' | 'put';

type MethodOrOperation =
  | {
      method: GetPresignedUrlOperation;
      operation?: never;
    }
  | {
      operation: GetPresignedUrlOperation;
      method?: never;
    };

export type GetPresignedUrlOptions = {
  /**
   * The access key ID to use for the presigned URL.
   * If not provided, the access key ID from the config will be used.
   */
  accessKeyId?: string;
  /**
   * The expiration time of the presigned URL in seconds.
   * Default is 3600 seconds (1 hour).
   */
  expiresIn?: number;
  /**
   * Snapshot version to read from. When set, the presigned URL is
   * pinned to the object version that was current at the time of the
   * snapshot.
   *
   * The gateway's presign endpoint accepts a literal object versionId
   * (not a snapshot version), so this function resolves the snapshot
   * to the correct versionId client-side: lists the key's versions
   * (and delete markers) and selects the newest entry with
   * `versionId <= snapshotVersion`.
   *
   * Only valid with `operation: 'get'`. Returns an error if the object
   * did not exist at the snapshot time (either never written, or
   * deleted before the snapshot).
   */
  snapshotVersion?: string;
  config?: TigrisStorageConfig;
} & MethodOrOperation;

export type GetPresignedUrlResponse = {
  url: string;
  expiresIn: number;
} & MethodOrOperation;

export async function getPresignedUrl(
  path: string,
  options: GetPresignedUrlOptions
): Promise<TigrisStorageResponse<GetPresignedUrlResponse, Error>> {
  const { data: client, error } = createStorageClient(options?.config);

  if (error) {
    return { error };
  }

  const bucket = options?.config?.bucket ?? config.bucket;
  const expiresIn = options.expiresIn ?? 3600; // 1 hour default
  const operation = options.operation ?? options.method;
  const accessKeyId =
    options.accessKeyId ?? options.config?.accessKeyId ?? config.accessKeyId;

  if (!accessKeyId) {
    return missingConfigError('accessKeyId');
  }

  if (!bucket) {
    return missingConfigError('bucket');
  }

  if (!operation) {
    return {
      error: new Error(
        'Operation is required, possible values are `get` and `put`'
      ),
    };
  }

  const body: {
    bucket: string;
    expires_in: number;
    key: string;
    key_id: string;
    type: GetPresignedUrlOperation;
    version_id?: string;
  } = {
    bucket,
    expires_in: expiresIn,
    key: path,
    key_id: accessKeyId,
    type: operation,
  };

  if (options.snapshotVersion !== undefined) {
    if (operation !== 'get') {
      return {
        error: new Error(
          'snapshotVersion is only supported with `operation: "get"` — snapshots are read-only'
        ),
      };
    }

    const resolved = await resolveSnapshotVersionId(path, options);
    if (resolved.error) return { error: resolved.error };
    body.version_id = resolved.versionId;
  }

  const response = await client.request<
    Record<string, unknown>,
    {
      bucket: string;
      custom_domain_url: string;
      key: string;
      key_id: string;
      key_secret: string;
      type: GetPresignedUrlOperation;
      url: string;
    }
  >({
    method: 'POST',
    path: '/?func=presign',
    body,
  });

  if (response.error) {
    return {
      error: response.error.message
        ? new Error(response.error.message)
        : response.error,
    };
  }

  return {
    data: {
      url: response.data.url,
      expiresIn,
      operation,
    },
  };
}

/**
 * Resolve a snapshot version to the object versionId that was current
 * at that snapshot. Walks paged `listVersions` results for the exact
 * key (prefix scope can include sibling keys like `foo.txt.bak`) and
 * picks the newest entry — across both versions and delete markers —
 * with `versionId <= snapshotVersion`. If that entry is a delete
 * marker, the object did not exist at the snapshot time.
 *
 * versionIds and snapshotVersions are 19-digit ns-epoch strings, so we
 * compare as `BigInt` to be length-independent and outside `Number`'s
 * safe-integer range. Malformed numeric inputs are reported as errors
 * rather than throwing.
 */
async function resolveSnapshotVersionId(
  path: string,
  options: GetPresignedUrlOptions
): Promise<{ versionId: string; error?: never } | { error: Error }> {
  const snapshotBigInt = parseTimestamp(options.snapshotVersion);
  if (snapshotBigInt === undefined) {
    return {
      error: new Error(
        `Invalid snapshotVersion "${options.snapshotVersion}": expected a numeric timestamp`
      ),
    };
  }

  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let sawTargetKey = false;

  while (true) {
    const { data: page, error: versionsError } = await listVersions({
      prefix: path,
      keyMarker,
      versionIdMarker,
      config: options.config,
    });
    if (versionsError) return { error: versionsError };

    const versionsOfKey = (page?.versions ?? []).filter((v) => v.name === path);
    const deletesOfKey = (page?.deleteMarkers ?? []).filter(
      (d) => d.name === path
    );
    if (versionsOfKey.length + deletesOfKey.length > 0) sawTargetKey = true;

    // Merge versions + delete markers ≤ snapshot, pick the newest.
    // Delete markers and versions share the same ns-epoch versionId
    // space, so a sort by `versionId desc` finds the actual latest
    // event before the snapshot — whichever kind it is.
    type Candidate = { versionId: string; isDelete: boolean; ts: bigint };
    const candidates: Candidate[] = [];
    for (const v of versionsOfKey) {
      const ts = parseTimestamp(v.versionId);
      if (ts !== undefined && ts <= snapshotBigInt) {
        candidates.push({ versionId: v.versionId!, isDelete: false, ts });
      }
    }
    for (const d of deletesOfKey) {
      const ts = parseTimestamp(d.versionId);
      if (ts !== undefined && ts <= snapshotBigInt) {
        candidates.push({ versionId: d.versionId!, isDelete: true, ts });
      }
    }
    candidates.sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0));

    const top = candidates[0];
    if (top) {
      if (top.isDelete) {
        return {
          error: new Error(
            `Object "${path}" did not exist at snapshot version ${options.snapshotVersion}`
          ),
        };
      }
      return { versionId: top.versionId };
    }

    // No candidate yet. If this page had no rows for our key after
    // we'd already started seeing it, pagination has moved past the
    // key — no older versions are coming.
    if (sawTargetKey && versionsOfKey.length === 0 && deletesOfKey.length === 0)
      break;
    if (!page?.hasMore) break;

    keyMarker = page.nextKeyMarker;
    versionIdMarker = page.nextVersionIdMarker;
  }

  return {
    error: new Error(
      `Object "${path}" did not exist at snapshot version ${options.snapshotVersion}`
    ),
  };
}

function parseTimestamp(value: string | undefined): bigint | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}
