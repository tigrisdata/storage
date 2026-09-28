import { getStorageConfig, getTigrisConfig } from '@auth/provider.js';
import { failWithError } from '@utils/exit.js';
import { msg } from '@utils/messages.js';
import { getFormat, getOption } from '@utils/options.js';

/**
 * `tigris env`: hand the CLI's credentials to everything else.
 *
 * The CLI reads AWS_* and TIGRIS_STORAGE_* variables, but until now nothing
 * wrote them, so moving from "logged in with tigris" to "boto3 works" meant
 * copying five values by hand out of the docs. This prints them, in the
 * shape the shell can eat:
 *
 *   eval "$(tigris env)"            # this shell, right now
 *   tigris env --format dotenv > .env
 *   tigris env --shell fish | source
 *
 * It is the same contract `gh auth token`, `fly auth token` and direnv's
 * `.envrc` rely on: stdout carries only the assignments, so it is safe to
 * eval or redirect, and anything meant for a human goes to stderr.
 *
 * OAuth sessions carry a token rather than a key pair, and nothing outside
 * the CLI can use that token, so `env` asks for an access key in that case
 * instead of printing something that would not work.
 */

const context = msg('env');

export type EnvFormat = 'shell' | 'dotenv' | 'json';
export type EnvShell = 'sh' | 'fish' | 'powershell';

type Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  iamEndpoint: string;
};

/** The variables, in the order the SDKs document them. */
export function envVars(
  creds: Credentials,
  tigris: boolean
): Record<string, string> {
  if (tigris) {
    return {
      TIGRIS_STORAGE_ACCESS_KEY_ID: creds.accessKeyId,
      TIGRIS_STORAGE_SECRET_ACCESS_KEY: creds.secretAccessKey,
      TIGRIS_STORAGE_ENDPOINT: creds.endpoint,
    };
  }
  return {
    AWS_ACCESS_KEY_ID: creds.accessKeyId,
    AWS_SECRET_ACCESS_KEY: creds.secretAccessKey,
    AWS_ENDPOINT_URL_S3: creds.endpoint,
    AWS_ENDPOINT_URL_IAM: creds.iamEndpoint,
    AWS_REGION: 'auto',
  };
}

/** POSIX single quotes: the only escape is closing, escaping, reopening. */
const shQuote = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;
/** fish single quotes escape with a backslash. */
const fishQuote = (v: string) =>
  `'${v.replace(/\\/g, '\\\\').replace(/'/g, `\\'`)}'`;
/** PowerShell single quotes double up. */
const psQuote = (v: string) => `'${v.replace(/'/g, `''`)}'`;
/** dotenv: bare when it can be, double-quoted when it cannot. */
const dotenvValue = (v: string) =>
  /^[A-Za-z0-9_./:@+=,-]*$/.test(v)
    ? v
    : `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** Render the variables in the requested syntax. Always ends with a newline. */
export function renderEnv(
  vars: Record<string, string>,
  format: EnvFormat,
  shell: EnvShell = 'sh'
): string {
  const entries = Object.entries(vars);
  if (format === 'json') {
    return `${JSON.stringify(vars, null, 2)}\n`;
  }
  if (format === 'dotenv') {
    return `${entries.map(([k, v]) => `${k}=${dotenvValue(v)}`).join('\n')}\n`;
  }
  const line = (k: string, v: string) => {
    switch (shell) {
      case 'fish':
        return `set -gx ${k} ${fishQuote(v)}`;
      case 'powershell':
        return `$env:${k} = ${psQuote(v)}`;
      default:
        return `export ${k}=${shQuote(v)}`;
    }
  };
  return `${entries.map(([k, v]) => line(k, v)).join('\n')}\n`;
}

export default async function env(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options, 'shell') as EnvFormat;
    const shell = (getOption<string>(options, ['shell'], 'sh') ??
      'sh') as EnvShell;
    const tigris = getOption<boolean>(options, ['tigris']) === true;

    const config = await getStorageConfig();

    if (!config.accessKeyId || !config.secretAccessKey) {
      failWithError(
        context,
        'The current session has no access key to export (OAuth sessions carry a token that only the CLI can use). ' +
          'Create one with "tigris access-keys create <name>", save it with "tigris configure", then run "tigris env" again.'
      );
    }

    const vars = envVars(
      {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        endpoint: config.endpoint ?? getTigrisConfig().endpoint,
        iamEndpoint: config.iamEndpoint ?? getTigrisConfig().iamEndpoint,
      },
      tigris
    );

    // stdout carries the assignments and nothing else, so it can be eval'd
    process.stdout.write(renderEnv(vars, format, shell));
  } catch (error) {
    failWithError(context, error);
  }
}
