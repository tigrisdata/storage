import { describe, expect, it } from 'vitest';
import * as storageOperations from './operations';
import { TigrisStorage } from './tigris-storage';

/**
 * Regression guard for the "automatic attachment" invariant: every
 * function exported from `./operations` — the same barrel `server.ts`
 * re-exports as the public bare-function API — must end up as a bound
 * method on `TigrisStorage`, with zero changes to this test (or to
 * `tigris-storage.ts`) required when a new one is added there.
 */
describe('TigrisStorage attachment coverage', () => {
  it('binds every function export of ./operations as an instance method', () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    }) as unknown as Record<string, unknown>;

    const expectedFunctionKeys = Object.entries(storageOperations)
      .filter(([, value]) => typeof value === 'function')
      .map(([key]) => key);

    expect(expectedFunctionKeys.length).toBeGreaterThan(20);

    for (const key of expectedFunctionKeys) {
      expect(typeof storage[key]).toBe('function');
    }
  });

  it('does not attach non-function exports (enums, re-exported values)', () => {
    const storage = new TigrisStorage({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    }) as unknown as Record<string, unknown>;

    const nonFunctionKeys = Object.entries(storageOperations)
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key);

    expect(nonFunctionKeys).toContain('BucketTypes');
    for (const key of nonFunctionKeys) {
      expect(storage[key]).toBeUndefined();
    }
  });
});
