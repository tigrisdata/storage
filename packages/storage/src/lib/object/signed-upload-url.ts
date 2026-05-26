import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
  createPresignedPost,
  type PresignedPostOptions,
} from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TigrisHeaders } from '@shared/headers';
import { handleError } from '@shared/utils';
import { config, missingConfigError } from '../config';
import { createTigrisClient } from '../tigris-client';
import type { TigrisStorageConfig, TigrisStorageResponse } from '../types';
import type { SignedUploadUrlResponse } from '../upload/shared';

/**
 * S3's single-part PUT size limit (5 GiB). Used as the upper bound of a
 * POST policy `content-length-range` when only `minSize` is supplied —
 * some S3-compatible servers reject ranges with a larger maximum.
 */
const S3_MAX_SINGLE_PART_PUT_BYTES = 5 * 1024 * 1024 * 1024;

export type GetSignedUploadUrlOptions = {
  config?: TigrisStorageConfig;
  /** Seconds until expiration. Default 3600. */
  expiresIn?: number;
  /**
   * Locks the upload's `Content-Type`. With PUT, callers must send the
   * matching header; with POST, the value is baked into the form.
   */
  contentType?: string;
  /** Maximum body size in bytes. POST-only (no PUT equivalent). */
  maxSize?: number;
  /** Minimum body size in bytes. POST-only (no PUT equivalent). */
  minSize?: number;
  /**
   * User metadata. Works in both contracts — on PUT it's returned as
   * required `x-amz-meta-*` headers the client must include verbatim;
   * on POST it's baked into the policy as `x-amz-meta-*` fields.
   * Keys are lowercased to match S3 semantics.
   */
  metadata?: Record<string, string>;
  /**
   * Object ACL. Works in both contracts — on PUT it's returned as a
   * required `x-amz-acl` header; on POST it's a form field.
   */
  access?: 'public' | 'private';
  /** Browser redirect on 2xx. POST-only. */
  successActionRedirect?: string;
};

/**
 * POST is required only for knobs that PUT can't express: a body-size
 * constraint or a browser redirect on success. Everything else (content
 * type, metadata, ACL) works on a presigned PUT via signed headers.
 */
function shouldUsePost(options: GetSignedUploadUrlOptions): boolean {
  return (
    options.maxSize !== undefined ||
    options.minSize !== undefined ||
    options.successActionRedirect !== undefined
  );
}

export async function getSignedUploadUrl(
  key: string,
  options?: GetSignedUploadUrlOptions
): Promise<TigrisStorageResponse<SignedUploadUrlResponse, Error>> {
  const bucket = options?.config?.bucket ?? config.bucket;
  if (!bucket) return missingConfigError('bucket');

  const { data: client, error } = createTigrisClient(options?.config);
  if (error) return { error };

  const expiresIn = options?.expiresIn ?? 3600;
  const opts = options ?? {};

  return shouldUsePost(opts)
    ? createPostContract(client, bucket, key, expiresIn, opts)
    : createPutContract(client, bucket, key, expiresIn, opts);
}

async function createPutContract(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
  options: GetSignedUploadUrlOptions
): Promise<TigrisStorageResponse<SignedUploadUrlResponse, Error>> {
  try {
    // S3 lowercases metadata keys on store, so normalize at sign time so
    // the headers the client sends match what HEAD will return later.
    const normalizedMetadata = options.metadata
      ? Object.fromEntries(
          Object.entries(options.metadata).map(([k, v]) => [k.toLowerCase(), v])
        )
      : undefined;
    const acl = options.access
      ? options.access === 'public'
        ? 'public-read'
        : 'private'
      : undefined;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
      Metadata: normalizedMetadata,
      ACL: acl,
    });
    const url = await getSignedUrl(client, command, { expiresIn });

    const headers: Record<string, string> = {};
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    if (acl) {
      headers[TigrisHeaders.ACL] = acl;
    }
    if (normalizedMetadata) {
      for (const [k, v] of Object.entries(normalizedMetadata)) {
        headers[`${TigrisHeaders.META_PREFIX}${k}`] = v;
      }
    }

    return {
      data: {
        method: 'PUT',
        url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        expiresIn,
      },
    };
  } catch (e) {
    return handleError(e as Error);
  }
}

async function createPostContract(
  client: S3Client,
  bucket: string,
  key: string,
  expiresIn: number,
  options: GetSignedUploadUrlOptions
): Promise<TigrisStorageResponse<SignedUploadUrlResponse, Error>> {
  const conditions: NonNullable<PresignedPostOptions['Conditions']> = [];
  const fields: Record<string, string> = {};

  if (options.contentType) {
    fields['Content-Type'] = options.contentType;
    conditions.push({ 'Content-Type': options.contentType });
  }

  if (options.maxSize !== undefined || options.minSize !== undefined) {
    const min = options.minSize ?? 0;
    const max = options.maxSize ?? S3_MAX_SINGLE_PART_PUT_BYTES;
    conditions.push(['content-length-range', min, max]);
  }

  if (options.access) {
    const acl = options.access === 'public' ? 'public-read' : 'private';
    fields.acl = acl;
    conditions.push({ acl });
  }

  if (options.successActionRedirect) {
    fields.success_action_redirect = options.successActionRedirect;
    conditions.push({
      success_action_redirect: options.successActionRedirect,
    });
  }

  if (options.metadata) {
    for (const [k, v] of Object.entries(options.metadata)) {
      const headerName = `${TigrisHeaders.META_PREFIX}${k.toLowerCase()}`;
      fields[headerName] = v;
      conditions.push({ [headerName]: v });
    }
  }

  try {
    const result = await createPresignedPost(client, {
      Bucket: bucket,
      Key: key,
      Conditions: conditions.length > 0 ? conditions : undefined,
      Fields: Object.keys(fields).length > 0 ? fields : undefined,
      Expires: expiresIn,
    });

    return {
      data: {
        method: 'POST',
        url: result.url,
        fields: result.fields,
        expiresIn,
      },
    };
  } catch (e) {
    return handleError(e as Error);
  }
}
