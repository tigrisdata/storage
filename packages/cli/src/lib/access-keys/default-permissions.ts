import type { AccessKeyScope } from '@tigrisdata/iam';
import { failWithError } from '@utils/exit.js';
import type { MessageContext } from '@utils/messages.js';
import { getOption } from '@utils/options.js';

/**
 * The console's "Enable default permissions" toggle, as the SDK's scope:
 * enabled is the `standard` scope, disabled is `no_default_allow`.
 */
const SCOPE_BY_SETTING = {
  enable: 'standard',
  disable: 'no_default_allow',
} as const satisfies Record<string, AccessKeyScope>;

type Setting = keyof typeof SCOPE_BY_SETTING;

const SETTINGS = Object.keys(SCOPE_BY_SETTING) as Setting[];

/** `--default-permissions` as the scope it stands for; undefined when absent. */
export function getDefaultPermissions(
  context: MessageContext,
  options: Record<string, unknown>
): AccessKeyScope | undefined {
  const setting = getOption<string>(options, [
    'default-permissions',
    'defaultPermissions',
  ]);
  if (setting === undefined) return undefined;
  if (!SETTINGS.includes(setting as Setting)) {
    failWithError(
      context,
      `Invalid --default-permissions "${setting}". Valid values are: ${SETTINGS.join(', ')}`
    );
  }
  return SCOPE_BY_SETTING[setting as Setting];
}

/** How the setting reads back: enabled for `standard`, disabled otherwise. */
export function describeDefaultPermissions(scope: AccessKeyScope): string {
  return scope === 'standard' ? 'enabled' : 'disabled';
}
