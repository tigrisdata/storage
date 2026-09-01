import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import { getBucketInfo } from './info';
import { type SetBucketSettingsOptions, setBucketSettings } from './set/set';
import {
  type BucketShareRole,
  type BucketShares,
  type BucketSharesInput,
  bucketShareRoles,
  type UpdateBucketResponse,
} from './types';
import { type BucketApiShare, ORGANIZATION_TEAM_ID } from './utils/api';

export type ShareBucketOptions = BucketSharesInput & {
  /**
   * Replace the bucket's entire share list instead of merging into it.
   *
   * Defaults to `false`: targets you do not name keep their access, and a
   * target you do name has its role updated. Set to `true` to make the shares
   * you pass the complete list — anything omitted loses access.
   */
  override?: boolean;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

/**
 * Share a bucket with the whole organization, specific teams, or specific
 * users.
 *
 * Merges into the bucket's existing shares by default, which costs a
 * `getBucketInfo` call. Pass `override: true` to replace the list outright —
 * with `{ override: true, team: [], user: [] }` removing every share.
 */
export async function shareBucket(
  bucketName: string,
  options?: ShareBucketOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const { organization, team, user, override, config } = options ?? {};

  if (organization === undefined && team === undefined && user === undefined) {
    return {
      error: new Error(
        'No shares provided. Pass `organization`, `team`, or `user` — or `{ override: true, team: [], user: [] }` to remove every share.'
      ),
    };
  }

  const validationError = validate(organization, team, user);
  if (validationError) {
    return { error: validationError };
  }

  let shares: BucketShares = {
    organization,
    team: team ?? [],
    user: user ?? [],
  };

  if (!override) {
    const { data, error } = await getBucketInfo(bucketName, { config });

    if (error) {
      return { error };
    }

    shares = merge(data.settings.shares, shares);
  }

  const body: SetBucketSettingsOptions['body'] = { shares: serialize(shares) };

  return setBucketSettings(bucketName, { body, config });
}

/**
 * Overlay `next` on `existing`: a target named in `next` has its role
 * replaced, and every other target keeps the access it already had.
 */
function merge(existing: BucketShares, next: BucketShares): BucketShares {
  const namedTeams = new Set(next.team.map((t) => t.teamId));
  const namedUsers = new Set(next.user.map((u) => u.userId));

  return {
    organization: next.organization ?? existing.organization,
    team: [
      ...existing.team.filter((t) => !namedTeams.has(t.teamId)),
      ...next.team,
    ],
    user: [
      ...existing.user.filter((u) => !namedUsers.has(u.userId)),
      ...next.user,
    ],
  };
}

function serialize(shares: BucketShares): BucketApiShare[] {
  return [
    ...(shares.organization
      ? [{ team_id: ORGANIZATION_TEAM_ID, role: shares.organization.role }]
      : []),
    ...shares.team.map((t) => ({ team_id: t.teamId, role: t.role })),
    ...shares.user.map((u) => ({ user_id: u.userId, role: u.role })),
  ];
}

function validate(
  organization: BucketSharesInput['organization'],
  team: BucketSharesInput['team'],
  user: BucketSharesInput['user']
): Error | undefined {
  if (organization) {
    const error = validateRole(organization.role, 'organization');
    if (error) return error;
  }

  for (let i = 0; i < (team?.length ?? 0); i++) {
    const share = team![i];
    const label = `team ${i + 1}`;

    if (!share.teamId) {
      return new Error(`Share for ${label}: teamId is required`);
    }

    if (share.teamId === ORGANIZATION_TEAM_ID) {
      return new Error(
        `Share for ${label}: "${ORGANIZATION_TEAM_ID}" is reserved — use the \`organization\` option to share with everyone.`
      );
    }

    const error = validateRole(share.role, label);
    if (error) return error;
  }

  for (let i = 0; i < (user?.length ?? 0); i++) {
    const share = user![i];
    const label = `user ${i + 1}`;

    if (!share.userId) {
      return new Error(`Share for ${label}: userId is required`);
    }

    const error = validateRole(share.role, label);
    if (error) return error;
  }

  return (
    findDuplicate(team?.map((t) => t.teamId) ?? [], 'team') ??
    findDuplicate(user?.map((u) => u.userId) ?? [], 'user')
  );
}

function validateRole(
  role: BucketShareRole | undefined,
  label: string
): Error | undefined {
  if (!role) {
    return new Error(`Share for ${label}: role is required`);
  }

  if (!bucketShareRoles.includes(role)) {
    return new Error(
      `Share for ${label}: invalid role "${role}". Valid roles are: ${bucketShareRoles.join(', ')}`
    );
  }
}

function findDuplicate(ids: string[], label: string): Error | undefined {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      return new Error(`Duplicate ${label} share for "${id}"`);
    }
    seen.add(id);
  }
}
