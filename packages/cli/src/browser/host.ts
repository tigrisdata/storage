/**
 * The host environment a browser-embedded CLI runs against.
 *
 * Shims read the *current* host through `getHost()` rather than taking it as a
 * parameter: the CLI's handlers are reached through commander and have no way
 * to thread a context object down. `runCli()` installs the host for the
 * duration of one invocation.
 *
 * The filesystem is deliberately not part of this interface — it is the
 * process-wide memfs volume in `./volume.js`, which the surrounding shell also
 * mounts, so both see the same bytes.
 */

export interface SelectChoice {
  /** Value handed back to the caller. */
  value: string;
  /** Text shown in the terminal. */
  label: string;
  hint?: string;
}

export interface BrowserHost {
  /** Terminal width, used by the table formatter. Defaults to 120. */
  columns?: number;

  /** Environment variables visible to the CLI. */
  env?: Record<string, string>;

  /**
   * Ask a yes/no question. Backs enquirer's `confirm`; `initial` is what an
   * empty answer means, as in enquirer.
   */
  confirm(message: string, options?: { initial?: boolean }): Promise<boolean>;

  /** Ask for a line of text. Backs enquirer's `input`/`password` prompts. */
  input(
    message: string,
    options?: { password?: boolean; initial?: string }
  ): Promise<string>;

  /**
   * Ask the user to pick from a list. Backs enquirer's `select`; `initial` is
   * the choice an empty answer means — an index, or a choice's value — as in
   * enquirer.
   */
  select(
    message: string,
    choices: SelectChoice[],
    options?: { initial?: number | string }
  ): Promise<string>;

  /**
   * Start an interactive login. Replaces the CLI's device-flow login, which
   * cannot run in a page: `auth.storage.tigrisdata.io/oauth/device/code`
   * returns no `Access-Control-Allow-Origin`. Implementations use Auth0's
   * official SPA SDK and write the result through `auth/storage.ts`.
   */
  login?(): Promise<void>;

  /**
   * Discard any browser-side session the host holds, on `tigris logout`.
   *
   * The CLI's own logout clears its credential store, but it knows nothing
   * about an Auth0 SPA session in `localStorage` — without this, logging out
   * and reloading signs you straight back in.
   */
  logout?(): Promise<void>;

  /** Open a URL — the browser equivalent of the `open` package. */
  openUrl?(url: string): void;

  /**
   * Renew the OAuth session, on demand from the CLI. Its own refresh path
   * posts a refresh token, which it does not hold in a browser — Auth0's SPA
   * SDK keeps that in its own cache. Implementations refresh through the SDK
   * and install the result with `setOAuthSession`. Called when the access
   * token is within five minutes of expiry, including mid-command during a
   * long upload.
   */
  refreshSession?(): Promise<void>;
}

let currentHost: BrowserHost | null = null;

export function setHost(host: BrowserHost | null): void {
  currentHost = host;
}

export function getHost(): BrowserHost {
  if (!currentHost) {
    throw new Error(
      'No browser host installed. Commands must run through runCli() from @tigrisdata/cli/browser.'
    );
  }
  return currentHost;
}

/** True when a host is installed — lets shims degrade instead of throwing. */
export function hasHost(): boolean {
  return currentHost !== null;
}
