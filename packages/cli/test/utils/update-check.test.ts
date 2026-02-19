import { describe, it, expect } from 'vitest';
import { isNewerVersion } from '../../src/utils/update-check.js';

describe('isNewerVersion', () => {
  it('should return true when latest major is greater', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
  });

  it('should return true when latest minor is greater', () => {
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
  });

  it('should return true when latest patch is greater', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
  });

  it('should return false when versions are equal', () => {
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
  });

  it('should return false when current is newer (major)', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(false);
  });

  it('should return false when current is newer (minor)', () => {
    expect(isNewerVersion('1.2.0', '1.1.0')).toBe(false);
  });

  it('should return false when current is newer (patch)', () => {
    expect(isNewerVersion('1.0.2', '1.0.1')).toBe(false);
  });

  it('should handle v prefix on current', () => {
    expect(isNewerVersion('v1.0.0', '2.0.0')).toBe(true);
  });

  it('should handle v prefix on latest', () => {
    expect(isNewerVersion('1.0.0', 'v2.0.0')).toBe(true);
  });

  it('should handle v prefix on both', () => {
    expect(isNewerVersion('v1.0.0', 'v1.0.1')).toBe(true);
  });

  it('should return false for malformed current version', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
  });

  it('should return false for malformed latest version', () => {
    expect(isNewerVersion('1.0.0', 'bad')).toBe(false);
  });

  it('should return false for both malformed', () => {
    expect(isNewerVersion('abc', 'xyz')).toBe(false);
  });

  it('should return false for incomplete version strings', () => {
    expect(isNewerVersion('1.0', '1.0.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0')).toBe(false);
  });

  it('should handle 0.x versions', () => {
    expect(isNewerVersion('0.0.1', '0.0.2')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(true);
    expect(isNewerVersion('0.0.1', '1.0.0')).toBe(true);
  });

  it('should return false for 0.x when current is newer', () => {
    expect(isNewerVersion('0.0.2', '0.0.1')).toBe(false);
  });

  it('should handle large version numbers', () => {
    expect(isNewerVersion('1.0.0', '1.0.100')).toBe(true);
    expect(isNewerVersion('1.99.0', '2.0.0')).toBe(true);
  });

  // Prerelease version tests
  it('should parse prerelease versions correctly', () => {
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.0-beta.2', '2.0.0')).toBe(true);
  });

  it('should consider stable newer than same-version prerelease', () => {
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0-beta.5', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.2.3-rc.1', '1.2.3')).toBe(true);
  });

  it('should not consider prerelease newer than stable of same version', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-alpha.1')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-beta.5')).toBe(false);
  });

  it('should handle prerelease to prerelease of same version', () => {
    // Same base version, both prereleases - neither is "newer"
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(false);
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.0-beta.1')).toBe(false);
  });

  it('should handle newer base version even with prerelease', () => {
    expect(isNewerVersion('1.0.0-alpha.1', '1.0.1-alpha.1')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.1-alpha.1')).toBe(true);
  });

  it('should handle v prefix with prereleases', () => {
    expect(isNewerVersion('v1.0.0-alpha.1', 'v1.0.0')).toBe(true);
    expect(isNewerVersion('v1.0.0-beta.1', '1.0.0')).toBe(true);
  });
});
