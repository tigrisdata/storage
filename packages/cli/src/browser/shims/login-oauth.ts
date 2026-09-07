/**
 * Replaces `lib/login/oauth.ts` in the browser build.
 *
 * Only the OAuth *mechanism* changes: the CLI's device flow cannot run in a
 * page, because `auth.storage.tigrisdata.io/oauth/device/code` sends no CORS
 * headers. The host performs the login instead (Auth0's SPA SDK) and stores
 * the result through the CLI's own credential store.
 *
 * Deliberately not substituting `lib/login/select.ts`: that is the picker
 * between OAuth and access keys, and both branches work here — the access-key
 * branch needs nothing special, so the CLI keeps offering the real choice.
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
