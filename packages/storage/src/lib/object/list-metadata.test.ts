import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { parseListMetadata } from './list-metadata';
import { addListMetadataMiddleware } from './middleware';

const LISTING = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>my-bucket</Name>
  <KeyCount>3</KeyCount>
  <IsTruncated>false</IsTruncated>
  <Contents>
    <Key>photos/cat.jpg</Key>
    <LastModified>2026-11-13T18:55:17.000Z</LastModified>
    <ETag>"e496e4bb9905a7f84495ddea8e9368d7"</ETag>
    <Size>51234</Size>
    <StorageClass>STANDARD</StorageClass>
    <Metadata>
      <Name>owner</Name>
      <Value>alice</Value>
    </Metadata>
    <Metadata>
      <Name>mode</Name>
      <Value>33188</Value>
    </Metadata>
  </Contents>
  <Contents>
    <Key>photos/plain.jpg</Key>
    <LastModified>2026-11-13T18:55:18.000Z</LastModified>
    <ETag>"0cc175b9c0f1b6a831c399e269772661"</ETag>
    <Size>1</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>photos/a &amp; b.jpg</Key>
    <LastModified>2026-11-13T18:55:19.000Z</LastModified>
    <ETag>"92eb5ffee6ae2fec3ad71c777531578f"</ETag>
    <Size>2</Size>
    <StorageClass>STANDARD</StorageClass>
    <Metadata><Name>title</Name><Value>Tom &amp; Jerry &lt;3 &#xE9; <![CDATA[<raw>]]></Value></Metadata>
    <Metadata><Name>empty</Name><Value></Value></Metadata>
    <Metadata><Name>void</Name><Value/></Metadata>
  </Contents>
</ListBucketResult>`;

const EXPECTED = [
  { owner: 'alice', mode: '33188' },
  {},
  { title: 'Tom & Jerry <3 é <raw>', empty: '', void: '' },
];

describe('parseListMetadata', () => {
  it('returns one record per Contents entry, in order', () => {
    expect(parseListMetadata(LISTING)).toEqual(EXPECTED);
  });

  it('returns nothing for a listing without objects', () => {
    expect(
      parseListMetadata(
        '<ListBucketResult><Name>b</Name><KeyCount>0</KeyCount></ListBucketResult>'
      )
    ).toEqual([]);
    expect(parseListMetadata('')).toEqual([]);
  });

  it('handles a single object with a single metadata value', () => {
    expect(
      parseListMetadata(
        '<ListBucketResult><Contents><Key>a</Key><Metadata><Name>owner</Name><Value>alice</Value></Metadata></Contents></ListBucketResult>'
      )
    ).toEqual([{ owner: 'alice' }]);
  });

  it('keeps a metadata key named __proto__', () => {
    const [metadata] = parseListMetadata(
      '<ListBucketResult><Contents><Key>a</Key><Metadata><Name>__proto__</Name><Value>x</Value></Metadata><Metadata><Name>owner</Name><Value>alice</Value></Metadata></Contents></ListBucketResult>'
    );

    expect(Object.entries(metadata)).toEqual([
      ['__proto__', 'x'],
      ['owner', 'alice'],
    ]);
    expect(Object.getPrototypeOf(metadata)).toBe(Object.prototype);
  });

  it('returns nothing for a body that is not a listing', () => {
    expect(parseListMetadata('<ListBucketResult><Contents>')).toEqual([]);
    expect(parseListMetadata('<Error><Code>Oops</Code></Error>')).toEqual([]);
  });
});

// Runs the real AWS SDK pipeline against a canned response: the middleware has
// to read the body *before* the SDK's deserializer drops the `<Metadata>`
// elements, and still leave the deserializer a body it can parse.
describe('addListMetadataMiddleware', () => {
  function clientReturning(
    statusCode: number,
    body: string,
    seen: { headers?: Record<string, string> }
  ) {
    return new S3Client({
      region: 'auto',
      endpoint: 'https://t3.storage.dev',
      credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      requestHandler: {
        handle: async (request: { headers: Record<string, string> }) => {
          seen.headers = request.headers;
          return {
            response: {
              statusCode,
              headers: { 'content-type': 'application/xml' },
              body: new Blob([body]).stream(),
            },
          };
        },
      } as never,
    });
  }

  it('sends the header and captures metadata alongside the parsed listing', async () => {
    const seen: { headers?: Record<string, string> } = {};
    const client = clientReturning(200, LISTING, seen);
    const command = new ListObjectsV2Command({ Bucket: 'my-bucket' });

    let captured: Record<string, string>[] | undefined;
    addListMetadataMiddleware(
      command.middlewareStack,
      client.config.streamCollector,
      (metadata) => {
        captured = metadata;
      }
    );

    const res = await client.send(command);

    expect(seen.headers?.['X-Tigris-List-Metadata']).toBe('true');
    expect(res.Contents?.map((c) => c.Key)).toEqual([
      'photos/cat.jpg',
      'photos/plain.jpg',
      'photos/a & b.jpg',
    ]);
    expect(res.Contents?.[0].Size).toBe(51234);
    expect(captured).toEqual(EXPECTED);
  });

  it('leaves error responses to the SDK', async () => {
    const client = clientReturning(
      403,
      '<Error><Code>AccessDenied</Code><Message>Access Denied.</Message></Error>',
      {}
    );
    const command = new ListObjectsV2Command({ Bucket: 'my-bucket' });

    let called = false;
    addListMetadataMiddleware(
      command.middlewareStack,
      client.config.streamCollector,
      () => {
        called = true;
      }
    );

    await expect(client.send(command)).rejects.toMatchObject({
      name: 'AccessDenied',
    });
    expect(called).toBe(false);
  });
});
