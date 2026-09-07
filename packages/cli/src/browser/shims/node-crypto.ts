/** `node:crypto` — `randomUUID` only, delegated to the Web Crypto API. */

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  return globalThis.crypto.getRandomValues(array as never) as T;
}

export default { randomUUID, getRandomValues };
