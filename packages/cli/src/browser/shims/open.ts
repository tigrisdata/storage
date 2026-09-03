/**
 * The `open` package — opens a URL in a new browser tab.
 *
 * `window` is declared locally rather than by enabling the DOM lib. Enabling
 * it is program-wide, and that puts DOM's `ReadableStream` alongside
 * `@types/node`'s `stream/web` flavour, which makes the `Readable.fromWeb`
 * calls in `src/lib` unresolvable — even though both describe the same runtime
 * object. One declaration is cheaper than losing `cp` and `objects get`.
 */

declare const window: {
  open(url: string, target?: string, features?: string): unknown;
};

import { getHost, hasHost } from '../host.js';

export default async function open(url: string): Promise<void> {
  const opener = hasHost() ? getHost().openUrl : undefined;
  if (opener) {
    opener(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
