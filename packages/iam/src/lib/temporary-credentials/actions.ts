/**
 * The actions a temporary credential's policy may grant, from
 * https://www.tigrisdata.com/docs/iam/temporary-credentials/. Bucket-level
 * actions take the bucket ARN as their resource; object-level actions take
 * `<bucket ARN>/*`.
 */
export const TEMPORARY_CREDENTIAL_ACTIONS = {
  read: {
    bucket: [
      's3:ListBucket',
      's3:ListBucketVersions',
      's3:GetBucketLocation',
      's3:GetBucketVersioning',
      's3:ListBucketMultipartUploads',
    ],
    object: [
      's3:GetObject',
      's3:GetObjectVersion',
      's3:GetObjectTagging',
      's3:GetObjectVersionTagging',
      's3:GetObjectAttributes',
    ],
  },
  write: {
    bucket: [],
    object: [
      's3:PutObject',
      's3:DeleteObject',
      's3:DeleteObjectVersion',
      's3:PutObjectTagging',
      's3:DeleteObjectTagging',
      's3:PutObjectVersionTagging',
      's3:DeleteObjectVersionTagging',
      's3:AbortMultipartUpload',
      's3:ListMultipartUploadParts',
    ],
  },
} as const;

export type TemporaryCredentialAccess = 'read' | 'write' | 'readwrite';

export type TemporaryCredentialAction =
  | (typeof TEMPORARY_CREDENTIAL_ACTIONS.read.bucket)[number]
  | (typeof TEMPORARY_CREDENTIAL_ACTIONS.read.object)[number]
  | (typeof TEMPORARY_CREDENTIAL_ACTIONS.write.object)[number];

const BUCKET_ACTIONS: readonly string[] = [
  ...TEMPORARY_CREDENTIAL_ACTIONS.read.bucket,
  ...TEMPORARY_CREDENTIAL_ACTIONS.write.bucket,
];

const OBJECT_ACTIONS: readonly string[] = [
  ...TEMPORARY_CREDENTIAL_ACTIONS.read.object,
  ...TEMPORARY_CREDENTIAL_ACTIONS.write.object,
];

/** The actions an access level grants. */
export function actionsFor(
  access: TemporaryCredentialAccess
): TemporaryCredentialAction[] {
  const { read, write } = TEMPORARY_CREDENTIAL_ACTIONS;
  return [
    ...(access !== 'write' ? [...read.bucket, ...read.object] : []),
    ...(access !== 'read' ? [...write.bucket, ...write.object] : []),
  ];
}

/**
 * Split actions by the resource they apply to. `unknown` names the first one
 * that is not a known action.
 */
export function splitActions(actions: readonly string[]): {
  bucket: string[];
  object: string[];
  unknown?: string;
} {
  const bucket: string[] = [];
  const object: string[] = [];

  for (const action of actions) {
    if (BUCKET_ACTIONS.includes(action)) {
      bucket.push(action);
    } else if (OBJECT_ACTIONS.includes(action)) {
      object.push(action);
    } else {
      return { bucket, object, unknown: action };
    }
  }

  return { bucket, object };
}
