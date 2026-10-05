import enquirer from 'enquirer';

const { prompt } = enquirer;

import { flyOrganizationNotice, isFlyOrganizationId } from '@auth/fly.js';
import { getStorageConfig, requireOAuthLogin } from '@auth/provider.js';
import {
  getSelectedOrganization,
  storeOrganizations,
  storeSelectedOrganization,
} from '@auth/storage.js';
import {
  deleteOrganization,
  listOrganizations,
  type Organization,
} from '@tigrisdata/iam';
import { exitWithError, failWithError, printNextActions } from '@utils/exit.js';
import { confirm, requireInteractive } from '@utils/interactive.js';
import {
  msg,
  printFailure,
  printHint,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('organizations', 'delete');

export default async function deleteOrg(options: Record<string, unknown>) {
  printStart(context);

  if (requireOAuthLogin('Organization deletion')) return;

  const format = getFormat(options);
  const id = getOption<string>(options, ['id']);
  const force = getOption<boolean>(options, ['yes', 'y', 'force']);

  const config = await getStorageConfig();

  const { data, error } = await listOrganizations({ config });

  if (error) {
    failWithError(context, error);
  }

  const orgs = data?.organizations ?? [];
  const current = getSelectedOrganization();

  // Organization names are not unique, so only an ID identifies one; with
  // no ID the user picks from the list instead.
  const org = id ? orgs.find((o) => o.id === id) : await pick(orgs, current);

  if (!org) {
    if (orgs.length === 0) {
      failWithError(context, 'No organizations found');
    }
    const availableOrgs = orgs
      .map((o) => `   - ${o.name} (${o.id})`)
      .join('\n');
    printFailure(
      context,
      `Organization "${id}" not found\n\nAvailable organizations:\n${availableOrgs}`
    );
    exitWithError(`Organization "${id}" not found`, context);
  }

  // A failure, not a notice-and-return: nothing was deleted, so the exit code
  // must say so, and in JSON mode the reason belongs in the JSON error.
  if (isFlyOrganizationId(org.id)) {
    failWithError(context, flyOrganizationNotice('Organization deletion'));
  }

  // Every command needs an organization to act on, including the ones that
  // would create or select another; the last one stays.
  if (orgs.length === 1) {
    failWithError(context, 'Cannot delete your last organization');
  }

  if (!force) {
    requireInteractive('Use --yes to skip confirmation');
    const confirmed = await confirm(
      `Delete organization '${org.name}' (${org.id})? This cannot be undone.`
    );
    if (!confirmed) {
      console.log('Aborted');
      return;
    }
  }

  // One attempt only: a retried DELETE after the gateway already committed
  // the first one would report "not found" for a deletion that succeeded.
  const { error: deleteError } = await deleteOrganization(org.id, {
    config: { ...config, retry: false },
  });

  if (deleteError) {
    failWithError(context, deleteError);
  }

  // Keep the cached organization list honest. If the deleted organization
  // was the active one, move on right away: to a Tigris organization when
  // one remains, since most commands need one, else to whatever is left.
  const remaining = orgs.filter((o) => o.id !== org.id);
  await storeOrganizations(remaining);
  const wasSelected = current === org.id;
  const next = wasSelected
    ? (remaining.find((o) => !isFlyOrganizationId(o.id)) ?? remaining[0])
    : undefined;
  if (next) {
    await storeSelectedOrganization(next.id);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'deleted',
        name: org.name,
        id: org.id,
        activeOrganization: next?.id ?? current,
      })
    );
  }

  printSuccess(context, { name: org.name });
  if (next) {
    printHint(context, { next: next.name, nextId: next.id });
  }
  printNextActions(context);
}

/** Let the user choose an organization; outside a terminal, ask for the ID. */
async function pick(
  orgs: Organization[],
  current: string | null
): Promise<Organization | undefined> {
  // Fly.io organizations cannot be deleted from here, so they are not offered.
  const deletable = orgs.filter((org) => !isFlyOrganizationId(org.id));
  if (orgs.length === 0) return undefined;
  if (deletable.length === 0) {
    failWithError(
      context,
      'Your organizations are all managed through Fly.io; visit https://fly.io to manage them'
    );
  }

  requireInteractive('Provide the organization ID as a positional argument');

  const { selected } = await prompt<{ selected: string }>({
    type: 'select',
    name: 'selected',
    message: 'Select the organization to delete:',
    choices: deletable.map((org) => ({
      name: org.id,
      message: `${org.name} (${org.id})`,
      hint: org.id === current ? 'currently selected' : undefined,
    })),
  });

  return deletable.find((org) => org.id === selected);
}
