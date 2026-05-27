import {
  type BucketLocationDualOrSingle,
  type BucketLocationMulti,
  type BucketLocations,
  multiRegions,
  singleOrDualRegions,
} from '../types';

/**
 * Map the wire `object_regions` string (comma-separated region codes)
 * back to a `BucketLocations` value.
 *
 * Note on the single-vs-dual ambiguity: when the wire carries exactly
 * one value from `singleOrDualRegions`, both `{ type: 'single' }` and
 * `{ type: 'dual', values: <one> }` are valid representations — the
 * server stores the same string for both. This function prefers
 * `single`, which is the more common and natural reading. Callers who
 * originally created the bucket with a one-value `dual` config will
 * read back as `single`; the underlying region selection is unchanged.
 *
 * Unrecognized values fall back to `{ type: 'global' }` so a future
 * server-side region addition doesn't crash the SDK on read.
 */
export function parseBucketLocations(
  objectRegions: string | undefined
): BucketLocations {
  if (!objectRegions || objectRegions === '') {
    return { type: 'global' };
  }

  const values = objectRegions
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (values.length === 0) {
    return { type: 'global' };
  }

  if (values.length === 1) {
    // Non-null asserted: guarded by the `length === 1` check above, but
    // marked explicitly so `noUncheckedIndexedAccess` would still compile.
    const v = values[0]!;
    if ((multiRegions as readonly string[]).includes(v)) {
      return { type: 'multi', values: v as BucketLocationMulti };
    }
    if ((singleOrDualRegions as readonly string[]).includes(v)) {
      return { type: 'single', values: v as BucketLocationDualOrSingle };
    }
    return { type: 'global' };
  }

  const allDualOrSingle = values.every((v) =>
    (singleOrDualRegions as readonly string[]).includes(v)
  );
  if (allDualOrSingle) {
    return {
      type: 'dual',
      values: values as BucketLocationDualOrSingle[],
    };
  }

  return { type: 'global' };
}

export function validateLocationValues(
  locations: BucketLocations
): { valid: true } | { valid: false; error: string } {
  switch (locations.type) {
    case 'global':
      if (locations.values) {
        return {
          valid: false,
          error: 'Global location cannot have values',
        };
      }
      return { valid: true };

    case 'multi':
      if (!multiRegions.includes(locations.values)) {
        return {
          valid: false,
          error: `Invalid multi-region location '${locations.values}', must be one of: ${multiRegions.join(', ')}`,
        };
      }
      return { valid: true };

    case 'single':
      if (!singleOrDualRegions.includes(locations.values)) {
        return {
          valid: false,
          error: `Invalid single-region location '${locations.values}', must be one of: ${singleOrDualRegions.join(', ')}`,
        };
      }
      return { valid: true };

    case 'dual': {
      const values = Array.isArray(locations.values)
        ? locations.values
        : [locations.values];

      const invalid = values.filter((v) => !singleOrDualRegions.includes(v));
      if (invalid.length > 0) {
        return {
          valid: false,
          error: `Invalid dual-region location(s) '${invalid.join(', ')}', must be from: ${singleOrDualRegions.join(', ')}`,
        };
      }
      return { valid: true };
    }

    default:
      return { valid: false, error: `Invalid location type` };
  }
}
