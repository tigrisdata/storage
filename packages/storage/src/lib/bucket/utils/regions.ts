import {
  multiRegions,
  singleOrDualRegions,
  type BucketLocations,
} from '../types';

export const availableRegions: string[] = [
  ...multiRegions,
  ...singleOrDualRegions,
];

export const validateRegions = (regions: string | string[]): boolean => {
  if (Array.isArray(regions)) {
    return regions.every((region) => availableRegions.includes(region));
  }
  return availableRegions.includes(regions);
};

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
