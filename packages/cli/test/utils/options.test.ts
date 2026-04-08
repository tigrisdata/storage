import { describe, expect, it } from 'vitest';

import { getOption, getPaginationOptions } from '../../src/utils/options.js';

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

describe('getPaginationOptions', () => {
  it('returns isPaginated=false when no pagination flags provided', () => {
    const result = getPaginationOptions({ format: 'json' });
    expect(result).toEqual({
      limit: undefined,
      pageToken: undefined,
      isPaginated: false,
    });
  });

  it('extracts limit and sets isPaginated=true', () => {
    const result = getPaginationOptions({ limit: 10 });
    expect(result).toEqual({
      limit: 10,
      pageToken: undefined,
      isPaginated: true,
    });
  });

  it('extracts page-token (kebab-case) and sets isPaginated=true', () => {
    const result = getPaginationOptions({ 'page-token': 'abc123' });
    expect(result).toEqual({
      limit: undefined,
      pageToken: 'abc123',
      isPaginated: true,
    });
  });

  it('extracts pageToken (camelCase from Commander) and sets isPaginated=true', () => {
    const result = getPaginationOptions({ pageToken: 'abc123' });
    expect(result).toEqual({
      limit: undefined,
      pageToken: 'abc123',
      isPaginated: true,
    });
  });

  it('extracts both limit and page-token', () => {
    const result = getPaginationOptions({
      limit: 25,
      pageToken: 'token-xyz',
    });
    expect(result).toEqual({
      limit: 25,
      pageToken: 'token-xyz',
      isPaginated: true,
    });
  });

  it('extracts pt alias', () => {
    const result = getPaginationOptions({ pt: 'short-token' });
    expect(result).toEqual({
      limit: undefined,
      pageToken: 'short-token',
      isPaginated: true,
    });
  });

  it('coerces string limit from Commander to number', () => {
    const result = getPaginationOptions({ limit: '10' });
    expect(result).toEqual({
      limit: 10,
      pageToken: undefined,
      isPaginated: true,
    });
  });
});
