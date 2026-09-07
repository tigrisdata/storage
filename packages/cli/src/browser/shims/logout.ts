/**
 * Replaces `lib/logout.ts` in the browser build.
 *
 * Identical to the CLI's logout, plus one step: the host is asked to discard
 * whatever browser-side session it holds. The CLI's credential store is only
 * half the state in a browser — an Auth0 SPA session lives in `localStorage`,
 * and leaving it behind means a reload silently signs the user back in.
 */

import { clearAllData } from '../../auth/storage.js';
import { failWithError } from '../../utils/exit.js';
import { msg, printStart, printSuccess } from '../../utils/messages.js';
import { getFormat } from '../../utils/options.js';
import { getHost, hasHost } from '../host.js';

const context = msg('logout');

export default async function logout(
  options: Record<string, unknown> = {}
): Promise<void> {
  printStart(context);

  const format = getFormat(options);

  try {
    await clearAllData();

    if (hasHost()) {
      await getHost().logout?.();
    }

    if (format === 'json') {
      console.log(JSON.stringify({ action: 'logged_out' }));
    }

    printSuccess(context);
  } catch (error) {
    failWithError(context, error);
  }
}
