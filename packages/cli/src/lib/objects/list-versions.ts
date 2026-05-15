import { getStorageConfig } from '@auth/provider.js';
import { listVersions } from '@tigrisdata/storage';
import { failWithError } from '@utils/exit.js';
import {
  formatJson,
  formatSize,
  formatTable,
  formatXml,
  type TableColumn,
} from '@utils/format.js';
import { msg, printEmpty, printStart, printSuccess } from '@utils/messages.js';
import { getFormat, getOption, getPaginationOptions } from '@utils/options.js';
import { parseAnyPath } from '@utils/path.js';

const context = msg('objects', 'list-versions');

export default async function listObjectVersions(
  options: Record<string, unknown>
) {
  printStart(context);

  const bucketArg = getOption<string>(options, ['bucket']);
  const prefixFlag = getOption<string>(options, ['prefix', 'p', 'P']);
  const delimiter = getOption<string>(options, ['delimiter', 'd']);
  const keyMarker = getOption<string>(options, ['key-marker', 'keyMarker']);
  const versionIdMarker = getOption<string>(options, [
    'version-id-marker',
    'versionIdMarker',
  ]);
  const format = getFormat(options);
  const { limit } = getPaginationOptions(options);

  if (!bucketArg) {
    failWithError(context, 'Bucket name is required');
  }

  const parsed = parseAnyPath(bucketArg);
  const bucket = parsed.bucket;
  const prefix = prefixFlag || parsed.path || undefined;

  const config = await getStorageConfig();

  const { data, error } = await listVersions({
    prefix,
    ...(delimiter ? { delimiter } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(keyMarker ? { keyMarker } : {}),
    ...(versionIdMarker ? { versionIdMarker } : {}),
    config: {
      ...config,
      bucket,
    },
  });

  if (error) {
    failWithError(context, error);
  }

  const versionRows = data.versions.map((v) => ({
    key: v.name,
    versionId: v.versionId,
    latest: v.isLatest ? 'yes' : '',
    size: formatSize(v.size),
    modified: v.lastModified,
  }));

  const deleteMarkerRows = data.deleteMarkers.map((m) => ({
    key: m.name,
    versionId: m.versionId,
    latest: m.isLatest ? 'yes' : '',
    modified: m.lastModified,
  }));

  const versionColumns: TableColumn[] = [
    { key: 'key', header: 'Key' },
    { key: 'versionId', header: 'Version ID' },
    { key: 'latest', header: 'Latest' },
    { key: 'size', header: 'Size' },
    { key: 'modified', header: 'Modified' },
  ];

  const deleteMarkerColumns: TableColumn[] = [
    { key: 'key', header: 'Key' },
    { key: 'versionId', header: 'Version ID' },
    { key: 'latest', header: 'Latest' },
    { key: 'modified', header: 'Modified' },
  ];

  // JSON / XML always emit a valid response object — even when both
  // arrays are empty — so downstream `jq` / parser consumers don't
  // have to special-case the no-results path. The human-readable
  // "empty" message only fires in table mode.
  if (format === 'json') {
    // Mirror the S3 ListObjectVersions response shape so downstream
    // `jq` users get the same ergonomics as `aws s3api`.
    console.log(
      formatJson({
        versions: data.versions,
        deleteMarkers: data.deleteMarkers,
        commonPrefixes: data.commonPrefixes,
        nextKeyMarker: data.nextKeyMarker,
        nextVersionIdMarker: data.nextVersionIdMarker,
        hasMore: data.hasMore,
      })
    );
  } else if (format === 'xml') {
    const lines = ['<listVersions>'];
    lines.push(
      '  ' +
        formatXml(versionRows, 'versions', 'version').replace(/\n/g, '\n  ')
    );
    lines.push(
      '  ' +
        formatXml(deleteMarkerRows, 'deleteMarkers', 'deleteMarker').replace(
          /\n/g,
          '\n  '
        )
    );
    lines.push('</listVersions>');
    console.log(lines.join('\n'));
  } else {
    if (versionRows.length === 0 && deleteMarkerRows.length === 0) {
      printEmpty(context);
      return;
    }
    if (versionRows.length > 0) {
      console.log('\nVersions');
      console.log(formatTable(versionRows, versionColumns));
    }
    if (deleteMarkerRows.length > 0) {
      console.log('Delete Markers');
      console.log(formatTable(deleteMarkerRows, deleteMarkerColumns));
    }
    if (data.hasMore && data.nextKeyMarker) {
      // `list-versions` paginates on a (keyMarker, versionIdMarker)
      // pair, not the single page-token the generic helper assumes.
      let hint = `\nNext page: --key-marker "${data.nextKeyMarker}"`;
      if (data.nextVersionIdMarker) {
        hint += ` --version-id-marker "${data.nextVersionIdMarker}"`;
      }
      console.error(hint);
    }
  }

  printSuccess(context, {
    versions: versionRows.length,
    deleteMarkers: deleteMarkerRows.length,
  });
}
