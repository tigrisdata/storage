import { describe, expect, it } from 'vitest';

import { shareBucket } from './share';

/**
 * Every case here fails validation before `setBucketSettings` is reached, so
 * none of them touch the network.
 */
describe('shareBucket validation', () => {
  it('rejects a call with no share targets at all', async () => {
    const { error } = await shareBucket('my-bucket');
    expect(error?.message).toContain('No shares provided');
  });

  it('points at the override form for removing every share', async () => {
    const { error } = await shareBucket('my-bucket');
    expect(error?.message).toContain('override: true');
  });

  it('accepts explicit empty arrays as a clear-all request', async () => {
    const { error } = await shareBucket('my-bucket', {
      override: true,
      team: [],
      user: [],
      config: { accessKeyId: '', secretAccessKey: '' },
    });
    expect(error?.message).not.toContain('No shares provided');
  });

  describe('organization', () => {
    it('rejects a missing role', async () => {
      const { error } = await shareBucket('my-bucket', {
        organization: {} as never,
      });
      expect(error?.message).toBe('Share for organization: role is required');
    });

    it('rejects an unknown role', async () => {
      const { error } = await shareBucket('my-bucket', {
        organization: { role: 'Owner' as never },
      });
      expect(error?.message).toContain(
        'Share for organization: invalid role "Owner"'
      );
    });

    it('rejects NamespaceAdmin, which is not bucket-scoped', async () => {
      const { error } = await shareBucket('my-bucket', {
        organization: { role: 'NamespaceAdmin' as never },
      });
      expect(error?.message).toContain('invalid role "NamespaceAdmin"');
    });
  });

  describe('team', () => {
    it('rejects a missing teamId', async () => {
      const { error } = await shareBucket('my-bucket', {
        team: [{ teamId: '', role: 'Editor' }],
      });
      expect(error?.message).toBe('Share for team 1: teamId is required');
    });

    it('reports the index of the offending team', async () => {
      const { error } = await shareBucket('my-bucket', {
        team: [
          { teamId: 'tmid_A', role: 'Editor' },
          { teamId: 'tmid_B', role: 'Nope' as never },
        ],
      });
      expect(error?.message).toContain('Share for team 2:');
    });

    it('rejects the reserved organization sentinel as a teamId', async () => {
      const { error } = await shareBucket('my-bucket', {
        team: [{ teamId: 'all', role: 'Editor' }],
      });
      expect(error?.message).toContain('"all" is reserved');
    });

    it('rejects duplicate grants for the same team', async () => {
      const { error } = await shareBucket('my-bucket', {
        team: [
          { teamId: 'tmid_A', role: 'Editor' },
          { teamId: 'tmid_A', role: 'ReadOnly' },
        ],
      });
      expect(error?.message).toBe('Duplicate team share for "tmid_A"');
    });
  });

  describe('user', () => {
    it('rejects a missing userId', async () => {
      const { error } = await shareBucket('my-bucket', {
        user: [{ userId: '', role: 'ReadOnly' }],
      });
      expect(error?.message).toBe('Share for user 1: userId is required');
    });

    it('rejects an unknown role', async () => {
      const { error } = await shareBucket('my-bucket', {
        user: [{ userId: 'uid_A', role: 'Owner' as never }],
      });
      expect(error?.message).toContain('Share for user 1: invalid role');
    });

    it('rejects duplicate grants for the same user', async () => {
      const { error } = await shareBucket('my-bucket', {
        user: [
          { userId: 'uid_A', role: 'Editor' },
          { userId: 'uid_A', role: 'ReadOnly' },
        ],
      });
      expect(error?.message).toBe('Duplicate user share for "uid_A"');
    });

    it('does not collide a user id with an identical team id', async () => {
      const { error } = await shareBucket('my-bucket', {
        override: true,
        team: [{ teamId: 'shared_id', role: 'Editor' }],
        user: [{ userId: 'shared_id', role: 'ReadOnly' }],
        config: { accessKeyId: '', secretAccessKey: '' },
      });
      expect(error?.message).not.toContain('Duplicate');
    });
  });

  it('accepts every bucket-scoped role on every target', async () => {
    for (const role of ['ReadOnly', 'ReadWrite', 'Editor'] as const) {
      const { error } = await shareBucket('my-bucket', {
        override: true,
        organization: { role },
        team: [{ teamId: 'tmid_A', role }],
        user: [{ userId: 'uid_A', role }],
        config: { accessKeyId: '', secretAccessKey: '' },
      });
      // Never a validation error — only a config/transport one.
      expect(error?.message).not.toContain('invalid role');
      expect(error?.message).not.toContain('is required');
    }
  });
});
