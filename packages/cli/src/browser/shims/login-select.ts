/**
 * Replaces `lib/login/select.ts` in the browser build.
 *
 * The CLI's `tigris login` asks whether to sign in as a user (OAuth) or as a
 * machine (access key). In a page the answer is almost always OAuth — the
 * host has a real browser session to offer — so `tigris login` goes straight
 * to it. An access key still works the way it does in the CLI: pass
 * `--access-key`/`--access-secret`, or run `tigris login credentials`.
 */

import credentials from '../../lib/login/credentials.js';
import { oauth } from '../../lib/login/oauth.js';

export default async function select(
  options: Record<string, unknown>
): Promise<void> {
  const accessKey =
    options['access-key'] ||
    options.accessKey ||
    options.key ||
    options.Key ||
    options.accesskey;
  const accessSecret =
    options['access-secret'] ||
    options.accessSecret ||
    options.secret ||
    options.Secret ||
    options.accesssecret;

  if (accessKey || accessSecret) {
    await credentials(options);
    return;
  }

  await oauth();
}
