/**
 * Replaces `lib/login/oauth.ts` in the browser build.
 *
 * Only the OAuth *mechanism* changes: the CLI's device flow cannot run in a
 * page, because `auth.storage.tigrisdata.io/oauth/device/code` sends no CORS
 * headers. The host performs the login instead (Auth0's SPA SDK) and stores
 * the result through the CLI's own credential store.
 *
 * The picker between OAuth and access keys (`lib/login/select.ts`) is
 * replaced separately, by `login-select.ts`, so that `tigris login` goes
 * straight to OAuth in a page.
 */

import { getHost } from '../host.js';

export async function oauth(): Promise<void> {
  const host = getHost();

  if (!host.login) {
    throw new Error(
      'Not authenticated. Please run "tigris login" or "tigris configure" first.'
    );
  }

  await host.login();
}

export default oauth;
