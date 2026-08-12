import { homedir } from 'node:os';

import { failWithError } from '@utils/exit.js';
import { msg } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';
import {
  TELEMETRY_STATE_FILE,
  type TelemetryDisabledReason,
  telemetryDisabledReason,
} from '@utils/telemetry-config.js';

const context = msg('telemetry', 'status');

/** Human explanation of which switch is currently in effect. */
const REASON_LABELS: Record<TelemetryDisabledReason, string> = {
  TIGRIS_NO_TELEMETRY: 'the TIGRIS_NO_TELEMETRY environment variable is set',
  DO_NOT_TRACK: 'the DO_NOT_TRACK environment variable is set',
  'opt-out': 'you disabled it on this machine',
  development: 'this is a development build',
  test: 'this is a test environment',
};

/** Collapse the home directory to `~` so the path is short and portable. */
function displayPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

export default async function status(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options);
    const reason = telemetryDisabledReason();
    const enabled = reason === null;

    if (format === 'json') {
      console.log(
        JSON.stringify({
          enabled,
          disabledReason: reason,
          settingsFile: TELEMETRY_STATE_FILE,
        })
      );
      return;
    }

    const lines: string[] = [
      '',
      `Telemetry: ${enabled ? 'enabled' : 'disabled'}`,
    ];

    if (!enabled) {
      lines.push(`   Reason: ${REASON_LABELS[reason]}`);
    }

    lines.push(
      '',
      'What is collected:',
      '   Usage analytics   which commands you run and their arguments, CLI',
      '                     version, OS, install method, and whether you are in CI',
      '   Error reports     crashes and unexpected failures',
      '',
      'Never collected:',
      '   credentials of any kind — access keys, secrets, tokens, passwords —',
      '   or your hostname. Both are stripped before anything is sent.',
      '',
      `Settings file: ${displayPath(TELEMETRY_STATE_FILE)}`,
      ''
    );

    // An env var outranks the stored setting, so say so rather than suggesting a
    // command that would appear to do nothing.
    if (reason === 'TIGRIS_NO_TELEMETRY' || reason === 'DO_NOT_TRACK') {
      lines.push(
        `Unset ${reason} to re-enable, then run "tigris telemetry enable".`,
        ''
      );
    } else if (enabled) {
      lines.push('To disable: tigris telemetry disable', '');
    } else if (reason === 'opt-out') {
      lines.push('To re-enable: tigris telemetry enable', '');
    }

    console.log(lines.join('\n'));
  } catch (error) {
    failWithError(context, error);
  }
}
