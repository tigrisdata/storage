import { getStorageConfig } from '@auth/provider.js';
import { deleteBucketSnapshot } from '@tigrisdata/storage';
import {
  exitWithError,
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import {
  msg,
  printFailure,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('snapshots', 'delete');

export default async function deleteSnapshot(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const versions = getOption<string | string[]>(options, ['version']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  if (!versions) {
    failWithError(context, 'Snapshot version is required');
  }

  const versionList = (Array.isArray(versions) ? versions : [versions]).filter(
    (version) => version.length > 0
  );

  if (versionList.length === 0) {
    failWithError(context, 'Snapshot version is required');
  }

  const config = await getStorageConfig();

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Delete ${versionList.length} snapshot(s) from '${name}'? This cannot be undone.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  const deleted: string[] = [];
  const errors: { version: string; error: string }[] = [];
  for (const version of versionList) {
    const { error } = await deleteBucketSnapshot(name, version, { config });

    if (error) {
      printFailure(context, error.message, { name, version });
      errors.push({ version, error: error.message });
    } else {
      deleted.push(version);
      printSuccess(context, { name, version });
    }
  }

  if (format === 'json') {
    const nextActions = getSuccessNextActions(context, { name });
    const output: Record<string, unknown> = {
      action: 'deleted',
      bucket: name,
      versions: deleted,
      errors,
    };
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  }

  if (errors.length > 0) {
    exitWithError(errors[0].error, context);
  }

  printNextActions(context, { name });
}
