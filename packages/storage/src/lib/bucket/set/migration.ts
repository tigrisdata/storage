import type { TigrisStorageConfig, TigrisStorageResponse } from '../../types';
import type { BucketMigration, UpdateBucketResponse } from '../types';
import { type SetBucketSettingsOptions, setBucketSettings } from './set';

export type SetBucketMigrationOptions = {
  dataMigration?: BucketMigration;
  config?: Omit<TigrisStorageConfig, 'bucket'>;
};

const MAX_SKIP_PATTERNS = 32;
const MAX_SKIP_PATTERN_BYTES = 512;

// Mirrors the gateway's validation so bad input fails before the request.
function validateSkipPatterns(patterns: string[]): string | undefined {
  if (patterns.length > MAX_SKIP_PATTERNS) {
    return `At most ${MAX_SKIP_PATTERNS} skip patterns are allowed`;
  }
  for (const pattern of patterns) {
    const bytes = new TextEncoder().encode(pattern).length;
    if (bytes === 0 || bytes > MAX_SKIP_PATTERN_BYTES) {
      return `Skip patterns must be 1 to ${MAX_SKIP_PATTERN_BYTES} bytes`;
    }
    if (/[\0\r\n]/.test(pattern)) {
      return 'Skip patterns cannot contain NUL or line break characters';
    }
    if (/^[*/]+$/.test(pattern)) {
      return `Skip pattern "${pattern}" would match every object`;
    }
  }
  return undefined;
}

export async function setBucketMigration(
  bucketName: string,
  options?: SetBucketMigrationOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  const body: SetBucketSettingsOptions['body'] = {};
  if (options?.dataMigration !== undefined) {
    if (!options.dataMigration.enabled) {
      body.shadow_bucket = {};
    } else {
      if (
        options.dataMigration.accessKey &&
        options.dataMigration.secretKey &&
        options.dataMigration.region &&
        options.dataMigration.name &&
        options.dataMigration.endpoint
      ) {
        const { skipPatterns } = options.dataMigration;
        if (skipPatterns !== undefined) {
          const error = validateSkipPatterns(skipPatterns);
          if (error) {
            return { error: new Error(error) };
          }
        }

        // The gateway replaces the whole shadow config on update, so every
        // field, including skip patterns, is sent together.
        body.shadow_bucket = {
          access_key: options.dataMigration.accessKey,
          secret_key: options.dataMigration.secretKey,
          region: options.dataMigration.region,
          name: options.dataMigration.name,
          endpoint: options.dataMigration.endpoint,
          write_through: !!options.dataMigration.writeThrough,
          ...(skipPatterns !== undefined
            ? { skip_patterns: skipPatterns }
            : {}),
        };
      } else {
        return {
          error: new Error('Missing required data migration fields'),
        };
      }
    }
  }

  if (Object.keys(body).length === 0) {
    return {
      error: new Error('No data migration settings provided'),
    };
  }

  return setBucketSettings(bucketName, { body, config: options?.config });
}
