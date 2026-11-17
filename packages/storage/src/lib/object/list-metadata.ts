import { parseXML } from '@aws-sdk/xml-builder';

type ParsedMetadata = { Name?: unknown; Value?: unknown };
type ParsedContents = { Metadata?: ParsedMetadata | ParsedMetadata[] };
type ParsedListing = {
  ListBucketResult?: { Contents?: ParsedContents | ParsedContents[] };
};

/**
 * Pull the user metadata out of a raw `ListObjectsV2` response body.
 *
 * With `X-Tigris-List-Metadata`, every `<Contents>` entry carries one
 * `<Metadata><Name>…</Name><Value>…</Value></Metadata>` element per value.
 * Those elements are a Tigris extension, so the AWS SDK's deserializer drops
 * them — this reads them from the XML instead.
 *
 * Returns one record per `<Contents>` entry, in document order (empty when the
 * object has no user metadata), so the result lines up by index with the
 * SDK's parsed `Contents`.
 *
 * Parsing uses `parseXML` from `@aws-sdk/xml-builder` — the same parser
 * `@aws-sdk/client-s3` runs over this very response — so the two can never
 * disagree about where an entry starts or ends, and no second XML parser ends
 * up in the bundle. It is an internal AWS package with no documented contract
 * for its output shape; `list-metadata.test.ts` pins the shape relied on here,
 * so an SDK upgrade that changes it fails the tests rather than silently
 * returning empty metadata.
 */
export function parseListMetadata(xml: string): Record<string, string>[] {
  let root: ParsedListing | undefined;
  try {
    root = parseXML(xml);
  } catch {
    // Not a parsable listing. Report no metadata and let the SDK's own
    // deserializer, which parses the same body next, raise the real error.
    return [];
  }

  // The parser yields a bare value for an element that appears once and an
  // array for one that repeats; `[x ?? []].flat()` normalizes both to an array.
  return [root?.ListBucketResult?.Contents ?? []].flat().map((entry) =>
    // `Object.fromEntries` defines each key as an own property, so a metadata
    // key like `__proto__` is kept rather than swallowed by the inherited
    // setter that a plain `record[key] = value` assignment would hit.
    Object.fromEntries(
      [entry?.Metadata ?? []]
        .flat()
        .filter(({ Name }) => typeof Name === 'string' && Name)
        .map(({ Name, Value }) => [
          Name,
          typeof Value === 'string' ? Value : '',
        ])
    )
  );
}
