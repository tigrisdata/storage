import { readFileSync } from 'node:fs';
import { getOAuthIAMConfig } from '@auth/iam.js';
import {
  resolveAuthMethod,
  resolveEndpoints,
  usesTemporaryCredentials,
} from '@auth/provider.js';
import {
  type AccessKeyRole,
  createAccessKey,
  createTemporaryCredentials,
  fromApiDocument,
  MAX_TEMPORARY_CREDENTIALS_DURATION,
  MIN_TEMPORARY_CREDENTIALS_DURATION,
  type PolicyDocument,
  removeAccessKey,
  TEMPORARY_CREDENTIAL_ACTIONS,
  type TemporaryCredentialAccess,
  type TemporaryCredentialAction,
} from '@tigrisdata/iam';
import {
  CREDENTIALS_SDKS,
  type CredentialsSdk,
  credentialVariables,
  shellExportLines,
} from '@utils/credentials-export.js';
import { failWithError } from '@utils/exit.js';
import { msg, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';
import enquirer from 'enquirer';

const context = msg('credentials', 'temporary');

const DEFAULT_DURATION = '1h';
const SECONDS_PER_UNIT: Record<string, number> = {
  '': 1,
  s: 1,
  m: 60,
  h: 3600,
};

/**
 * Issue temporary credentials (STS GetFederationToken) for one bucket, and
 * print them, or hand them to the shell as `export` lines (`--export`).
 */
export default async function temporary(options: Record<string, unknown>) {
  const format = getFormat(options);
  const bucket = getOption<string>(options, ['bucket']);
  const name = getOption<string>(options, ['name', 'n']);
  const access = getOption<string>(options, ['access', 'a']);
  const actions = getOption<string>(options, ['actions'])
    ?.split(',')
    .map((action) => action.trim())
    .filter(Boolean);
  const policyPath = getOption<string>(options, ['policy']);
  const durationOption = getOption<string>(
    options,
    ['duration', 'd'],
    DEFAULT_DURATION
  );
  const exportToShell = getOption<boolean>(options, ['export']) === true;
  const sdk = getOption<string>(options, ['for'], 'tigris') as CredentialsSdk;

  if (!name) {
    failWithError(context, '--name is required');
  }

  if (!access && !actions?.length && !policyPath) {
    failWithError(
      context,
      'Choose what to grant with --access, --actions or --policy'
    );
  }

  if (policyPath && (bucket || access || actions?.length)) {
    failWithError(
      context,
      "--policy can't be combined with a bucket, --access or --actions: the policy alone says what is granted"
    );
  }

  const durationSeconds = parseDuration(String(durationOption));
  if (
    durationSeconds === undefined ||
    durationSeconds < MIN_TEMPORARY_CREDENTIALS_DURATION ||
    durationSeconds > MAX_TEMPORARY_CREDENTIALS_DURATION
  ) {
    failWithError(
      context,
      `Invalid --duration "${durationOption}". Use 15m to 36h, e.g. 30m, 1h or 3600 (seconds)`
    );
  }

  if (!CREDENTIALS_SDKS.includes(sdk)) {
    failWithError(
      context,
      `Invalid --for "${sdk}". Valid values are: ${CREDENTIALS_SDKS.join(', ')}`
    );
  }

  if (exportToShell && format === 'json') {
    failWithError(
      context,
      'Cannot combine --export with --format json: stdout carries the export lines'
    );
  }

  const policy = policyPath ? readPolicy(policyPath) : undefined;

  // With --export, stdout is reserved for the export lines so that
  // `eval "$(tigris credentials temporary ... --export)"` sees nothing else.
  if (!exportToShell) printStart(context);

  const keys = await issuingKey({
    name,
    bucket,
    role: roleFor(access, actions),
  });
  const endpoints = exportToShell ? await endpointsOrFail() : undefined;

  const { data, error } = await createTemporaryCredentials(name, {
    config: {
      accessKeyId: keys.accessKeyId,
      secretAccessKey: keys.secretAccessKey,
      // The SDK reads TIGRIS_STS_ENDPOINT itself; the AWS name is the CLI's.
      ...(process.env.AWS_ENDPOINT_URL_STS && {
        stsEndpoint: process.env.AWS_ENDPOINT_URL_STS,
      }),
    },
    durationSeconds,
    ...(policy
      ? { policy }
      : {
          bucket,
          ...(access && { access: access as TemporaryCredentialAccess }),
          ...(actions?.length && {
            actions: actions as TemporaryCredentialAction[],
          }),
        }),
  });

  if (error) {
    if (keys.created) await removeCreatedKey(keys.created);
    failWithError(context, error);
  }

  if (exportToShell && endpoints) {
    const variables = credentialVariables({
      id: data.accessKeyId,
      secret: data.secretAccessKey,
      sessionToken: data.sessionToken,
      bucket,
      sdk,
      endpoints,
    });
    console.log(shellExportLines(variables).join('\n'));
    if (process.stderr.isTTY) {
      console.error(
        `✔ Temporary credentials '${name}' issued, valid until ${data.expiration.toISOString()}. Run this command through eval "$(...)" to load them into your shell.`
      );
    }
    return;
  }

  if (format === 'json') {
    console.log(
      JSON.stringify({
        action: 'issued',
        name,
        ...(bucket && { bucket }),
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
        sessionToken: data.sessionToken,
        expiration: data.expiration.toISOString(),
        federatedUser: data.federatedUser,
        ...(keys.created && {
          createdAccessKey: {
            id: keys.accessKeyId,
            name: keys.created.name,
          },
        }),
      })
    );
  } else {
    console.log(`  Name: ${name}`);
    if (bucket) console.log(`  Bucket: ${bucket}`);
    if (policyPath) console.log(`  Policy: ${policyPath}`);
    if (access) console.log(`  Access: ${access}`);
    if (actions?.length) console.log(`  Actions: ${actions.join(', ')}`);
    console.log(`  Access Key ID: ${data.accessKeyId}`);
    console.log(`  Secret Access Key: ${data.secretAccessKey}`);
    console.log(`  Session Token: ${data.sessionToken}`);
    console.log(`  Expires: ${data.expiration.toISOString()}`);
    console.log('');
    console.log(
      '  These cannot be revoked one by one. Deleting or disabling the access key that issued them ends them all.'
    );
  }

  printSuccess(context);
}

/** Seconds in `30m`, `1h`, `90s` or a bare number of seconds. */
export function parseDuration(value: string): number | undefined {
  const match = /^(\d+)\s*([smh]?)$/i.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * SECONDS_PER_UNIT[match[2].toLowerCase()];
}

function readPolicy(path: string): PolicyDocument {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    failWithError(
      context,
      `Could not read --policy ${path}: ${(err as Error).message}`
    );
  }
  try {
    return fromApiDocument(text);
  } catch (err) {
    failWithError(
      context,
      `--policy ${path} is not a valid JSON policy: ${(err as Error).message}`
    );
  }
}

