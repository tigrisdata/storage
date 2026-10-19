import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import * as test from 'vitest';
import KeyvTigris from '../index';

const store = () => new KeyvTigris();

// The suite only calls `it`, `beforeEach` and `afterEach` on what it is
// handed, but types the parameter as its own copy of vitest. Another copy, or
// another major, is the same module to it at runtime, so bridge the types.
keyvTestSuite(
  test as unknown as Parameters<typeof keyvTestSuite>[0],
  Keyv,
  store
);
