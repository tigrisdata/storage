import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

vi.mock('enquirer', () => ({
  default: { prompt: vi.fn() },
}));
vi.mock('@auth/provider.js', () => ({
  getStorageConfig: vi.fn(async () => ({ sessionToken: 'tok' })),
  requireOAuthLogin: vi.fn(() => false),
}));
vi.mock('@auth/storage.js', () => ({
  getSelectedOrganization: vi.fn(() => 'org-b'),
  storeOrganizations: vi.fn(async () => {}),
  storeSelectedOrganization: vi.fn(async () => {}),
}));
vi.mock('@tigrisdata/iam', () => ({
  deleteOrganization: vi.fn(async () => ({ data: { id: 'org-a' } })),
  listOrganizations: vi.fn(async () => ({
    data: {
      organizations: [
        { id: 'org-a', name: 'alpha' },
        { id: 'org-b', name: 'beta' },
        { id: 'flyio_123', name: 'fly-org' },
      ],
    },
  })),
}));
vi.mock('@utils/interactive.js', () => ({
  confirm: vi.fn(async () => true),
  requireInteractive: vi.fn(),
}));

import { requireOAuthLogin } from '@auth/provider.js';
import {
  getSelectedOrganization,
  storeOrganizations,
  storeSelectedOrganization,
} from '@auth/storage.js';
import { deleteOrganization, listOrganizations } from '@tigrisdata/iam';
import { confirm, requireInteractive } from '@utils/interactive.js';
import enquirer from 'enquirer';
import deleteOrg from '../../../src/lib/organizations/delete.js';
import type { Specs } from '../../../src/types.js';
import { setSpecs } from '../../../src/utils/specs.js';

setSpecs(
  YAML.parse(readFileSync(join(process.cwd(), 'src/specs.yaml'), 'utf8'), {
    schema: 'core',
  }) as Specs
);

class ExitSignal extends Error {}

let stdout: string[];
let stderr: string[];

