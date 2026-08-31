import { getStorageConfigWithOrg } from '@auth/provider.js';
import {
  type BucketShareRole,
  type BucketSharesInput,
  shareBucket,
} from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

const context = msg('buckets', 'share');

const validRoles: BucketShareRole[] = ['ReadOnly', 'ReadWrite', 'Editor'];

function normalizeToArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export default async function share(options: Record<string, unknown>) {
  printStart(context);

  const format = getFormat(options);

  const name = getOption<string>(options, ['name']);
  const organization = getOption<boolean>(options, ['organization', 'org']);
  const teams = normalizeToArray(
    getOption<string | string[]>(options, ['team', 't'])
  );
  const users = normalizeToArray(
    getOption<string | string[]>(options, ['user', 'u'])
  );
  const roles = normalizeToArray(
    getOption<string | string[]>(options, ['role', 'r'])
  );
  const override = getOption<boolean>(options, ['override']);
  const reset = getOption<boolean>(options, ['reset']);

  if (!name) {
    failWithError(context, 'Bucket name is required');
  }

  const targets = [
    organization ? 'organization' : undefined,
    teams.length > 0 ? 'team' : undefined,
    users.length > 0 ? 'user' : undefined,
  ].filter(Boolean);

  if (reset) {
    if (targets.length > 0 || roles.length > 0 || override) {
      failWithError(context, 'Cannot use --reset with other options');
    }
  } else {
    if (targets.length === 0) {
      failWithError(
        context,
        'Provide --organization, --team, --user, or --reset'
      );
    }

    if (targets.length > 1) {
      failWithError(
        context,
        `Use only one of --organization, --team, or --user at a time (got ${targets.join(', ')}). Shares merge by default, so run the command once per target.`
      );
    }

    if (roles.length === 0) {
      failWithError(context, 'At least one --role is required');
    }

    for (const role of roles) {
      if (!validRoles.includes(role as BucketShareRole)) {
        failWithError(
          context,
          `Invalid role "${role}". Valid roles are: ${validRoles.join(', ')}`
        );
      }
    }
  }

  const ids = teams.length > 0 ? teams : users;

  if (
    !reset &&
    !organization &&
    roles.length !== 1 &&
    roles.length !== ids.length
  ) {
    failWithError(
      context,
      `Number of roles (${roles.length}) must be 1 or match number of ${targets[0]}s (${ids.length})`
    );
  }

  if (!reset && organization && roles.length !== 1) {
    failWithError(context, '--organization takes exactly one --role');
  }

  const finalConfig = await getStorageConfigWithOrg();

  const roleAt = (i: number) =>
    (roles.length === 1 ? roles[0] : roles[i]) as BucketShareRole;

  const shares: BucketSharesInput = reset
    ? { team: [], user: [] }
    : {
        ...(organization ? { organization: { role: roleAt(0) } } : {}),
        ...(teams.length > 0
          ? { team: teams.map((teamId, i) => ({ teamId, role: roleAt(i) })) }
          : {}),
        ...(users.length > 0
          ? { user: users.map((userId, i) => ({ userId, role: roleAt(i) })) }
          : {}),
      };

  // `shareBucket` merges by default; --override and --reset both replace the
  // whole list, --reset with nothing in it.
  const { error } = await shareBucket(name, {
    ...shares,
    override: reset || override === true,
    config: finalConfig,
  });

  if (error) {
    failWithError(context, error);
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: reset ? 'reset' : 'shared',
        bucket: name,
        shares,
      })
    );
  }

  printSuccess(context, { name });
}
