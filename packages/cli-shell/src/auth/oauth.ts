/**
 * Browser login with Auth0's official SPA SDK (Authorization Code + PKCE).
 *
 * The Node CLI uses the Device Authorization Grant, which cannot work from a
 * page: `auth.storage.tigrisdata.io/oauth/device/code` returns no
 * `Access-Control-Allow-Origin`. `/oauth/token` and `/userinfo` are open, so
 * once the popup mints a token the CLI's own refresh and org lookup keep
 * working.
 *
 * The token is handed to the CLI's credential store, so `whoami`, `logout` and
 * every authenticated command see it without special-casing.
 */

import {
  type Auth0Client,
  createAuth0Client,
  GenericError,
} from '@auth0/auth0-spa-js';
import {
  getSessionState,
  renewOAuthSession,
  setOAuthSession,
} from '@tigrisdata/cli/browser';
import type { ReplIO } from '../repl/io.js';

export interface Auth0Options {
  domain?: string;
  clientId?: string;
  audience?: string;
  /** Namespace the Tigris organization claims live under on /userinfo. */
  claimsNamespace?: string;
}

export interface Organization {
  id: string;
  name: string;
  /** Present on /userinfo claims; the id stands in when it is not. */
  slug?: string;
}

const DEFAULTS = {
  domain: 'auth.storage.tigrisdata.io',
  clientId: 'FKXunmhaaBZOYXjNYLIU8Fi2jIqpT7DR',
  audience: 'https://tigris-os-api',
  claimsNamespace: 'https://tigris',
} as const;

const SCOPE = 'openid profile email offline_access';

/**
 * One client per config, reused.
 *
 * `localstorage` + `useRefreshTokens` lets the SDK persist the session and
 * renew it silently, so a reload does not mean signing in again. This is the
 * SDK's own cache — no custom one — so we are not reimplementing its storage
 * or reaching into it for the refresh token.
 *
 * Access keys are deliberately *not* persisted: those go through
 * `setAccessKeySession`, which writes to the CLI's in-memory volume and is
 * gone on reload.
 */
const clients = new Map<string, Promise<Auth0Client>>();

function auth0ClientFor(config: ResolvedAuth0Config): Promise<Auth0Client> {
  const key = `${config.domain}|${config.clientId}|${config.audience}`;

  let client = clients.get(key);
  if (!client) {
    client = createAuth0Client({
      domain: config.domain,
      clientId: config.clientId,
      cacheLocation: 'localstorage',
      // Requires "Allow Offline Access" on the API and the Refresh Token grant
      // on the application. The iframe fallback is deliberately left off
      // (`useRefreshTokensFallback` defaults to false): it depends on
      // third-party cookies, and a real refresh token is the more robust path.
      // A tenant without offline access fails loudly instead.
      useRefreshTokens: true,
      authorizationParams: {
        audience: config.audience,
        scope: SCOPE,
        redirect_uri: window.location.origin,
      },
    }).catch((error: unknown) => {
      // Cached before it settled, so a failed init — offline discovery, a
      // network blip — must not be handed to every later login, restore and
      // renew until the page is reloaded.
      clients.delete(key);
      throw error;
    });
    clients.set(key, client);
  }

  return client;
}

export interface ResolvedAuth0Config {
  domain: string;
  clientId: string;
  audience: string;
  claimsNamespace: string;
}

export function resolveAuth0Config(
  options?: Auth0Options
): ResolvedAuth0Config {
  return { ...DEFAULTS, ...options };
}

/**
 * Environment the CLI needs so it agrees with whoever minted the token.
 *
 * `verifyIdToken` checks the ID token's `aud` against its own configured
 * client id, which defaults to the *device-flow* client. Tokens here come from
 * the SPA client, so without this the CLI rejects every token it is handed.
 */
