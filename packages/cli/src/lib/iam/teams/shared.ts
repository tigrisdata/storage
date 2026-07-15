import { failWithError } from '@utils/exit.js';
import type { MessageContext } from '@utils/messages.js';

/**
 * Normalize the repeatable `--members` flag into a clean list of emails.
 *
 * cli-core delivers it as `undefined` (flag omitted), a `string[]` (one or
 * more comma-separated values), or boolean `true` (the flag passed with no
 * value). Returns `undefined` when omitted so callers can distinguish "not
 * provided" from "provided"; errors when the flag is present but carries no
 * usable value, rather than silently dropping it or forwarding a non-email
 * (e.g. `true`) to the API.
 */
export function parseMembers(
  context: MessageContext,
  raw: string | string[] | boolean | undefined
): string[] | undefined {
  if (raw === undefined) return undefined;

  const members = (Array.isArray(raw) ? raw : [raw])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  if (members.length === 0) {
    failWithError(context, '--members requires at least one email address');
  }

  return members;
}
