/**
 * Types for the class-based `TigrisStorage` / `TigrisIAM` clients.
 *
 * Deliberately separate from `../types.ts` (`TigrisConfig` /
 * `TigrisAuthConfig`), which the bare-function API owns. The two type
 * families are structurally similar in places (both end up describing
 * auth/endpoints) but are not meant to evolve together — a class-init
 * concern (e.g. a resolver function auth mode) should never leak into
 * the bare-function config shape, and vice versa.
 */

/** Static access-key credentials, mirrors what the CLI calls "credentials" login. */
export type TigrisCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

/** A session token, scoped to one organization. */
export type TigrisSession = {
  sessionToken: string;
  organizationId: string;
};

/**
 * A session as returned by an async auth resolver — same shape as
 * {@link TigrisSession}, plus when it expires. `expiration` only makes
 * sense here: it's what tells the resolver's session cache when to
 * proactively re-invoke the resolver. A static `TigrisSession` passed
 * directly as `auth` is never refreshed, so it has no use for it.
 */
export type TigrisResolvedSession = TigrisSession & { expiration?: Date };

/**
 * Auth modes accepted by `TigrisStorage`/`TigrisIAM`:
 *  - `TigrisCredentials` — static accessKeyId / secretAccessKey
 *  - `TigrisSession` — static session token + organization id
 *  - `() => Promise<TigrisResolvedSession>` — async resolver, cached
 *    with proactive refresh; use for short-lived sessions from an auth
 *    endpoint that need to survive longer than one call.
 */
export type TigrisAuth =
  | TigrisCredentials
  | TigrisSession
  | (() => Promise<TigrisResolvedSession>);
