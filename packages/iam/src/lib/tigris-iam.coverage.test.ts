import { describe, expect, it } from 'vitest';
import * as iamOperations from './operations';
import { TigrisIAM } from './tigris-iam';

/**
 * Regression guard for the "automatic attachment" invariant: every
 * function exported from `./operations` — the same barrel `index.ts`
 * re-exports as the public bare-function API — must end up as a bound
 * method on `TigrisIAM`, with zero changes to this test (or to
 * `tigris-iam.ts`) required when a new one is added there.
 */
describe('TigrisIAM attachment coverage', () => {
  it('binds every function export of ./operations as an instance method', () => {
    const iam = new TigrisIAM({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    }) as unknown as Record<string, unknown>;

    const expectedFunctionKeys = Object.entries(iamOperations)
      .filter(([, value]) => typeof value === 'function')
      .map(([key]) => key);

    expect(expectedFunctionKeys.length).toBeGreaterThan(15);

    for (const key of expectedFunctionKeys) {
      expect(typeof iam[key]).toBe('function');
    }
  });
});
