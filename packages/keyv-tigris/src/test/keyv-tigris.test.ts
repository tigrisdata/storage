import * as test from 'vitest';
import keyvTestSuite from '@keyv/test-suite';
import Keyv from 'keyv';
import KeyvTigris from '../index';

const store = () => new KeyvTigris();

keyvTestSuite(test, Keyv, store);