beforeEach(() => {
  // Clears calls, not implementations: per-test overrides below use `…Once`.
  vi.clearAllMocks();
  stdout = [];
  stderr = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    stdout.push(args.join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    stderr.push(args.join(' '));
  });
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new ExitSignal();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('orgs delete', () => {
  it('deletes by id after confirmation and prunes the cached list', async () => {
    await deleteOrg({ id: 'org-a' });

    expect(enquirer.prompt).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      "Delete organization 'alpha' (org-a)? This cannot be undone."
    );
    expect(deleteOrganization).toHaveBeenCalledWith('org-a', {
      config: { sessionToken: 'tok' },
    });
    expect(storeOrganizations).toHaveBeenCalledWith([
      { id: 'org-b', name: 'beta' },
      { id: 'flyio_123', name: 'fly-org' },
    ]);
    // org-b was selected, not org-a: the selection stays.
    expect(storeSelectedOrganization).not.toHaveBeenCalled();
  });

  it('lets the user pick from the list when no id is given', async () => {
    vi.mocked(enquirer.prompt).mockResolvedValueOnce({ selected: 'org-a' });
    await deleteOrg({ yes: true });

    expect(requireInteractive).toHaveBeenCalledWith(
      'Provide the organization ID as a positional argument'
    );
    expect(enquirer.prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'select',
        // The Fly.io organization is not offered: it cannot be deleted here.
        choices: [
          expect.objectContaining({ name: 'org-a', message: 'alpha (org-a)' }),
          expect.objectContaining({
            name: 'org-b',
            message: 'beta (org-b)',
            hint: 'currently selected',
          }),
        ],
      })
    );
    expect(deleteOrganization).toHaveBeenCalledWith('org-a', {
      config: { sessionToken: 'tok' },
    });
  });

  it('asks for the id instead of picking when there is no terminal', async () => {
    vi.mocked(requireInteractive).mockImplementationOnce(() => {
      throw new ExitSignal();
    });
    await expect(deleteOrg({ yes: true })).rejects.toThrow(ExitSignal);
    expect(enquirer.prompt).not.toHaveBeenCalled();
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it('does not accept a name, since names are not unique', async () => {
    await expect(deleteOrg({ id: 'alpha', yes: true })).rejects.toThrow(
      ExitSignal
    );
    expect(stderr.join('\n')).toContain('Organization "alpha" not found');
    expect(stderr.join('\n')).toContain('alpha (org-a)');
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it('skips the prompt with --yes and always reports the active organization', async () => {
    await deleteOrg({ id: 'org-a', yes: true, json: true });
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteOrganization).toHaveBeenCalledOnce();
    expect(JSON.parse(stdout[0])).toMatchObject({
      activeOrganization: 'org-b',
    });
  });

  it('moves on to the first remaining organization when the active one is deleted', async () => {
    vi.mocked(getSelectedOrganization).mockReturnValueOnce('org-a');
    await deleteOrg({ id: 'org-a', yes: true, json: true });
    expect(storeSelectedOrganization).toHaveBeenCalledWith('org-b');
    expect(JSON.parse(stdout[0])).toEqual({
      action: 'deleted',
      name: 'alpha',
      id: 'org-a',
      activeOrganization: 'org-b',
    });
  });

  it('refuses to delete the last organization', async () => {
    vi.mocked(listOrganizations).mockResolvedValueOnce({
      data: { organizations: [{ id: 'org-a', name: 'alpha', slug: 'alpha' }] },
    });
    await expect(deleteOrg({ id: 'org-a', yes: true })).rejects.toThrow(
      ExitSignal
    );
    expect(stderr.join('\n')).toContain('Cannot delete your last organization');
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it('counts a Fly.io organization as one that remains', async () => {
    vi.mocked(listOrganizations).mockResolvedValueOnce({
      data: {
        organizations: [
          { id: 'org-a', name: 'alpha', slug: 'alpha' },
          { id: 'flyio_123', name: 'fly-org', slug: 'fly' },
        ],
      },
    });
    vi.mocked(getSelectedOrganization).mockReturnValueOnce('org-a');
    await deleteOrg({ id: 'org-a', yes: true, json: true });
    expect(deleteOrganization).toHaveBeenCalledOnce();
    // Nothing else is left to hand the selection to.
    expect(storeSelectedOrganization).toHaveBeenCalledWith('flyio_123');
  });

  it('hands the selection to the first remaining Tigris organization, skipping Fly.io', async () => {
    vi.mocked(listOrganizations).mockResolvedValueOnce({
      data: {
        organizations: [
          { id: 'org-a', name: 'alpha', slug: 'alpha' },
          { id: 'flyio_123', name: 'fly-org', slug: 'fly' },
          { id: 'org-b', name: 'beta', slug: 'beta' },
        ],
      },
    });
    vi.mocked(getSelectedOrganization).mockReturnValueOnce('org-a');
    await deleteOrg({ id: 'org-a', yes: true, json: true });
    expect(storeSelectedOrganization).toHaveBeenCalledWith('org-b');
    expect(JSON.parse(stdout[0])).toMatchObject({
      activeOrganization: 'org-b',
    });
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await deleteOrg({ id: 'org-a' });
    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(stdout).toContain('Aborted');
  });

  it('refuses a Fly.io organization as a failure, with the usual notice', async () => {
    await expect(deleteOrg({ id: 'flyio_123', yes: true })).rejects.toThrow(
      ExitSignal
    );
    expect(stderr.join('\n')).toContain(
      'Organization deletion is not available for Fly.io organizations'
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(deleteOrganization).not.toHaveBeenCalled();
  });

  it('keeps the Fly.io refusal machine-readable under --json', async () => {
    globalThis.__TIGRIS_JSON_MODE = true;
    try {
      await expect(
        deleteOrg({ id: 'flyio_123', yes: true, json: true })
      ).rejects.toThrow(ExitSignal);
    } finally {
      globalThis.__TIGRIS_JSON_MODE = false;
    }
    expect(stdout).toEqual([]);
    const errorLine = stderr.find((line) => line.startsWith('{'));
    expect(errorLine).toBeDefined();
    expect(JSON.parse(errorLine as string).error.message).toContain(
      'not available for Fly.io'
    );
  });

  it('has nothing to offer when every organization is Fly.io', async () => {
    vi.mocked(listOrganizations).mockResolvedValueOnce({
      data: {
        organizations: [{ id: 'flyio_123', name: 'fly-org', slug: 'fly' }],
      },
    });
    await expect(deleteOrg({ yes: true })).rejects.toThrow(ExitSignal);
    expect(stderr.join('\n')).toContain('managed through Fly.io');
    expect(enquirer.prompt).not.toHaveBeenCalled();
  });

  it("surfaces the gateway's reason when the organization is not empty", async () => {
    vi.mocked(deleteOrganization).mockResolvedValueOnce({
      error: new Error('namespace has 2 buckets'),
    });
    await expect(deleteOrg({ id: 'org-a', yes: true })).rejects.toThrow(
      ExitSignal
    );
    expect(stderr.join('\n')).toContain('namespace has 2 buckets');
    expect(storeOrganizations).not.toHaveBeenCalled();
  });

  it('stops when not logged in with OAuth', async () => {
    vi.mocked(requireOAuthLogin).mockReturnValueOnce(true);
    await deleteOrg({ id: 'org-a', yes: true });
    expect(deleteOrganization).not.toHaveBeenCalled();
  });
});
