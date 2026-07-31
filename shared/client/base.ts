import type { TigrisResponse } from '../types';
import type {
  TigrisAuth,
  TigrisCredentials,
  TigrisSession,
} from './init-types';
import { createSessionCache } from './session-cache';

/**
 * Shared base for `TigrisStorage` and `TigrisIAM`. Owns the init and
 * builds a single resolver function once in the constructor —
 * whichever `auth` mode was passed is resolved to a `TigrisCredentials`
 * or `TigrisSession` up front, so `resolveAuthFields()` has no
 * branching left to do on every call. For a resolver-function `auth`,
 * that resolver is wrapped in a session cache with proactive refresh
 * so repeated calls reuse one resolved session instead of invoking the
 * resolver (and rebuilding a client) every time.
 *
 * Validates `auth`'s shape synchronously in the constructor — an
 * obviously malformed `auth` (missing entirely, or an object matching
 * neither the credentials nor session shape) throws immediately rather
 * than surfacing as a confusing failure from the first method call. An
 * async resolver can't be validated synchronously; its result is
 * trusted until it fails to resolve.
 */
export abstract class TigrisClientBase<TInit extends { auth: TigrisAuth }> {
  protected readonly init: TInit;
  #resolveAuth: () => Promise<
    TigrisResponse<TigrisCredentials | TigrisSession>
  >;

  constructor(init: TInit) {
    validateAuthShape(init?.auth);
    this.init = init;
    this.#resolveAuth = buildAuthResolver(init.auth);
  }

  protected resolveAuthFields() {
    return this.#resolveAuth();
  }
}

function buildAuthResolver(auth: TigrisAuth) {
  if (typeof auth === 'function') {
    const getSession = createSessionCache(auth);
    return async () => {
      const { data: session, error } = await getSession();
      if (error) return { error };
      // Drop `expiration` — it's meaningful to the session cache above,
      // not to the resolved fields callers spread into their config.
      return {
        data: {
          sessionToken: session.sessionToken,
          organizationId: session.organizationId,
        },
      };
    };
  }

  // `auth` is already a TigrisCredentials or TigrisSession here, so it
  // passes through unchanged.
  return async () => ({ data: auth });
}

function validateAuthShape(auth: TigrisAuth | undefined): void {
  if (auth === undefined || auth === null) {
    throw new Error(
      'Tigris client requires an `auth` option: credentials ' +
        '({ accessKeyId, secretAccessKey }), a session ' +
        '({ sessionToken, organizationId }), or an async resolver function.'
    );
  }

  if (typeof auth === 'function') return;

  if ('accessKeyId' in auth) {
    if (!auth.accessKeyId || !auth.secretAccessKey) {
      throw new Error(
        '`auth` with `accessKeyId`/`secretAccessKey` requires both fields to be set.'
      );
    }
    return;
  }

  if ('sessionToken' in auth) {
    if (
      !auth.sessionToken ||
      !('organizationId' in auth) ||
      !auth.organizationId
    ) {
      throw new Error(
        '`auth` with a `sessionToken` requires `organizationId` too.'
      );
    }
    return;
  }

  throw new Error(
    '`auth` must be credentials ({ accessKeyId, secretAccessKey }), a ' +
      'session ({ sessionToken, organizationId }), or an async resolver function.'
  );
}
