import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/auth/storage.js', () => ({
  getSelectedOrganization: vi.fn(),
}));

import {
  flyOrganizationNotice,
  isFlyOrganization,
  isFlyOrganizationId,
} from '../../src/auth/fly.js';
import { getSelectedOrganization } from '../../src/auth/storage.js';

describe('isFlyOrganization', () => {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterEach(() => {
    vi.mocked(getSelectedOrganization).mockReset();
  });

  it('checks a given org id instead of the selected one when asked', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue('my-regular-org');
    expect(isFlyOrganization('Organization deletion', 'flyio_other')).toBe(
      true
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(isFlyOrganization('Organization deletion', 'to_123')).toBe(false);
  });

  it('prints the same notice it exposes', () => {
    vi.mocked(getSelectedOrganization).mockReturnValue('flyio_my-org');
    isFlyOrganization('User management');
    expect(logSpy.mock.calls[0][0]).toBe(
      flyOrganizationNotice('User management')
    );
  });

  it('exposes the bare check without printing', () => {
    expect(isFlyOrganizationId('flyio_x')).toBe(true);
    expect(isFlyOrganizationId('to_x')).toBe(false);
    expect(isFlyOrganizationId(null)).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
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
