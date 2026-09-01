import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BucketShares } from './types';

vi.mock('./info', () => ({ getBucketInfo: vi.fn() }));
vi.mock('./set/set', () => ({ setBucketSettings: vi.fn() }));

const { getBucketInfo } = await import('./info');
const { setBucketSettings } = await import('./set/set');
const { shareBucket } = await import('./share');

const existing: BucketShares = {
  organization: { role: 'ReadOnly' },
  team: [
    { teamId: 'tmid_KEEP', role: 'Editor' },
    { teamId: 'tmid_EDIT', role: 'ReadOnly' },
  ],
  user: [{ userId: 'uid_KEEP', role: 'ReadWrite' }],
};

/** The `shares` array handed to the PATCH helper. */
function sentShares() {
  return vi.mocked(setBucketSettings).mock.calls[0][1]?.body?.shares;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBucketInfo).mockResolvedValue({
    data: { settings: { shares: existing } },
  } as never);
  vi.mocked(setBucketSettings).mockResolvedValue({
    data: { bucket: 'my-bucket', updated: true },
  });
});

describe('shareBucket merge (default)', () => {
  it('keeps targets that were not named', async () => {
    await shareBucket('my-bucket', {
      team: [{ teamId: 'tmid_NEW', role: 'Editor' }],
    });

    expect(sentShares()).toEqual([
      { team_id: 'all', role: 'ReadOnly' },
      { team_id: 'tmid_KEEP', role: 'Editor' },
      { team_id: 'tmid_EDIT', role: 'ReadOnly' },
      { team_id: 'tmid_NEW', role: 'Editor' },
      { user_id: 'uid_KEEP', role: 'ReadWrite' },
    ]);
  });

  it('updates the role of a team that was named, without duplicating it', async () => {
    await shareBucket('my-bucket', {
      team: [{ teamId: 'tmid_EDIT', role: 'Editor' }],
    });

    const teams = sentShares()?.filter((s) => s.team_id === 'tmid_EDIT');
    expect(teams).toEqual([{ team_id: 'tmid_EDIT', role: 'Editor' }]);
  });

  it('keeps the organization grant when only a team is named', async () => {
    await shareBucket('my-bucket', {
      team: [{ teamId: 'tmid_NEW', role: 'Editor' }],
    });

    expect(sentShares()).toContainEqual({ team_id: 'all', role: 'ReadOnly' });
  });

  it('replaces the organization grant when one is provided', async () => {
    await shareBucket('my-bucket', { organization: { role: 'Editor' } });

    const org = sentShares()?.filter((s) => s.team_id === 'all');
    expect(org).toEqual([{ team_id: 'all', role: 'Editor' }]);
  });

  it('keeps existing users when only a user is named', async () => {
    await shareBucket('my-bucket', {
      user: [{ userId: 'uid_NEW', role: 'ReadOnly' }],
    });

    expect(sentShares()).toContainEqual({
      user_id: 'uid_KEEP',
      role: 'ReadWrite',
    });
  });

  it('surfaces a read failure instead of writing a truncated list', async () => {
    vi.mocked(getBucketInfo).mockResolvedValue({
      error: new Error('boom'),
    } as never);

    const { error } = await shareBucket('my-bucket', {
      team: [{ teamId: 'tmid_NEW', role: 'Editor' }],
    });

    expect(error?.message).toBe('boom');
    expect(setBucketSettings).not.toHaveBeenCalled();
  });
});

describe('shareBucket override', () => {
  it('does not read existing shares', async () => {
    await shareBucket('my-bucket', {
      override: true,
      team: [{ teamId: 'tmid_NEW', role: 'Editor' }],
    });

    expect(getBucketInfo).not.toHaveBeenCalled();
  });

  it('drops every target that was omitted', async () => {
    await shareBucket('my-bucket', {
      override: true,
      team: [{ teamId: 'tmid_NEW', role: 'Editor' }],
    });

    expect(sentShares()).toEqual([{ team_id: 'tmid_NEW', role: 'Editor' }]);
  });

  it('clears every share when given empty arrays', async () => {
    await shareBucket('my-bucket', {
      override: true,
      team: [],
      user: [],
    });

    expect(sentShares()).toEqual([]);
  });
});
