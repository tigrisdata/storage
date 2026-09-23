import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/login/credentials.js', () => ({
  default: vi.fn(async () => {}),
}));
vi.mock('../../src/lib/login/oauth.js', () => ({
  oauth: vi.fn(async () => {}),
}));

import select from '../../src/browser/shims/login-select.js';
import credentials from '../../src/lib/login/credentials.js';
import { oauth } from '../../src/lib/login/oauth.js';

describe('browser login picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('goes straight to OAuth when no access key is given', async () => {
    await select({});
    expect(oauth).toHaveBeenCalledOnce();
    expect(credentials).not.toHaveBeenCalled();
  });

  it.each([
    { 'access-key': 'tid_AaBb', 'access-secret': 'tsec_XxYy' },
    { accessKey: 'tid_AaBb' },
    { secret: 'tsec_XxYy' },
  ])('uses the access key flow when %o is given', async (options) => {
    await select(options);
    expect(credentials).toHaveBeenCalledWith(options);
    expect(oauth).not.toHaveBeenCalled();
  });
});
