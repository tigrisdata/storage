import { TigrisStorageConfig, TigrisStorageResponse } from 'src/lib/types';
import type { UpdateBucketResponse } from '../update';
import { setBucketSettings, type SetBucketSettingsOptions } from './set';
import type { BucketCorsRule } from '../types';
import { getBucketInfo } from '../info';

const validMethods = [
  'GET',
  'HEAD',
  'PUT',
  'POST',
  'DELETE',
  'OPTIONS',
  'PATCH',
  'TRACE',
  'CONNECT',
] as const;
type CorsMethod = (typeof validMethods)[number];

export type SetBucketCorsOptions = {
  config?: Omit<TigrisStorageConfig, 'bucket'>;
  override?: boolean;
  rules: BucketCorsRule[];
};

export async function setBucketCors(
  bucketName: string,
  options?: SetBucketCorsOptions
): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>> {
  if (!options?.rules) {
    return { error: new Error('No CORS configuration provided') };
  }

  if (options.rules.length === 0) {
    const body: SetBucketSettingsOptions['body'] = { cors: null };
    return setBucketSettings(bucketName, { body, config: options?.config });
  }

  for (let i = 0; i < options.rules.length; i++) {
    const error = validateRule(options.rules[i], i);
    if (error) {
      return { error: new Error(error) };
    }
  }

  if (options.override === false) {
    const { data, error } = await getBucketInfo(bucketName, {
      config: options.config,
    });
    if (error) {
      return { error };
    }

    if (data?.settings.corsRules.length > 0) {
      options.rules = [...data.settings.corsRules, ...options.rules];
    }
  }

  const body: SetBucketSettingsOptions['body'] = {
    cors: {
      rules: options.rules.map((rule) => ({
        allowedOrigin: normalizeField(rule.allowedOrigins),
        allowedMethods: rule.allowedMethods
          ? normalizeField(rule.allowedMethods)
          : [],
        allowedHeaders: rule.allowedHeaders
          ? normalizeField(rule.allowedHeaders)
          : [],
        exposeHeaders: rule.exposeHeaders
          ? normalizeField(rule.exposeHeaders)
          : [],
        ...(rule.maxAge !== undefined ? { maxAge: rule.maxAge } : {}),
      })),
    },
  };

  return setBucketSettings(bucketName, { body, config: options?.config });
}

function normalizeField(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => v.trim());
  }

  return value === '*' ? ['*'] : value.split(',').map((v) => v.trim());
}

function validateWildcard(
  values: string[],
  field: string,
  index: number
): string | undefined {
  if (values.includes('*') && values.length > 1) {
    return `Rule ${index + 1}: ${field} cannot combine '*' with other values`;
  }
}

function validateRule(rule: BucketCorsRule, index: number): string | undefined {
  if (
    !rule.allowedOrigins ||
    normalizeField(rule.allowedOrigins).length === 0
  ) {
    return `Rule ${index + 1}: allowedOrigin is required`;
  }

  const origins = normalizeField(rule.allowedOrigins);
  const originsError = validateWildcard(origins, 'allowedOrigin', index);
  if (originsError) return originsError;

  if (rule.allowedMethods) {
    const methods = normalizeField(rule.allowedMethods);
    const methodsError = validateWildcard(methods, 'allowedMethods', index);
    if (methodsError) return methodsError;

    if (!methods.includes('*')) {
      const invalid = methods.filter(
        (m) => !validMethods.includes(m as CorsMethod)
      );
      if (invalid.length > 0) {
        return `Rule ${index + 1}: invalid methods: ${invalid.join(', ')}`;
      }
    }
  }

  if (rule.allowedHeaders) {
    const headers = normalizeField(rule.allowedHeaders);
    const headersError = validateWildcard(headers, 'allowedHeaders', index);
    if (headersError) return headersError;
  }

  if (rule.exposeHeaders) {
    const expose = normalizeField(rule.exposeHeaders);
    const exposeError = validateWildcard(expose, 'exposeHeaders', index);
    if (exposeError) return exposeError;
  }

  if (rule.maxAge !== undefined) {
    if (!Number.isInteger(rule.maxAge) || rule.maxAge <= 0) {
      return `Rule ${index + 1}: maxAge must be a positive integer`;
    }
  }
}
