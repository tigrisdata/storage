import { failWithError } from '@utils/exit.js';
import { msg, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';
import {
  setTelemetryOptOut,
  TELEMETRY_STATE_FILE,
  telemetryDisabledReason,
} from '@utils/telemetry-config.js';

const context = msg('telemetry', 'enable');

export default async function enable(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options);

    // Symmetric with `disable`: a preference that did not persist would silently
    // revert on the next run, so report it instead of claiming success.
    if (!setTelemetryOptOut(false)) {
      failWithError(
        context,
        new Error(
          `Could not save your preference to ${TELEMETRY_STATE_FILE}. ` +
            'Check the permissions on that file and its directory.'
        )
      );
    }

    // Env vars outrank the stored setting. Clearing the opt-out while one is
    // set would otherwise report success and change nothing observable.
    const remaining = telemetryDisabledReason();

    if (format === 'json') {
      console.log(
        JSON.stringify({
          enabled: remaining === null,
          action: 'enabled',
          ...(remaining ? { stillDisabledBy: remaining } : {}),
        })
      );
      return;
    }

    printSuccess(context);

    if (remaining === 'TIGRIS_NO_TELEMETRY' || remaining === 'DO_NOT_TRACK') {
      console.log(
        `\nNote: ${remaining} is set in this environment, which still turns telemetry off.\nUnset it to let this setting take effect.`
      );
    }
  } catch (error) {
    failWithError(context, error);
  }
}