/**
 * The access-key role a new issuing key needs for what is being granted:
 * ReadOnly when only read actions are, ReadWrite otherwise.
 */
export function roleFor(
  access: string | undefined,
  actions: string[] | undefined
): AccessKeyRole {
  const writeActions: readonly string[] =
    TEMPORARY_CREDENTIAL_ACTIONS.write.object;
  const writes =
    (access !== undefined && access !== 'read') ||
    (actions ?? []).some((action) => writeActions.includes(action));
  return writes ? 'ReadWrite' : 'ReadOnly';
}

type CreatedKey = {
  id: string;
  name: string;
  config: Awaited<ReturnType<typeof getOAuthIAMConfig>>;
};

type IssuingKey = {
  accessKeyId: string;
  secretAccessKey: string;
  /** Set when the key was created for this run. */
  created?: CreatedKey;
};

/**
 * The access key that issues the credentials. Tigris only accepts an access
 * key here: neither an OAuth login nor other temporary credentials can issue
 * them. Logged in with OAuth, the user can create a key for the bucket.
 */
async function issuingKey(request: {
  name: string;
  /** Unset with --policy, which can name any bucket. */
  bucket?: string;
  role: AccessKeyRole;
}): Promise<IssuingKey> {
  const method = await resolveAuthMethod();

  if (method.type === 'none') {
    failWithError(
      context,
      'Not authenticated. Run "tigris login credentials" or "tigris configure" with an access key first.'
    );
  }

  if (method.type === 'oauth') {
    return createIssuingKey(request);
  }

  if (usesTemporaryCredentials(method)) {
    failWithError(
      context,
      'You are using temporary credentials, which cannot issue more. Use an access key instead.'
    );
  }

  return {
    accessKeyId: method.accessKeyId,
    secretAccessKey: method.secretAccessKey,
  };
}