export function auth0Env(config: ResolvedAuth0Config): Record<string, string> {
  return {
    TIGRIS_AUTH0_DOMAIN: config.domain,
    TIGRIS_AUTH0_CLIENT_ID: config.clientId,
    TIGRIS_AUTH0_AUDIENCE: config.audience,
    TIGRIS_CLAIMS_NAMESPACE: config.claimsNamespace,
  };
}

export interface LoginOptions extends Auth0Options {
  io: ReplIO;
  /**
   * Resolves the parsed CLI specs, so post-login messages match
   * `tigris login oauth` exactly instead of being a copy that drifts. Lazy
   * because the login function is built before the engine that owns them.
   */
  specs?: () => unknown;
}

/** Returns a `login()` suitable for `ShellEngineOptions.login`. */
/**
 * Mint tokens from an authenticated Auth0 client and install them into the
 * CLI's credential store. Shared by a fresh login and by session restore.
 */
interface MintedTokens {
  accessToken: string;
  idToken?: string;
  expiresAt?: number;
}

/**
 * Tokens from the SDK, in the shape the CLI's store takes.
 *
 * `detailedResponse` gives the id_token and the real expiry. Both matter:
 * the CLI's `whoami` reads its identity out of the ID token, and without a
 * true `expires_in` we would be guessing when the session lapses.
 *
 * `renew` forces a real refresh. The SDK otherwise hands back its cached
 * token until a minute before expiry, which is no use to a CLI that asks
 * five minutes before.
 */
async function mintTokens(
  auth0: Auth0Client,
  config: ResolvedAuth0Config,
  { renew = false } = {}
): Promise<MintedTokens> {
  const token = await auth0.getTokenSilently({
    authorizationParams: { audience: config.audience },
    detailedResponse: true,
    cacheMode: renew ? 'off' : 'on',
  });

  return {
    accessToken: token.access_token,
    ...(token.id_token ? { idToken: token.id_token } : {}),
    ...(token.expires_in
      ? { expiresAt: Date.now() + token.expires_in * 1000 }
      : {}),
  };
}

async function installSession(
  auth0: Auth0Client,
  config: ResolvedAuth0Config
): Promise<{
  email: string;
  organizations: Organization[];
  active?: Organization;
}> {
  const tokens = await mintTokens(auth0, config);

  const user = await auth0.getUser();
  const email = user?.email ?? user?.name ?? 'unknown';

  const organizations = await fetchOrganizations(
    config.domain,
    config.claimsNamespace,
    tokens.accessToken
  );

  // Every authenticated CLI call needs an organization, so a session without
  // one is not a success with a caveat — it is a failure. Storing it would
  // make login report success and the very next command fail with
  // "No organization selected".
  if (organizations.length === 0) {
    throw new Error(
      'Signed in, but no organizations were returned for this account. Try again, or check the account has access to an organization.'
    );
  }

  // The CLI selects the first organization on a fresh login and prints a hint
  // when there are more; it does not prompt. A repeat login within the page
  // must not silently undo a `tigris orgs select` made since. After a reload
  // the CLI's record is gone with the in-memory volume, so the first
  // organization is selected again, as on a fresh CLI login — deliberately,
  // nothing about the organization is persisted.
  const previous = getSessionState().organizationId;
  const active =
    organizations.find((org) => org.id === previous) ?? organizations[0];

  await setOAuthSession({
    ...tokens,
    // /userinfo does not always carry a slug; the id stands in for it.
    organizations: organizations.map((org) => ({
      ...org,
      slug: org.slug ?? org.id,
    })),
    ...(active ? { selectedOrganization: active.id } : {}),
  });

  return { email, organizations, ...(active ? { active } : {}) };
}

/**
 * Re-install a persisted Auth0 session into the CLI's credential store.
 *
 * The SDK remembers the session across reloads, but the CLI's store lives on
 * an in-memory volume that does not. Without this, a reload leaves you signed
 * in as far as Auth0 is concerned and signed out as far as the CLI is.
 *
 * Returns false when there is nothing to restore.
 */
