import type { HttpRequest, MiddlewareStack } from '@aws-sdk/types';
import { TigrisHeaders } from '@shared/index';

/**
 * Pin an S3 command to a point-in-time bucket snapshot by attaching the
 * `X-Tigris-Snapshot-Version` header to its request.
 *
 * Registered at the `build` step so the header rides on the request after it
 * has been serialized. Added to the *command's* own middleware stack (not the
 * cached client's), so it only affects this single call. `get`, `head`,
 * `list`, and `restore` all share this exact injection — keep it here rather
 * than copy-pasting the block per operation.
 */
export function addSnapshotVersionMiddleware<
  Input extends object,
  Output extends object,
>(middlewareStack: MiddlewareStack<Input, Output>, snapshotVersion: string) {
  middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers[TigrisHeaders.SNAPSHOT_VERSION] = `${snapshotVersion}`;
      const result = await next(args);
      return result;
    },
    {
      name: 'X-Tigris-Snapshot-Middleware',
      step: 'build',
      override: true,
    }
  );
}

/**
 * Point an S3 command at the bucket's soft-delete view instead of its live
 * objects.
 *
 * On a bucket with soft delete enabled, a delete keeps a recoverable copy that
 * the normal list/version calls no longer report. `X-Tigris-Soft-Delete` swaps
 * the operation over to those copies: `ListObjectsV2` returns the deleted keys,
 * `ListObjectVersions` returns their recoverable versions, and `DeleteObject`
 * with a version purges one for good.
 *
 * The header is not optional on the purge path — a `DeleteObject` aimed at a
 * soft-deleted version without it is rejected with `400 InvalidArgument`.
 * Versioned deletes of a live object's own versions are unaffected.
 */
export function addSoftDeleteMiddleware<
  Input extends object,
  Output extends object,
>(middlewareStack: MiddlewareStack<Input, Output>) {
  middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers[TigrisHeaders.SOFT_DELETE] = 'true';
      return next(args);
    },
    {
      name: 'X-Tigris-Soft-Delete-Middleware',
      step: 'build',
      override: true,
    }
  );
}

/**
 * Turn a `RestoreObject` call into a soft-delete undelete of one specific
 * version, rather than the archive thaw the command normally performs.
 */
export function addSoftDeleteRestoreMiddleware<
  Input extends object,
  Output extends object,
>(middlewareStack: MiddlewareStack<Input, Output>, versionId: string) {
  middlewareStack.add(
    (next) => async (args) => {
      const req = args.request as HttpRequest;
      req.headers[TigrisHeaders.RESTORE_TYPE] = 'soft-delete';
      req.headers[TigrisHeaders.RESTORE_VERSION] = versionId;
      return next(args);
    },
    {
      name: 'X-Tigris-Soft-Delete-Restore-Middleware',
      step: 'build',
      override: true,
    }
  );
}
