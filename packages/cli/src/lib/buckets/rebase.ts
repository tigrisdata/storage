import { getStorageConfig } from '@auth/provider.js';
import { rebaseFork } from '@tigrisdata/storage';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'rebase');

export default async function rebase(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const fork = getOption<string>(options, ['fork']);
  const force = getOption<boolean>(options, ['yes', 'y']);

  if (!fork) {
    failWithError(context, 'Fork bucket name is required');
  }

  const config = await getStorageConfig();

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Rebase fork '${fork}' onto the latest state of its source bucket? This updates '${fork}'.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { data, error } = await rebaseFork(fork, { config });

  if (error) {
    failWithError(context, error);
  }

  const snapshotVersion = data?.snapshotVersion ?? '';

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { fork });
    const output: Record<string, unknown> = {
      action: 'rebased',
      fork,
      snapshotVersion,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  printSuccess(context, { fork, snapshotVersion });
  printNextActions(context, { fork });
}
