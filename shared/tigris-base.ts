import { createSessionCache } from './session-cache';
import type { TigrisInit, TigrisResponse, TigrisSession } from './types';

/**
 * Auth fields resolved from a {@link TigrisInit}. All fields are
 * optional — the bare functions are responsible for validating that
 * the right combination is present for the call they're servicing.
 */
export type ResolvedAuthFields = {
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  organizationId?: string;
};

/**
 * Per-call options for a class method that wraps a bare function.
 * Drops `config` (provided by the constructor) so the call-site
 * options stay focused on per-call concerns.
 */
export type Scoped<T> = Omit<T, 'config'>;

/**
 * Shared base for {@link import('@tigrisdata/storage').Tigris} and
 * {@link import('@tigrisdata/iam').TigrisIAM}. Owns the `TigrisInit`,
 * wires the session cache when auth is a resolver function, and
 * exposes {@link resolveAuthFields} so subclasses can build their
 * package-specific config objects.
 *
 * The constructor is lenient — no validation, no throws. Subclasses
 * delegate validation to the bare functions they wrap, which return
 * `{ error }` for missing or malformed fields.
 */
export abstract class TigrisBase {
  protected init: TigrisInit;
  #getSession?: () => Promise<TigrisResponse<TigrisSession>>;

  constructor(init: TigrisInit) {
    this.init = init;
    if (init && typeof init.auth === 'function') {
      this.#getSession = createSessionCache(init.auth);
    }
  }

  protected async resolveAuthFields(): Promise<
    TigrisResponse<ResolvedAuthFields>
  > {
    const auth = this.init?.auth;

    if (typeof auth === 'function') {
      const { data: session, error } = await this.#getSession!();
      if (error) return { error };
      return {
        data: {
          sessionToken: session.sessionToken,
          organizationId: session.organizationId,
        },
      };
    }

    if (auth && typeof auth === 'object') {
      if ('accessKeyId' in auth) {
        return {
          data: {
            accessKeyId: auth.accessKeyId,
            secretAccessKey: auth.secretAccessKey,
            sessionToken: auth.sessionToken,
          },
        };
      }
      if ('sessionToken' in auth) {
        return {
          data: {
            sessionToken: auth.sessionToken,
            organizationId: auth.organizationId,
          },
        };
      }
    }

    return { data: {} };
  }
}
