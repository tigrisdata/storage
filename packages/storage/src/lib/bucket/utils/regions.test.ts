import { describe, expect, it } from 'vitest';
import { parseBucketLocations } from './regions';

describe('parseBucketLocations', () => {
  it('returns global for empty, undefined, or whitespace-only input', () => {
    expect(parseBucketLocations(undefined)).toEqual({ type: 'global' });
    expect(parseBucketLocations('')).toEqual({ type: 'global' });
    expect(parseBucketLocations(',')).toEqual({ type: 'global' });
    expect(parseBucketLocations(' , ')).toEqual({ type: 'global' });
  });

  it('returns multi for a single multi-region value', () => {
    expect(parseBucketLocations('usa')).toEqual({
      type: 'multi',
      values: 'usa',
    });
    expect(parseBucketLocations('eur')).toEqual({
      type: 'multi',
      values: 'eur',
    });
  });

  it('returns single for a single value from singleOrDualRegions', () => {
    // Single is preferred over dual when one value is present; the wire
    // form is ambiguous and `single` is the more natural reading.
    expect(parseBucketLocations('ams')).toEqual({
      type: 'single',
      values: 'ams',
    });
  });

  it('returns dual for multiple values from singleOrDualRegions', () => {
    expect(parseBucketLocations('ams,fra')).toEqual({
      type: 'dual',
      values: ['ams', 'fra'],
    });
    // Tolerates whitespace.
    expect(parseBucketLocations('ams, fra ,iad')).toEqual({
      type: 'dual',
      values: ['ams', 'fra', 'iad'],
    });
  });

  it('falls back to global for unrecognized values', () => {
    expect(parseBucketLocations('mars')).toEqual({ type: 'global' });
    expect(parseBucketLocations('ams,mars')).toEqual({ type: 'global' });
  });

  it('falls back to global for multiple multi-region values', () => {
    // `usa` and `eur` are valid as a single `multi` value but not combinable
    // — multi-region codes aren't in `singleOrDualRegions`, so the dual
    // branch rejects them. Documents the fallback rather than asserting
    // a different semantic for unsupported combinations.
    expect(parseBucketLocations('usa,eur')).toEqual({ type: 'global' });
  });
});
