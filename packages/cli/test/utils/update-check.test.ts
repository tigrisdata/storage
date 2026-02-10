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
});
