import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/storage.js', () => ({
  getSelectedOrganization: vi.fn(),
}));

import { isFlyOrganization } from '../../src/auth/fly.js';
import { getSelectedOrganization } from '../../src/auth/storage.js';

describe('isFlyOrganization', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterEach(() => {
    vi.mocked(getSelectedOrganization).mockReset();
  });

  it('returns true when org starts with flyio_', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue('flyio_my-org');
    expect(isFlyOrganization('User management')).toBe(true);
  });

  it('prints message when org is Fly', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue('flyio_my-org');
    isFlyOrganization('User management');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('User management');
    expect(logSpy.mock.calls[0][0]).toContain('fly.io');
  });

  it('returns false when org does not start with flyio_', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue('my-regular-org');
    expect(isFlyOrganization('User management')).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('returns false when getSelectedOrganization returns null', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue(null);
    expect(isFlyOrganization('User management')).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
