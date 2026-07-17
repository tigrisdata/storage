import { clearAllData } from '@auth/storage.js';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';

const context = msg('logout');

export default async function logout(
  options: Record<string, unknown> = {}
): Promise<void> {
  printStart(context);

  const format = getFormat(options);

  try {
    // Clear all authentication data
    await clearAllData();

    if (format === 'json') {
      console.log(JSON.stringify({ action: 'logged_out' }));
    }

    printSuccess(context);
  } catch (error) {
    failWithError(context, error);
  }
}