const OAUTH_MESSAGE =
  'You are logged in with OAuth. Temporary credentials have to be issued by an access key.';
const LOGIN_HINT =
  'Run "tigris login credentials" with an access key, or set TIGRIS_STORAGE_ACCESS_KEY_ID and TIGRIS_STORAGE_SECRET_ACCESS_KEY.';

/**
 * Offer to create an access key for the bucket. The secret is only shown
 * once, so the key is not kept: the user owns it from here on.
 */
async function createIssuingKey({
  name,
  bucket,
  role,
}: {
  name: string;
  bucket?: string;
  role: AccessKeyRole;
}): Promise<IssuingKey> {
  // Prompts go to stderr: with --export, stdout is captured by eval.
  if (!bucket || !process.stdin.isTTY || !process.stderr.isTTY) {
    failWithError(context, `${OAUTH_MESSAGE} ${LOGIN_HINT}`);
  }

  console.error(OAUTH_MESSAGE);
  const { choice } = await enquirer.prompt<{ choice: string }>({
    type: 'select',
    name: 'choice',
    message: 'How do you want to continue?',
    stdout: process.stderr,
    choices: [
      { name: 'create', message: `Create a new access key for ${bucket}` },
      {
        name: 'cancel',
        message:
          'Cancel, I\'ll log in with an access key ("tigris login credentials")',
      },
    ],
  });

  if (choice !== 'create') {
    failWithError(context, LOGIN_HINT);
  }

  const config = await getOAuthIAMConfig(context);
  const { data, error } = await createAccessKey(name, {
    config,
    bucketsRole: [{ bucket, role }],
    // The key only issues credentials, so it gets nothing beyond the bucket.
    scope: 'no_default_allow',
  });

  if (error) {
    failWithError(context, error);
  }
  if (!data.secret) {
    failWithError(context, 'The gateway did not return a secret for the key');
  }

  console.error(
    `✔ Created access key ${data.name} (${data.id}), ${role} on ${bucket}`
  );
  console.error(
    '  Keep this key until the temporary credentials expire. Deleting it ends them.'
  );
  console.error(
    `  Delete it afterwards with: tigris access-keys delete ${data.id}`
  );

  return {
    accessKeyId: data.id,
    secretAccessKey: data.secret,
    created: { id: data.id, name: data.name, config },
  };
}

/**
 * Delete a key created for credentials that were then not issued. Its secret
 * was never shown, so nobody could use it.
 */
async function removeCreatedKey({ id, config }: CreatedKey): Promise<void> {
  const { error } = await removeAccessKey(id, { config });
  if (error) {
    console.error(
      `⚠ Could not delete the access key created for these credentials. Delete it with: tigris access-keys delete ${id}`
    );
  } else {
    console.error(`  Deleted access key ${id}, since nothing was issued.`);
  }
}

async function endpointsOrFail() {
  try {
    return await resolveEndpoints();
  } catch (err) {
    failWithError(context, err);
  }
}
