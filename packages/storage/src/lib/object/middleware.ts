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
