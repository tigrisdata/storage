import enquirer from 'enquirer';

const { prompt } = enquirer;

import { getStorageConfig, requireOAuthLogin } from '@auth/provider.js';
import {
  clearSelectedOrganization,
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
  printEmpty,
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

  // The gateway refuses these too, but by id rather than by name.
  if (org.id.startsWith('flyio_')) {
    failWithError(
      context,
      'Organization deletion is not available for Fly.io organizations. Your resources are managed through Fly.io.'
    );
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

  const { error: deleteError } = await deleteOrganization(org.id, { config });

  if (deleteError) {
    failWithError(context, deleteError);
  }

  // Keep the cached organization list honest. If the deleted organization
  // was the active one, move on to the first remaining one right away: every
  // command needs an active organization, `orgs list` included.
  const remaining = orgs.filter((o) => o.id !== org.id);
  await storeOrganizations(remaining);
  const wasSelected = current === org.id;
  const next = wasSelected ? remaining[0] : undefined;
  if (wasSelected) {
    if (next) {
      await storeSelectedOrganization(next.id);
    } else {
      await clearSelectedOrganization();
    }
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'deleted',
        name: org.name,
        id: org.id,
        ...(wasSelected ? { activeOrganization: next?.id ?? null } : {}),
      })
    );
  }

  printSuccess(context, { name: org.name });
  if (next) {
    printHint(context, { next: next.name, nextId: next.id });
  } else if (wasSelected) {
    printEmpty(context);
  }
  printNextActions(context);
}

/** Let the user choose an organization; outside a terminal, ask for the ID. */
async function pick(
  orgs: Organization[],
  current: string | null
): Promise<Organization | undefined> {
  if (orgs.length === 0) return undefined;

  requireInteractive('Provide the organization ID as a positional argument');

  const { selected } = await prompt<{ selected: string }>({
    type: 'select',
    name: 'selected',
    message: 'Select the organization to delete:',
    choices: orgs.map((org) => ({
      name: org.id,
      message: `${org.name} (${org.id})`,
      hint: org.id === current ? 'currently selected' : undefined,
    })),
  });

  return orgs.find((org) => org.id === selected);
}
