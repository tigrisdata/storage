import { relative, resolve } from 'node:path';

import { getIAMConfig } from '@auth/iam.js';
import { resolveEndpoints, type ServiceEndpoints } from '@auth/provider.js';
import { createAccessKey } from '@tigrisdata/iam';
import {
  CREDENTIALS_SDKS,
  type CredentialsSdk,
  credentialVariables,
  gitignoreStatus,
  shellExportLines,
  writeDotenv,
} from '@utils/credentials-export.js';
import {
  failWithError,
  getSuccessNextActions,
  printNextActions,
} from '@utils/exit.js';
import {
  type MessageContext,
  msg,
  printStart,
  printSuccess,
} from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

import {
  buildRoleAssignments,
  getRoleRequest,
  requestsRoles,
} from './roles.js';

/** Where `--env` writes when given no path. */
const DEFAULT_ENV_FILE = '.env';

const context = msg('access-keys', 'create');

/**
 * Create an access key, optionally scoped to buckets, and hand its
 * credentials over as a dotenv file (`--env`) or shell exports (`--export`).
 */
export default async function create(options: Record<string, unknown>) {
  const format = getFormat(options);
  const name = getOption<string>(options, ['name']);
  const exportToShell = getOption<boolean>(options, ['export']) === true;
  const envOption = getOption<string | boolean>(options, ['env']);
  const sdk = getOption<string>(options, ['for'], 'tigris') as CredentialsSdk;
  const request = getRoleRequest(options);

  if (!name) {
    failWithError(context, 'Access key name is required');
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

  const assignments = requestsRoles(request)
    ? buildRoleAssignments(context, request, ' (or use --admin)')
    : undefined;

  const envPath =
    envOption === undefined || envOption === false
      ? undefined
      : resolve(
          process.cwd(),
          envOption === true ? DEFAULT_ENV_FILE : String(envOption)
        );

  // With --export, stdout is reserved for the export lines so that
  // `eval "$(tigris access-keys create ... --export)"` sees nothing else.
  if (!exportToShell) printStart(context);

  const config = await getIAMConfig(context);
  // Only --env and --export name the endpoints. Resolved before the key
  // exists, so anything that can fail does so while there is nothing to lose.
  const endpoints =
    envPath || exportToShell ? await endpointsOrFail(context) : undefined;

  const { data, error } = await createAccessKey(name, {
    config,
    bucketsRole: assignments,
  });

  if (error) {
    failWithError(context, error);
  }
  if (!data.secret) {
    failWithError(context, 'The gateway did not return a secret for the key');
  }

  // The bucket variable only makes sense for a key scoped to a single bucket.
  const bucket =
    assignments?.length === 1 && assignments[0].bucket !== '*'
      ? assignments[0].bucket
      : undefined;
  const variables = endpoints
    ? credentialVariables({
        id: data.id,
        secret: data.secret,
        bucket,
        sdk,
        endpoints,
      })
    : [];

  // The key exists and its secret is shown once, so a dotenv file that
  // cannot be written must not swallow it: fall back to printing the
  // credentials, and report the failure through the exit code.
  const envDisplayPath = envPath && relative(process.cwd(), envPath);
  let gitignored: boolean | undefined;
  let envError: NodeJS.ErrnoException | undefined;
  if (envPath) {
    try {
      writeDotenv(envPath, variables);
    } catch (err) {
      envError = err instanceof Error ? err : new Error(String(err));
    }
    if (!envError) gitignored = gitignoredOrUnknown(envPath);
  }
  const writtenPath = envError ? undefined : envDisplayPath;

  if (exportToShell) {
    console.log(shellExportLines(variables).join('\n'));
    if (process.stderr.isTTY) {
      console.error(
        `✔ Access key '${data.name}' created (${data.id}). Run this command through eval "$(...)" to load the credentials into your shell.`
      );
    }
    warnIfUnignored(writtenPath, gitignored);
    warnIfUnwritten(envDisplayPath, envError);
    if (envError) failAfterOutput();
    return;
  }

  if (format === 'json') {
    const output: Record<string, unknown> = {
      action: 'created',
      name: data.name,
      id: data.id,
      secret: data.secret,
    };
    if (assignments) output.roles = assignments;
    if (writtenPath) output.env = writtenPath;
    if (gitignored !== undefined) output.gitignored = gitignored;
    if (envError) output.envError = envError.message;
    const nextActions = assignments
      ? []
      : getSuccessNextActions(context, { name: data.name, id: data.id });
    if (nextActions.length > 0) output.nextActions = nextActions;
    console.log(JSON.stringify(output));
  } else {
    console.log(`  Name: ${data.name}`);
    console.log(`  Access Key ID: ${data.id}`);
    if (writtenPath) {
      console.log(`  Secret Access Key: written to ${writtenPath}`);
    } else {
      console.log(`  Secret Access Key: ${data.secret}`);
    }
    if (assignments) {
      console.log(
        `  Roles: ${assignments.map((a) => `${a.role} on ${a.bucket}`).join(', ')}`
      );
    }
    if (!writtenPath) {
      console.log('');
      console.log(
        '  Save these credentials securely. The secret will not be shown again.'
      );
    }
  }

  // Scripts read the JSON fields instead; human text stays out of JSON mode.
  if (format !== 'json') {
    warnIfUnignored(writtenPath, gitignored);
    warnIfUnwritten(envDisplayPath, envError);
  }
  printSuccess(context);
  if (!assignments) {
    printNextActions(context, { name: data.name, id: data.id });
  }
  if (envError) failAfterOutput();
}

/**
 * Report failure without cutting the output short: on macOS a pipe is
 * written asynchronously, so process.exit() right after printing the
 * credentials could hand `eval "$(...)"` or `| jq` an empty stdout. The
 * process ends with this code once everything has drained.
 */
function failAfterOutput(): void {
  process.exitCode = 1;
}

/** The endpoints the CLI is using for this run, or a clean CLI error. */
async function endpointsOrFail(
  context: MessageContext
): Promise<ServiceEndpoints> {
  try {
    return await resolveEndpoints();
  } catch (err) {
    failWithError(context, err);
  }
}

/**
 * Whether git ignores the written file: false when a .gitignore exists but
 * does not cover it, undefined when there is none to consult or it cannot
 * be read. Only ever advisory, so it never turns a successful write into a
 * failure.
 */
function gitignoredOrUnknown(envPath: string): boolean | undefined {
  try {
    const status = gitignoreStatus(envPath);
    return status === 'no-gitignore' ? undefined : status === 'covered';
  } catch {
    return undefined;
  }
}

/** A dotenv file that git would commit is a secret leak waiting to happen. */
function warnIfUnignored(displayPath?: string, gitignored?: boolean): void {
  if (gitignored !== false) return;
  console.error(
    `⚠ ${displayPath} is not ignored by .gitignore. Add it before you commit.`
  );
}

function warnIfUnwritten(
  displayPath?: string,
  error?: NodeJS.ErrnoException
): void {
  if (!error) return;
  const hint =
    error.code === 'EACCES' || error.code === 'EPERM'
      ? "Change the file's permissions or re-run with sudo."
      : error.code === 'ENOENT'
        ? 'Create the directory first.'
        : '';
  console.error(`⚠ Could not write ${displayPath}: ${error.message}`);
  console.error(`  The credentials were printed instead. ${hint}`.trimEnd());
}
