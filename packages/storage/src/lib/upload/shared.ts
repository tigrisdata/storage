export enum UploadAction {
  SinglepartInit = 'singlepart-init',
  MultipartInit = 'multipart-init',
  MultipartGetParts = 'multipart-get-parts',
  MultipartComplete = 'multipart-complete',
}

/**
 * Discriminated upload contract returned by `getSignedUploadUrl`.
 *
 * PUT: simple presigned URL. Submit the body as the request payload,
 * including any required headers (notably `Content-Type` when one was
 * baked into the signature).
 *
 * POST: S3 POST policy. Submit a `multipart/form-data` request with the
 * provided `fields` as hidden inputs (verbatim, in order), followed by
 * the `file` input last.
 */
export type SignedUploadUrlResponse =
  | {
      method: 'PUT';
      url: string;
      headers?: Record<string, string>;
      expiresIn: number;
    }
  | {
      method: 'POST';
      url: string;
      fields: Record<string, string>;
      expiresIn: number;
    };
