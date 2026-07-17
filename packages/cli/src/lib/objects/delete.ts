import { getStorageConfig } from '@auth/provider.js';
import { listVersions, remove } from '@tigrisdata/storage';
import {
  exitWithError,
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import { resolveObjectArgs } from '@utils/path.js';

const context = msg('objects', 'delete');

type Target = { key: string; versionId?: string };

export default async function deleteObject(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const bucketArg = getOption<string>(options, ['bucket']);
  const keysArg = getOption<string | string[]>(options, ['key']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);
  const versionId = getOption<string>(options, ['version-id', 'versionId']);
  const allVersions = !!getOption<boolean>(options, [
    'all-versions',
    'allVersions',
  ]);

  if (!bucketArg) {
    failWithError(context, 'Bucket name or path is required');
  }

  if (versionId && allVersions) {
    failWithError(context, 'Cannot use --version-id with --all-versions');
  }

  const resolved = resolveObjectArgs(bucketArg);
  const bucket = resolved.bucket;
  const keys = keysArg || resolved.key || undefined;

  if (!keys) {
    failWithError(context, 'Object key is required');
  }

  const config = await getStorageConfig();
  const bucketConfig = { ...config, bucket };
  const keyList = Array.isArray(keys) ? keys : [keys];

  if (versionId && keyList.length > 1) {
    failWithError(
      context,
      '--version-id targets a single object; pass exactly one key'
    );
  }

  // Resolve the list of (key, versionId?) targets to delete. By
  // default we issue an unversioned DELETE per key (server creates a
  // delete marker on versioned buckets). --version-id hard-deletes
  // one specific version. --all-versions enumerates every version
  // and every delete marker for each key and hard-deletes them all.
  const targets: Target[] = [];
  if (allVersions) {
    for (const key of keyList) {
      let matched = 0;
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;
      // listVersions is paginated; walk every page so we don't
      // leave older history behind on heavily-versioned keys.
      // ListObjectVersions returns entries in (key asc, version-id
      // desc) order. Once we see a key that sorts after the target,
      // no later page can contain another match — bail out so we
      // don't issue thousands of requests just to walk past every
      // `a*` key when the user asked for `a`.
      let pastTarget = false;
      // Drive loop continuation off the explicit `hasMore` flag,
      // not marker truthiness. A destructive bulk-delete must never
      // silently stop because the server reported more pages but
      // omitted a continuation token — bail loudly instead so the
      // user doesn't end up with half-deleted history.
      for (;;) {
        const { data, error } = await listVersions({
          prefix: key,
          ...(keyMarker ? { keyMarker } : {}),
          ...(versionIdMarker ? { versionIdMarker } : {}),
          config: bucketConfig,
        });
        if (error) {
          failWithError(context, error);
        }
        // `prefix` is a loose filter — listVersions returns any key
        // that starts with `key`. Exact-match before queueing for
        // deletion so we don't nuke a sibling like `foo.txt.bak`
        // when the user asked for `foo.txt`.
        for (const v of data.versions) {
          if (v.name === key) {
            targets.push({ key, versionId: v.versionId });
            matched++;
          } else if (v.name > key) {
            pastTarget = true;
          }
        }
        for (const m of data.deleteMarkers) {
          if (m.name === key) {
            targets.push({ key, versionId: m.versionId });
            matched++;
          } else if (m.name > key) {
            pastTarget = true;
          }
        }
        if (pastTarget || !data.hasMore) break;
        if (!data.nextKeyMarker) {
          failWithError(
            context,
            `listVersions reported more pages but no nextKeyMarker for key '${key}'`
          );
        }
        keyMarker = data.nextKeyMarker;
        versionIdMarker = data.nextVersionIdMarker;
      }

      if (matched === 0) {
        failWithError(
          context,
          `No versions or delete markers found for key '${key}'`
        );
      }
    }
  } else if (versionId) {
    targets.push({ key: keyList[0], versionId });
  } else {
    for (const key of keyList) targets.push({ key });
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const label = allVersions
      ? `Hard-delete ${targets.length} version(s) and delete marker(s) for ${keyList.length} object(s) from '${bucket}'?`
      : versionId
        ? `Hard-delete version '${versionId}' of '${keyList[0]}' from '${bucket}'?`
        : `Delete ${keyList.length} object(s) from '${bucket}'?`;
    const confirmed = await confirm(label);
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: Target[] = [];
  const errors: { key: string; versionId?: string; error: string }[] = [];
  for (const target of targets) {
    const { error } = await remove(target.key, {
      ...(target.versionId ? { versionId: target.versionId } : {}),
      config: bucketConfig,
    });

    if (error) {
      printFailure(context, error.message, target);
      errors.push({ ...target, error: error.message });
    } else {
      deleted.push(target);
      printSuccess(context, target);
    }
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { bucket });
    const jsonOutput: Record<string, unknown> = {
      action: 'deleted',
      bucket,
      // `keys` is kept as a flat string[] for backward compatibility
      // with consumers that predate versioning support. `deleted`
      // carries the richer (key, versionId?) shape for new callers.
      keys: deleted.map((d) => d.key),
      deleted,
      errors,
    };
    if (nextActions.length > 0) jsonOutput.nextActions = nextActions;
    console.log(JSON.stringify(jsonOutput));
  }

  if (errors.length > 0) {
    exitWithError(errors[0].error, context);
  }

  printNextActions(context, { bucket });
}