export async function restoreAuth0Session(
  options: Auth0Options = {}
): Promise<boolean> {
  const config = resolveAuth0Config(options);

  try {
    const auth0 = await auth0ClientFor(config);
    if (!(await auth0.isAuthenticated())) return false;

    await installSession(auth0, config);
    return true;
  } catch (error) {
    // Only discard a session that genuinely cannot mint a token. A network
    // blip fetching /userinfo would otherwise throw away a perfectly good
    // persisted session and force a full re-login.
    if (isStaleSessionError(error)) await discardSession(config);
    return false;
  }
}

/**
 * Forget the SDK's cached session without contacting Auth0.
 *
 * Exported so `tigris logout` can clear it: the CLI's own logout only knows
 * about its credential store, and leaving the SPA session in `localStorage`
 * means a reload signs the user straight back in.
 */
export async function discardAuth0Session(
  options: Auth0Options = {}
): Promise<void> {
  await discardSession(resolveAuth0Config(options));
}

async function discardSession(config: ResolvedAuth0Config): Promise<void> {
  try {
    const auth0 = await auth0ClientFor(config);
    await auth0.logout({ openUrl: false });
  } catch {
    // Nothing to discard.
  }
}

/**
 * Renew the CLI's OAuth session through the SDK.
 *
 * The CLI refreshes a token within five minutes of expiry by posting a refresh
 * token to Auth0 — which it does not hold here, because the SDK keeps refresh
 * tokens in its own cache. Its browser build routes that refresh to the host
 * instead (`BrowserHost.refreshSession`), and this is the implementation: a
 * forced refresh off the SDK's cache, re-installed into the CLI's store. It
 * runs whenever the CLI decides to, including mid-command during a long
 * upload, so tokens behave as they do in Node.
 */
export async function renewAuth0Session(
  options: Auth0Options = {}
): Promise<void> {
  const config = resolveAuth0Config(options);
  const auth0 = await auth0ClientFor(config);

  if (!(await auth0.isAuthenticated())) {
    throw new Error(
      'Not authenticated. Please run "tigris login" to authenticate.'
    );
  }

  try {
    // Tokens only, merged over the stored set. The organizations are already
    // there from login or restore, and a /userinfo blip must not leave a
    // near-expired token in place after the SDK has already refreshed; and a
    // refresh response does not always carry an ID token, which `whoami`
    // needs — replacing the set wholesale would wipe it.
    await renewOAuthSession(await mintTokens(auth0, config, { renew: true }));
  } catch (error) {
    if (isStaleSessionError(error)) await discardSession(config);
    throw new Error(explainTokenFailure(error));
  }
}

export function createAuth0Login(options: LoginOptions): () => Promise<void> {
  const config = resolveAuth0Config(options);

  return async () => {
    const { io } = options;
    const auth0 = await auth0ClientFor(config);

    const signIn = () =>
      auth0.loginWithPopup({
        authorizationParams: { audience: config.audience, scope: SCOPE },
      });

    // Skip the popup when the SDK already holds a usable session.
    let interactive = !(await auth0.isAuthenticated());
    if (interactive) {
      io.write('Opening the Tigris login window...\n');
      await signIn();
    }

    let session: Awaited<ReturnType<typeof installSession>>;
    try {
      session = await installSession(auth0, config);
    } catch (error) {
      // A session cached before refresh tokens were in use holds an access
      // token but no refresh token, so `isAuthenticated()` says yes while
      // `getTokenSilently` cannot renew. Auth0 prescribes re-authenticating
      // here rather than failing. Only worth retrying if we did not just
      // sign in.
      if (interactive || !isStaleSessionError(error)) {
        throw new Error(explainTokenFailure(error));
      }

      io.write('Stored session cannot be renewed; signing in again...\n');
      interactive = true;
      await signIn();

      try {
        session = await installSession(auth0, config);
      } catch (retryError) {
        throw new Error(explainTokenFailure(retryError));
      }
    }

    const { email, organizations, active } = session;
    const messages = oauthMessages(options.specs?.());

    io.write(`Logged in as ${email}\n`);

    if (active) {
      io.write(`${interpolate(messages.onSuccess, { org: active.name })}\n`);
    }

    if (organizations.length > 1 && messages.hint) {
      io.write(
        `${interpolate(messages.hint, { count: organizations.length })}\n`
      );
    }
  };
}

