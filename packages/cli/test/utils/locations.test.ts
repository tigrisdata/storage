import { describe, expect, it } from 'vitest';

import { parseLocations } from '../../src/utils/locations.js';

describe('parseLocations', () => {
  it("'global' → {type: 'global'}", () => {
    expect(parseLocations('global')).toEqual({ type: 'global' });
  });

  it("'' → {type: 'global'}", () => {
    expect(parseLocations('')).toEqual({ type: 'global' });
  });

  it("[] → {type: 'global'}", () => {
    expect(parseLocations([])).toEqual({ type: 'global' });
  });

  it("'usa' → multi region", () => {
    expect(parseLocations('usa')).toEqual({ type: 'multi', values: 'usa' });
  });

  it("'eur' → multi region", () => {
    expect(parseLocations('eur')).toEqual({ type: 'multi', values: 'eur' });
  });

  it("'ams' → single region", () => {
    expect(parseLocations('ams')).toEqual({ type: 'single', values: 'ams' });
  });

  it("'sjc' → single region", () => {
    expect(parseLocations('sjc')).toEqual({ type: 'single', values: 'sjc' });
  });

  it("'ams,fra' → dual region", () => {
    expect(parseLocations('ams,fra')).toEqual({
      type: 'dual',
      values: ['ams', 'fra'],
    });
  });

  it("['ams', 'fra'] → dual region", () => {
    expect(parseLocations(['ams', 'fra'])).toEqual({
      type: 'dual',
      values: ['ams', 'fra'],
    });
  });

  it("trims whitespace: '  ams , fra  '", () => {
    expect(parseLocations('  ams , fra  ')).toEqual({
      type: 'dual',
      values: ['ams', 'fra'],
    });
  });

  it("flattens: ['ams,fra', 'sjc']", () => {
    expect(parseLocations(['ams,fra', 'sjc'])).toEqual({
      type: 'dual',
      values: ['ams', 'fra', 'sjc'],
    });
  });
});
