import { describe, it, expect } from 'vitest';
import { getOption } from '../../src/utils/options.js';

describe('getOption', () => {
  it('should return value for first matching key', () => {
    const options = { name: 'test', alias: 'other' };
    const result = getOption<string>(options, ['name', 'n']);
    expect(result).toBe('test');
  });

  it('should check alias when primary key not found', () => {
    const options = { n: 'test' };
    const result = getOption<string>(options, ['name', 'n']);
    expect(result).toBe('test');
  });

  it('should return undefined when no key matches', () => {
    const options = { other: 'value' };
    const result = getOption<string>(options, ['name', 'n']);
    expect(result).toBeUndefined();
  });

  it('should return default value when no key matches', () => {
    const options = { other: 'value' };
    const result = getOption<string>(options, ['name', 'n'], 'default');
    expect(result).toBe('default');
  });

  it('should return first matching key even if later keys also match', () => {
    const options = { name: 'primary', n: 'alias' };
    const result = getOption<string>(options, ['name', 'n']);
    expect(result).toBe('primary');
  });

  it('should handle boolean values', () => {
    const options = { force: true };
    const result = getOption<boolean>(options, ['force', 'f']);
    expect(result).toBe(true);
  });

  it('should handle false boolean values (not treat as undefined)', () => {
    const options = { force: false };
    const result = getOption<boolean>(options, ['force', 'f'], true);
    expect(result).toBe(false);
  });

  it('should handle numeric values', () => {
    const options = { limit: 10 };
    const result = getOption<number>(options, ['limit', 'l']);
    expect(result).toBe(10);
  });

  it('should handle array values', () => {
    const options = { files: ['a.txt', 'b.txt'] };
    const result = getOption<string[]>(options, ['files']);
    expect(result).toEqual(['a.txt', 'b.txt']);
  });
});
