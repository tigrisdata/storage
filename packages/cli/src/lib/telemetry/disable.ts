import { failWithError } from '@utils/exit.js';
import { msg, printSuccess } from '@utils/messages.js';
import { getFormat } from '@utils/options.js';
import {
  setTelemetryOptOut,
  TELEMETRY_STATE_FILE,
} from '@utils/telemetry-config.js';

const context = msg('telemetry', 'disable');

export default async function disable(
  options: Record<string, unknown> = {}
): Promise<void> {
  try {
    const format = getFormat(options);

    // Never report success on a failed write. Telling someone telemetry is off
    // and then tracking them on the next run is the one outcome this command
    // exists to prevent, so an unwritable state file has to be an error with a
    // working alternative rather than a silent no-op.
    if (!setTelemetryOptOut(true)) {
      failWithError(
        context,
        new Error(
          `Could not save your preference to ${TELEMETRY_STATE_FILE}. ` +
            'Set TIGRIS_NO_TELEMETRY=1 in your environment to disable telemetry instead.'
        )
      );
    }

    if (format === 'json') {
      console.log(JSON.stringify({ enabled: false, action: 'disabled' }));
      return;
    }

    printSuccess(context);
  } catch (error) {
    failWithError(context, error);
  }
}
