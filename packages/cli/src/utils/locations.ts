import type { BucketLocations } from '@tigrisdata/storage';

type Multi = Extract<BucketLocations, { type: 'multi' }>;
type Single = Extract<BucketLocations, { type: 'single' }>;
type Dual = Extract<BucketLocations, { type: 'dual' }>;

const multiRegions: string[] = ['usa', 'eur'];

export const multiRegionChoices = [
  { name: 'USA', value: 'usa' },
  { name: 'Europe', value: 'eur' },
];

export const singleRegionChoices = [
  { name: 'Amsterdam, Netherlands', value: 'ams' },
  { name: 'Frankfurt, Germany', value: 'fra' },
  { name: 'Sao Paulo, Brazil', value: 'gru' },
  { name: 'Ashburn, Virginia (US)', value: 'iad' },
  { name: 'Johannesburg, South Africa', value: 'jnb' },
  { name: 'London, United Kingdom', value: 'lhr' },
  { name: 'Tokyo, Japan', value: 'nrt' },
  { name: 'Chicago, Illinois (US)', value: 'ord' },
  { name: 'Singapore, Singapore', value: 'sin' },
  { name: 'San Jose, California (US)', value: 'sjc' },
  { name: 'Sydney, Australia', value: 'syd' },
];

export function parseLocations(input: string | string[]): BucketLocations {
  const values = (Array.isArray(input) ? input : [input])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

  if (values.length === 0 || (values.length === 1 && values[0] === 'global')) {
    return { type: 'global' };
  }

  if (values.length === 1) {
    const val = values[0];
    if (multiRegions.includes(val)) {
      return { type: 'multi', values: val as Multi['values'] };
    }
    return { type: 'single', values: val as Single['values'] };
  }

  return {
    type: 'dual',
    values: values as Dual['values'],
  };
}
