import { failWithError } from '@utils/exit.js';
import {
  msg,
  printAlreadyDone,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat } from '@utils/options.js';
import {
  fetchLatestVersion,
  getUpdateCommand,
  isNewerVersion,
} from '@utils/update-check.js';
import { execSync } from 'child_process';

import { version as currentVersion } from '../../package.json';

const context = msg('update');

export default async function update(
  options: Record<string, unknown> = {}
): Promise<void> {
  const format = getFormat(options);

  printStart(context);

  try {
    // Always fetch fresh when the user explicitly runs `tigris update`
    const latestVersion = await fetchLatestVersion();

    const updateAvailable = isNewerVersion(currentVersion, latestVersion);
    const updateCommand = getUpdateCommand();

    if (format === 'json') {
      console.log(
        JSON.stringify({
          currentVersion,
          latestVersion,
          updateAvailable,
          updateCommand,
        })
      );
      return;
    }

    console.log(`Current version: ${currentVersion}`);

    if (updateAvailable) {
      console.log(`Latest version:  ${latestVersion}`);
      console.log('Updating...');
      execSync(updateCommand, {
        stdio: 'inherit',
        ...(process.platform === 'win32' ? { shell: 'powershell.exe' } : {}),
      });
      printSuccess(context, { latestVersion });
    } else {
      printAlreadyDone(context, { currentVersion });
    }
  } catch (error) {
    failWithError(context, error);
  }
}
