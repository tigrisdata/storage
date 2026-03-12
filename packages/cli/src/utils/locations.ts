import type { BucketLocations } from '@tigrisdata/storage';
import enquirer from 'enquirer';

const { prompt } = enquirer;

type Multi = Extract<BucketLocations, { type: 'multi' }>;
type Single = Extract<BucketLocations, { type: 'single' }>;
type Dual = Extract<BucketLocations, { type: 'dual' }>;

const multiRegions: string[] = ['usa', 'eur'];

const multiRegionChoices = [
  { name: 'USA', value: 'usa' },
  { name: 'Europe', value: 'eur' },
];

const singleRegionChoices = [
  { name: 'Amsterdam, Netherlands (AMS)', value: 'ams' },
  { name: 'Frankfurt, Germany (FRA)', value: 'fra' },
  { name: 'Sao Paulo, Brazil (GRU)', value: 'gru' },
  { name: 'Ashburn, Virginia (IAD)', value: 'iad' },
  { name: 'Johannesburg, South Africa (JNB)', value: 'jnb' },
  { name: 'London, United Kingdom (LHR)', value: 'lhr' },
  { name: 'Tokyo, Japan (NRT)', value: 'nrt' },
  { name: 'Chicago, Illinois (ORD)', value: 'ord' },
  { name: 'Singapore, Singapore (SIN)', value: 'sin' },
  { name: 'San Jose, California (SJC)', value: 'sjc' },
  { name: 'Sydney, Australia (SYD)', value: 'syd' },
];

async function promptRegion(
  locationType: string
): Promise<BucketLocations | null> {
  try {
    if (locationType === 'multi') {
      const { region } = await prompt<{ region: string }>({
        type: 'select',
        name: 'region',
        message: 'Multi-region:',
        choices: multiRegionChoices.map((c) => ({
          name: c.value,
          message: c.name,
        })),
      });
      return parseLocations(region);
    }

    if (locationType === 'single') {
      const { region } = await prompt<{ region: string }>({
        type: 'select',
        name: 'region',
        message: 'Region:',
        choices: singleRegionChoices.map((c) => ({
          name: c.value,
          message: c.name,
        })),
      });
      return parseLocations(region);
    }

    // dual
    const { regions } = await prompt<{ regions: string[] }>({
      type: 'multiselect',
      name: 'regions',
      message:
        'Press space key to select regions (multiple supported) and enter to confirm:',
      choices: singleRegionChoices.map((c) => ({
        name: c.value,
        message: c.name,
      })),
    } as Parameters<typeof prompt>[0]);

    if (regions.length < 2) {
      throw new Error('Dual region requires at least two regions');
    }

    return parseLocations(regions);
  } catch (err) {
    // User pressed Escape — return null to go back
    if (err === '') {
      return null;
    }

    throw err;
  }
}

export async function promptLocations(): Promise<BucketLocations> {
  let locationType: string;
  try {
    ({ locationType } = await prompt<{ locationType: string }>({
      type: 'select',
      name: 'locationType',
      message: 'Location type:',
      choices: [
        { name: 'global', message: 'Global' },
        { name: 'multi', message: 'Multi-region (USA or Europe)' },
        { name: 'dual', message: 'Dual region' },
        { name: 'single', message: 'Single region' },
      ],
    }));
  } catch {
    throw new Error('Location selection cancelled');
  }

  if (locationType === 'global') {
    return { type: 'global' };
  }

  const result = await promptRegion(locationType);
  // Escape was pressed in sub-menu — go back to location type
  return result ?? promptLocations();
}

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
