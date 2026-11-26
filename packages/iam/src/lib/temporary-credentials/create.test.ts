import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemporaryCredentials } from './create';

const SUCCESS = `<?xml version="1.0" encoding="UTF-8"?>
<GetFederationTokenResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetFederationTokenResult><Credentials><AccessKeyId>tsid_a</AccessKeyId><SecretAccessKey>tssec_a</SecretAccessKey><SessionToken>tsts1a&amp;b</SessionToken><Expiration>2026-11-24T10:39:40Z</Expiration></Credentials><FederatedUser><Arn>arn:aws:sts::to_org:federated-user/ci</Arn><FederatedUserId>to_org:ci</FederatedUserId></FederatedUser></GetFederationTokenResult><ResponseMetadata><RequestId>1</RequestId></ResponseMetadata></GetFederationTokenResponse>`;

let fetchMock: ReturnType<typeof vi.fn>;
let uniqueSuffix = 0;

/** Clients are cached by endpoint; give each test its own. */
function config(extra: Record<string, unknown> = {}) {
  return {
    accessKeyId: 'tid_key',
    secretAccessKey: 'tsec_key',
    stsEndpoint: `https://sts${uniqueSuffix++}.example.com`,
    ...extra,
  };
}

function sentBody(): URLSearchParams {
  return new URLSearchParams(
    (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
  );
}

function sentPolicy(): {
  Version: string;
  Statement: { Effect: string; Action: string[]; Resource: string }[];
} {
  return JSON.parse(sentBody().get('Policy') as string);
}

beforeEach(() => {
  for (const name of [
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
    'TIGRIS_SESSION_TOKEN',
    'TIGRIS_STS_ENDPOINT',
  ]) {
    vi.stubEnv(name, '');
  }
  fetchMock = vi.fn(async () => new Response(SUCCESS, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createTemporaryCredentials', () => {
  it('sends a signed GetFederationToken request to STS', async () => {
    const options = { config: config(), bucket: 'b', access: 'read' as const };

    const { error } = await createTemporaryCredentials('ci', {
      ...options,
      durationSeconds: 3600,
    });

    expect(error).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe(`${options.config.stsEndpoint}/`);
    expect(init.method).toBe('POST');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(headers.authorization).toContain('/auto/sts/aws4_request');

    const body = sentBody();
    expect(body.get('Action')).toBe('GetFederationToken');
    expect(body.get('Version')).toBe('2011-06-15');
    expect(body.get('Name')).toBe('ci');
    expect(body.get('DurationSeconds')).toBe('3600');
  });

  it('leaves the duration to the gateway when not given', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
    });

    expect(sentBody().has('DurationSeconds')).toBe(false);
  });

  it('returns credentials ready for @tigrisdata/storage', async () => {
    const { data } = await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
    });

    expect(data).toEqual({
      accessKeyId: 'tsid_a',
      secretAccessKey: 'tssec_a',
      sessionToken: 'tsts1a&b',
      expiration: new Date('2026-11-24T10:39:40Z'),
      federatedUser: {
        id: 'to_org:ci',
        arn: 'arn:aws:sts::to_org:federated-user/ci',
      },
    });
  });

  it('puts bucket-level and object-level actions on their own resources', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
    });

    const policy = sentPolicy();
    expect(policy.Version).toBe('2012-10-17');
    expect(policy.Statement).toEqual([
      {
        Effect: 'Allow',
        Action: expect.arrayContaining(['s3:ListBucket']),
        Resource: 'arn:aws:s3:::b',
      },
      {
        Effect: 'Allow',
        Action: expect.arrayContaining(['s3:GetObject']),
        Resource: 'arn:aws:s3:::b/*',
      },
    ]);
  });

  it('grants only object actions for write access', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'write',
    });

    const { Statement } = sentPolicy();
    expect(Statement).toHaveLength(1);
    expect(Statement[0].Resource).toBe('arn:aws:s3:::b/*');
    expect(Statement[0].Action).toContain('s3:PutObject');
    expect(Statement[0].Action).not.toContain('s3:GetObject');
  });

  it('grants both sets for readwrite', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'readwrite',
    });

    const actions = sentPolicy().Statement.flatMap((s) => s.Action);
    expect(actions).toHaveLength(19);
  });

  it('adds exact actions to an access level without repeating any', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
      actions: ['s3:PutObject', 's3:GetObject'],
    });

    const actions = sentPolicy().Statement.flatMap((s) => s.Action);
    expect(actions).toContain('s3:PutObject');
    expect(actions.filter((a) => a === 's3:GetObject')).toHaveLength(1);
  });

  it('sends a full policy as given', async () => {
    await createTemporaryCredentials('ci', {
      config: config(),
      policy: {
        version: '2012-10-17',
        statements: [
          {
            effect: 'Allow',
            action: ['s3:GetObject'],
            resource: 'arn:aws:s3:::b/*',
          },
        ],
      },
    });

    expect(sentPolicy()).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::b/*',
        },
      ],
    });
  });

  it('reports the gateway message when it refuses the policy', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          '<?xml version="1.0" encoding="UTF-8"?>\n<ErrorResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><Error><Type>Sender</Type><Code>MalformedPolicyDocument</Code><Message>Statement 0: only Effect Allow is supported</Message></Error><RequestId>1</RequestId></ErrorResponse>',
          { status: 400, statusText: 'Bad Request' }
        )
    );

    const { error } = await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
    });

    expect(error?.message).toBe('Statement 0: only Effect Allow is supported');
  });

  it('fails on a response without credentials', async () => {
    fetchMock.mockImplementation(
      async () => new Response('<Other/>', { status: 200 })
    );

    const { error } = await createTemporaryCredentials('ci', {
      config: config(),
      bucket: 'b',
      access: 'read',
    });

    expect(error?.message).toBe('Unexpected response from GetFederationToken');
  });

  describe('refuses before calling STS', () => {
    it.each([
      ['a name that is too short', 'x', {}, 'Invalid name "x"'],
      ['a name with a space', 'my key', {}, 'Invalid name "my key"'],
      ['a name longer than 32 characters', 'a'.repeat(33), {}, 'Invalid name'],
      [
        'a duration below the minimum',
        'ci',
        { durationSeconds: 899 },
        'Invalid durationSeconds 899',
      ],
      [
        'a duration above the maximum',
        'ci',
        { durationSeconds: 129_601 },
        'Invalid durationSeconds 129601',
      ],
      [
        'a fractional duration',
        'ci',
        { durationSeconds: 900.5 },
        'Invalid durationSeconds 900.5',
      ],
      [
        'no bucket',
        'ci',
        { bucket: undefined },
        'bucket is required unless policy is given',
      ],
      [
        'nothing to grant',
        'ci',
        { access: undefined },
        'Pass access or actions',
      ],
      [
        'an unknown access level',
        'ci',
        { access: 'admin' },
        'Invalid access "admin"',
      ],
      [
        'an action outside the supported list',
        'ci',
        { actions: ['s3:PutBucketPolicy'] },
        'Action "s3:PutBucketPolicy" can\'t be granted',
      ],
      [
        'a policy together with a bucket',
        'ci',
        { policy: { version: '2012-10-17', statements: [] } },
        'Pass either policy, or bucket',
      ],
    ])('%s', async (_, name, overrides, message) => {
      const { error } = await createTemporaryCredentials(name, {
        config: config(),
        bucket: 'b',
        access: 'read',
        ...(overrides as object),
      });

      expect(error?.message).toContain(message);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('a policy over 2048 bytes', async () => {
      const { error } = await createTemporaryCredentials('ci', {
        config: config(),
        policy: {
          version: '2012-10-17',
          statements: [
            {
              effect: 'Allow',
              action: 's3:GetObject',
              resource: `arn:aws:s3:::${'b'.repeat(2048)}/*`,
            },
          ],
        },
      });

      expect(error?.message).toContain('larger than 2048 bytes');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('an OAuth session, which STS does not accept', async () => {
      const { error } = await createTemporaryCredentials('ci', {
        config: {
          sessionToken: 'oauth',
          organizationId: 'org',
          stsEndpoint: `https://sts${uniqueSuffix++}.example.com`,
        },
        bucket: 'b',
        access: 'read',
      });

      expect(error?.message).toContain('an OAuth session cannot issue them');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('no access key at all', async () => {
      const { error } = await createTemporaryCredentials('ci', {
        config: { stsEndpoint: `https://sts${uniqueSuffix++}.example.com` },
        bucket: 'b',
        access: 'read',
      });

      expect(error?.message).toBe(
        'An access key is required to issue temporary credentials'
      );
    });
  });
});
