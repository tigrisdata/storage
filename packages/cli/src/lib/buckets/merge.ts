import { getStorageConfig } from '@auth/provider.js';
import { getBucketInfo, mergeFork } from '@tigrisdata/storage';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'merge');

export default async function merge(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);
  const fork = getOption<string>(options, ['fork']);
  let into = getOption<string>(options, ['into', 'source']);
  const fromSnapshot = getOption<string>(options, [
    'from-snapshot',
    'fromSnapshot',
    'from-snap',
  ]);
  const force = getOption<boolean>(options, ['yes', 'y']);

  if (!fork) {
    failWithError(context, 'Fork bucket name is required');
  }

  const config = await getStorageConfig();

  // Resolve the merge target. The gateway requires the target to be the fork's
  // direct parent, so default to it unless --into overrides.
  if (!into) {
    const { data: info, error: infoError } = await getBucketInfo(fork, {
      config,
    });
    if (infoError) {
      failWithError(context, infoError);
    }
    const parent = info?.forkInfo?.parents?.[0]?.bucketName;
    if (!parent) {
      failWithError(
        context,
        `'${fork}' is not a fork or its source bucket could not be determined. Pass --into <source-bucket>.`
      );
    }
    into = parent;
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Merge fork '${fork}' into source '${into}'? This writes the fork's changes into '${into}'.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const { data, error } = await mergeFork(fork, into, {
    ...(fromSnapshot ? { forkSnapshot: fromSnapshot } : {}),
    config,
  });

  if (error) {
    failWithError(context, error);
  }

  const snapshotVersion = data?.snapshotVersion ?? '';

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { fork, into });
    const output: Record<string, unknown> = {
      action: 'merged',
      fork,
      into,
      snapshotVersion,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  printSuccess(context, { fork, into, snapshotVersion });
  printNextActions(context, { fork, into });
}