/**
 * Auth0 error codes meaning the cached session cannot mint a token and only
 * signing in again will help. `timeout` and plain network failures are
 * deliberately absent: they are transient, and discarding a good session over
 * one would force a needless re-login.
 */
const STALE_SESSION_CODES = new Set([
  // Signed out elsewhere, or the refresh token expired.
  'login_required',
  'consent_required',
  'interaction_required',
  // Cached before refresh tokens were in use.
  'missing_refresh_token',
  // Refresh token revoked or unknown to the tenant.
  'invalid_grant',
]);

const STALE_SESSION_TEXT =
  /login_required|consent_required|interaction_required|missing_refresh_token|Missing Refresh Token|invalid_grant/i;

/** A cached session that exists but cannot mint a token — re-login fixes it. */
function isStaleSessionError(error: unknown): boolean {
  if (error instanceof GenericError)
    return STALE_SESSION_CODES.has(error.error);

  // Anything that is not the SDK's own error class is judged on its text.
  return STALE_SESSION_TEXT.test(messageOf(error));
}

/**
 * Turn an Auth0 token failure into something a user can act on. The SDK's own
 * wording ("Missing Refresh Token") names a mechanism, not a cause — and for
 * any other SDK error the way out is to drop the stored session, which
 * `tigris login` alone will not do while the SDK still reports it signed in.
 */
function explainTokenFailure(error: unknown): string {
  const raw = messageOf(error);

  if (/missing_refresh_token|Missing Refresh Token/i.test(raw)) {
    return `${raw}\n\nThe tenant issued no refresh token and silent auth did not succeed. Enable "Allow Offline Access" on the API in Auth0, or sign in with an access key instead.`;
  }

  if (error instanceof GenericError) {
    return `${raw}\n\nRun "tigris logout" to discard the stored session, then "tigris login" to start a new one.`;
  }

  return raw;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface OauthMessages {
  onSuccess: string;
  hint?: string;
}

/** Read `login oauth`'s messages out of the spec tree, with CLI text as the fallback. */
function oauthMessages(specs: unknown): OauthMessages {
  const fallback: OauthMessages = {
    onSuccess: "Logged in successfully\nOrganization '{{org}}' selected",
    hint: 'You have {{count}} organizations.\nRun "tigris orgs list" to switch.',
  };

  const commands = (specs as { commands?: SpecNode[] } | undefined)?.commands;
  const oauth = commands
    ?.find((command) => command.name === 'login')
    ?.commands?.find((command) => command.name === 'oauth');

  return {
    onSuccess: oauth?.messages?.onSuccess ?? fallback.onSuccess,
    ...(oauth?.messages?.hint !== undefined
      ? { hint: oauth.messages.hint }
      : { hint: fallback.hint }),
  };
}

interface SpecNode {
  name: string;
  commands?: SpecNode[];
  messages?: { onSuccess?: string; hint?: string };
}

/** The CLI's own `{{var}}` substitution, including its literal `\n` handling. */
function interpolate(
  template: string,
  variables: Record<string, string | number>
): string {
  return template
    .replace(/\\n/g, '\n')
    .replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
      variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`
    );
}

async function fetchOrganizations(
  domain: string,
  namespace: string,
  accessToken: string
): Promise<Organization[]> {
  const response = await fetch(`https://${domain}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Could not load your organizations (${response.status} from /userinfo).`
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const claims = data[namespace] as { ns?: Organization[] } | undefined;
  return claims?.ns ?? [];
}
