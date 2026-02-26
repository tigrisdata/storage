export const multiRegions = ['usa', 'eur'] as const;
export const singleOrDualRegions = [
  'ams', 'fra', 'gru', 'iad', 'jnb', 'lhr', 'nrt', 'ord', 'sin', 'sjc', 'syd',
] as const;

export type StorageClass =
  | 'STANDARD'
  | 'STANDARD_IA'
  | 'GLACIER'
  | 'GLACIER_IR';

export type BucketLocationMulti = (typeof multiRegions)[number];

export type BucketLocationDaulOrSingle = (typeof singleOrDualRegions)[number];

export type BucketLocations = {
  // Highest availability with data residency across regions in the chosen geo. Strong consistency globally.
  type: 'multi',
  values: BucketLocationMulti,
} | {
  // High availability with data residency across regions of choice. Strong consistency for requests in same region, eventual consistency globally.
  type: 'dual',
  values: BucketLocationDaulOrSingle | BucketLocationDaulOrSingle[],
} | {
  // Data redundancy across availability zones in a single region. Strong consistency globally.
  type: 'single',
  values: BucketLocationDaulOrSingle,
} | {
  // Data distributed globally. Strong consistency for requests in same region, eventual consistency globally.
  type: 'global',
  values?: never,
};

export type BucketMigration = {
  enabled: boolean;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  name?: string;
  endpoint?: string;
  writeThrough?: boolean;
};

export type BucketTtl = {
  id?: string;
  enabled?: boolean;
  days?: number;
  date?: string;
};

export type BucketLifecycleRule = {
  id?: string;
  enabled?: boolean;
  storageClass?: Omit<StorageClass, 'STANDARD'>;
  days?: number;
  date?: string;
};
