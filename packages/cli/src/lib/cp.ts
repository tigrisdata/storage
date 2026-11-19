import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { getStorageConfig } from '@auth/provider.js';
import { copy, get, head, list, put } from '@tigrisdata/storage';
import { executeWithConcurrency } from '@utils/concurrency.js';
import { exitWithError } from '@utils/exit.js';
import { formatSize } from '@utils/format.js';
import { getContentType } from '@utils/mime.js';
import { getFormat, getOption } from '@utils/options.js';
import {
  countObjects,
  globToRegex,
  isFolderMarker,
  isPathFolder,
  isRemotePath,
  listAllItems,
  parseRemotePath,
  wildcardPrefix,
} from '@utils/path.js';
import { calculateUploadParams } from '@utils/upload.js';

import type { ParsedPath } from '../types.js';

let _jsonMode = false;

type CopyDirection = 'local-to-remote' | 'remote-to-local' | 'remote-to-remote';

function detectDirection(src: string, dest: string): CopyDirection {
  const srcRemote = isRemotePath(src);
  const destRemote = isRemotePath(dest);

  if (!srcRemote && !destRemote) {
    exitWithError(
      'At least one path must be a remote Tigris path (t3:// or tigris://)'
    );
  }

  if (srcRemote && destRemote) return 'remote-to-remote';
  if (srcRemote) return 'remote-to-local';
  return 'local-to-remote';
}

function resolveLocalPath(pathString: string): string {
  if (pathString === '~' || pathString.startsWith('~/')) {
    return resolve(homedir(), pathString.slice(2));
  }
  return resolve(pathString);
}

function listLocalFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const parent = e.parentPath ?? (e as unknown as { path: string }).path;
      return join(parent, e.name);
    });
}

function listLocalFilesWithWildcard(
  pattern: string,
  recursive: boolean
): string[] {
  const dir = dirname(pattern);
  const fileGlob = basename(pattern);
  const regex = globToRegex(fileGlob);

  if (!existsSync(dir)) return [];

  if (!recursive) {
    // Like shell glob: only match immediate children
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && regex.test(e.name))
      .map((e) => join(dir, e.name));
  }

  // Recursive: match the glob pattern against the basename at any depth
  const entries = readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && regex.test(e.name))
    .map((e) => {
      const parent = e.parentPath ?? (e as unknown as { path: string }).path;
      return join(parent, e.name);
    });
}

type UploadFileOptions = {
  showProgress?: boolean;
  access?: 'public' | 'private';
  cacheControl?: string;
  noOverwrite?: boolean;
};

async function uploadFile(
  localPath: string,
  bucket: string,
  key: string,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  { showProgress = false, access, cacheControl, noOverwrite }: UploadFileOptions
): Promise<{ error?: string; exists?: boolean }> {
  let fileSize: number | undefined;
  try {
    const stats = statSync(localPath);
    fileSize = stats.size;
  } catch {
    return { error: `File not found: ${localPath}` };
  }

  const fileStream = createReadStream(localPath);
  const body = Readable.toWeb(fileStream) as ReadableStream;

  const contentType = getContentType(localPath);

  // put() returns without reading the body when its HEAD check finds the key,
  // so close the file afterwards or each skipped file stays open.
  const { error: putError } = await put(key, body, {
    ...calculateUploadParams(fileSize),
    ...(contentType ? { contentType } : {}),
    ...(access ? { access } : {}),
    ...(cacheControl ? { cacheControl } : {}),
    ...(noOverwrite ? { allowOverwrite: false } : {}),
    onUploadProgress: showProgress
      ? ({ loaded }) => {
          if (fileSize !== undefined && fileSize > 0) {
            const pct = Math.round((loaded / fileSize) * 100);
            process.stdout.write(
              `\rUploading: ${formatSize(loaded)} / ${formatSize(fileSize)} (${pct}%)`
            );
          } else {
            process.stdout.write(`\rUploading: ${formatSize(loaded)}`);
          }
        }
      : undefined,
    config: {
      ...config,
      bucket,
    },
  }).finally(() => fileStream.destroy());

  if (showProgress) {
    process.stdout.write(`\r${' '.repeat(60)}\r`);
  }

  if (putError) {
    return {
      error: putError.message,
      // The SDK reports a create-only conflict with this message, from either
      // its HEAD pre-check or a 412 on the upload itself.
      exists: noOverwrite && putError.message === 'File already exists',
    };
  }

  return {};
}

/**
 * Upload many files with bounded concurrency and print one summary. With
 * --no-overwrite, files whose key already exists are skipped, not failed, so
 * re-running the same copy only uploads what is new.
 */
async function uploadBatch(
  entries: { file: string; destKey: string }[],
  bucket: string,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  options: Omit<UploadFileOptions, 'showProgress'>
) {
  const tasks = entries.map(({ file, destKey }) => async () => {
    const result = await uploadFile(file, bucket, destKey, config, options);
    if (result.exists) {
      if (!_jsonMode)
        console.log(`Skipped ${file} (t3://${bucket}/${destKey} exists)`);
      return 'skipped' as const;
    }
    if (result.error) {
      console.error(`Failed to upload ${file}: ${result.error}`);
      return 'failed' as const;
    }
    if (!_jsonMode)
      console.log(`Uploaded ${file} -> t3://${bucket}/${destKey}`);
    return 'uploaded' as const;
  });
  const results = await executeWithConcurrency(tasks, 8);
  const copied = results.filter((r) => r === 'uploaded').length;
  const skipped = results.filter((r) => r === 'skipped').length;

  if (_jsonMode) {
    console.log(
      JSON.stringify({
        action: 'copied',
        direction: 'local-to-remote',
        count: copied,
        ...(options.noOverwrite ? { skipped } : {}),
      })
    );
  } else if (skipped > 0) {
    console.log(`Uploaded ${copied} file(s), skipped ${skipped} existing`);
  } else {
    console.log(`Uploaded ${copied} file(s)`);
  }
}

async function downloadFile(
  bucket: string,
  key: string,
  localPath: string,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  showProgress = false
): Promise<{ error?: string }> {
  let fileSize: number | undefined;
  if (showProgress) {
    const { data: headData } = await head(key, {
      config: {
        ...config,
        bucket,
      },
    });
    fileSize = headData?.size;
  }

  const { data, error: getError } = await get(key, 'stream', {
    config: {
      ...config,
      bucket,
    },
  });

  if (getError) {
    return { error: getError.message };
  }

  const dir = dirname(localPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const writeStream = createWriteStream(localPath);
  const nodeStream = Readable.fromWeb(data as ReadableStream);

  if (showProgress && fileSize !== undefined && fileSize > 0) {
    let loaded = 0;
    nodeStream.on('data', (chunk: Buffer) => {
      loaded += chunk.length;
      const pct = Math.round((loaded / fileSize!) * 100);
      process.stdout.write(
        `\rDownloading: ${formatSize(loaded)} / ${formatSize(fileSize!)} (${pct}%)`
      );
    });
  }

  await pipeline(nodeStream, writeStream);

  if (showProgress) {
    process.stdout.write(`\r${' '.repeat(60)}\r`);
  }

  return {};
}

async function copyObject(
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  srcBucket: string,
  srcKey: string,
  destBucket: string,
  destKey: string
): Promise<{ error?: string }> {
  // Folder markers (zero-byte objects ending in `/`) are still
  // created via put('') — CopyObject on a literal folder marker is
  // ambiguous, and the marker has no payload to preserve.
  if (srcKey.endsWith('/')) {
    const { error: putError } = await put(destKey, '', {
      config: {
        ...config,
        bucket: destBucket,
      },
    });

    if (putError) {
      return { error: putError.message };
    }

    return {};
  }

  // Server-side CopyObject. No bytes flow through the client and the
  // source's Content-Type / metadata are preserved automatically.
  const { error: copyError } = await copy(srcKey, destKey, {
    srcBucket,
    destBucket,
    config: {
      ...config,
      bucket: destBucket,
    },
  });

  if (copyError) {
    return { error: copyError.message };
  }

  return {};
}

// --- Local to Remote ---
async function copyLocalToRemote(
  src: string,
  destParsed: ParsedPath,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  recursive: boolean,
  uploadOptions: Omit<UploadFileOptions, 'showProgress'>
) {
  const localPath = resolveLocalPath(src);
  const isWildcard = src.includes('*');

  if (isWildcard) {
    const files = listLocalFilesWithWildcard(localPath, recursive);
    if (files.length === 0) {
      if (_jsonMode) {
        console.log(
          JSON.stringify({
            action: 'copied',
            direction: 'local-to-remote',
            count: 0,
            ...(uploadOptions.noOverwrite ? { skipped: 0 } : {}),
          })
        );
      } else {
        console.log('No files matching pattern');
      }
      return;
    }

    const wildcardDir = dirname(localPath);
    const entries = files.map((file) => {
      const relPath = relative(wildcardDir, file);
      const destKey = destParsed.path
        ? `${destParsed.path.replace(/\/$/, '')}/${relPath}`
        : relPath;
      return { file, destKey };
    });
    await uploadBatch(entries, destParsed.bucket, config, uploadOptions);
    return;
  }

  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(localPath);
  } catch {
    exitWithError(`Source not found: ${src}`);
  }

  if (stats.isDirectory()) {
    if (!recursive) {
      exitWithError(
        `${src} is a directory (not copied). Use -r to copy recursively.`
      );
    }

    const files = listLocalFiles(localPath);
    if (files.length === 0) {
      if (_jsonMode) {
        console.log(
          JSON.stringify({
            action: 'copied',
            direction: 'local-to-remote',
            count: 0,
            ...(uploadOptions.noOverwrite ? { skipped: 0 } : {}),
          })
        );
      } else {
        console.log('No files to upload');
      }
      return;
    }

    // Linux cp convention: trailing slash = contents only, no slash = include dir name
    const dirName = src.endsWith('/') ? '' : basename(localPath);

    const entries = files.map((file) => {
      const relativePath = relative(localPath, file);
      const parts = [
        destParsed.path?.replace(/\/$/, ''),
        dirName,
        relativePath,
      ].filter(Boolean);
      return { file, destKey: parts.join('/') };
    });
    await uploadBatch(entries, destParsed.bucket, config, uploadOptions);
  } else {
    // Single file
    const fileName = basename(localPath);
    let destKey: string;

    if (!destParsed.path) {
      destKey = fileName;
    } else if (src.endsWith('/') || destParsed.path.endsWith('/')) {
      destKey = `${destParsed.path.replace(/\/$/, '')}/${fileName}`;
    } else {
      // Check if dest is an existing folder on remote
      const destIsFolder = await isPathFolder(
        destParsed.bucket,
        destParsed.path,
        config
      );
      if (destIsFolder) {
        destKey = `${destParsed.path}/${fileName}`;
      } else {
        destKey = destParsed.path;
      }
    }

    const result = await uploadFile(
      localPath,
      destParsed.bucket,
      destKey,
      config,
      { ...uploadOptions, showProgress: !_jsonMode }
    );
    if (result.exists) {
      exitWithError(
        `t3://${destParsed.bucket}/${destKey} already exists (--no-overwrite)`
      );
    }
    if (result.error) {
      exitWithError(result.error);
    }
    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'copied',
          direction: 'local-to-remote',
          count: 1,
          src,
          dest: `t3://${destParsed.bucket}/${destKey}`,
        })
      );
    } else {
      console.log(`Uploaded ${src} -> t3://${destParsed.bucket}/${destKey}`);
    }
  }
}

// --- Remote to Local ---
async function copyRemoteToLocal(
  src: string,
  srcParsed: ParsedPath,
  dest: string,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  recursive: boolean
) {
  // t3://bucket (no path, no trailing slash) = error
  // t3://bucket/ (no path, trailing slash) = copy all contents from bucket root
  const rawEndsWithSlash = src.endsWith('/');
  if (!srcParsed.path && !rawEndsWithSlash) {
    exitWithError('Cannot copy a bucket. Provide a path within the bucket.');
  }

  const localDest = resolveLocalPath(dest);
  const isWildcard = srcParsed.path.includes('*');
  let isFolder =
    srcParsed.path.endsWith('/') || (!srcParsed.path && rawEndsWithSlash);

  if (!isWildcard && !isFolder) {
    isFolder = await isPathFolder(srcParsed.bucket, srcParsed.path, config);
  }

  if (isFolder && !isWildcard && !recursive) {
    exitWithError(
      'Source is a remote folder (not copied). Use -r to copy recursively.'
    );
  }

  if (isWildcard || isFolder) {
    const prefix = isWildcard
      ? wildcardPrefix(srcParsed.path)
      : srcParsed.path
        ? srcParsed.path.endsWith('/')
          ? srcParsed.path
          : `${srcParsed.path}/`
        : '';

    // Linux cp convention: trailing slash = contents only, no slash = include folder name
    const folderName =
      !isWildcard && srcParsed.path && !srcParsed.path.endsWith('/')
        ? (srcParsed.path.split('/').filter(Boolean).pop() ?? '')
        : '';

    const { items, error } = await listAllItems(
      srcParsed.bucket,
      prefix || undefined,
      config
    );

    if (error) {
      exitWithError(error);
    }

    let filesToDownload = items.filter((item) => !item.name.endsWith('/'));

    if (isWildcard) {
      const filePattern = srcParsed.path.split('/').pop()!;
      const regex = globToRegex(filePattern);
      filesToDownload = filesToDownload.filter((item) => {
        const rel = prefix ? item.name.slice(prefix.length) : item.name;
        if (!recursive && rel.includes('/')) return false;
        return regex.test(rel.split('/').pop()!);
      });
    }

    if (filesToDownload.length === 0) {
      if (_jsonMode) {
        console.log(
          JSON.stringify({
            action: 'copied',
            direction: 'remote-to-local',
            count: 0,
          })
        );
      } else {
        console.log('No objects to download');
      }
      return;
    }

    const downloadTasks = filesToDownload.map((item) => async () => {
      const relativePath = prefix ? item.name.slice(prefix.length) : item.name;
      const localFilePath = folderName
        ? join(localDest, folderName, relativePath)
        : join(localDest, relativePath);

      const result = await downloadFile(
        srcParsed.bucket,
        item.name,
        localFilePath,
        config
      );
      if (result.error) {
        console.error(`Failed to download ${item.name}: ${result.error}`);
        return false;
      } else {
        if (!_jsonMode)
          console.log(
            `Downloaded t3://${srcParsed.bucket}/${item.name} -> ${localFilePath}`
          );
        return true;
      }
    });
    const downloadResults = await executeWithConcurrency(downloadTasks, 8);
    const downloaded = downloadResults.filter(Boolean).length;
    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'copied',
          direction: 'remote-to-local',
          count: downloaded,
        })
      );
    } else {
      console.log(`Downloaded ${downloaded} file(s)`);
    }
  } else {
    // Single object
    const srcFileName = srcParsed.path.split('/').pop()!;
    let localFilePath: string;

    // If dest is an existing directory or ends with /, put file inside it
    let destIsDir = false;
    try {
      destIsDir = statSync(localDest).isDirectory();
    } catch {
      // doesn't exist yet
    }

    if (destIsDir || dest.endsWith('/')) {
      localFilePath = join(localDest, srcFileName);
    } else {
      localFilePath = localDest;
    }

    const result = await downloadFile(
      srcParsed.bucket,
      srcParsed.path,
      localFilePath,
      config,
      !_jsonMode
    );
    if (result.error) {
      exitWithError(result.error);
    }
    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'copied',
          direction: 'remote-to-local',
          count: 1,
          src: `t3://${srcParsed.bucket}/${srcParsed.path}`,
          dest: localFilePath,
        })
      );
    } else {
      console.log(
        `Downloaded t3://${srcParsed.bucket}/${srcParsed.path} -> ${localFilePath}`
      );
    }
  }
}

// --- Remote to Remote ---
async function copyRemoteToRemote(
  src: string,
  srcParsed: ParsedPath,
  destParsed: ParsedPath,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  recursive: boolean
) {
  // t3://bucket (no path, no trailing slash) = error
  // t3://bucket/ (no path, trailing slash) = copy all contents from bucket root
  const rawEndsWithSlash = src.endsWith('/');
  if (!srcParsed.path && !rawEndsWithSlash) {
    exitWithError('Cannot copy a bucket. Provide a path within the bucket.');
  }

  const isWildcard = src.includes('*');
  let isFolder =
    srcParsed.path.endsWith('/') || (!srcParsed.path && rawEndsWithSlash);

  if (!isWildcard && !isFolder && srcParsed.path) {
    isFolder = await isPathFolder(srcParsed.bucket, srcParsed.path, config);
  }

  if (isFolder && !isWildcard && !recursive) {
    exitWithError(
      'Source is a remote folder (not copied). Use -r to copy recursively.'
    );
  }

  if (isWildcard || isFolder) {
    const prefix = isWildcard
      ? wildcardPrefix(srcParsed.path)
      : srcParsed.path
        ? srcParsed.path.endsWith('/')
          ? srcParsed.path
          : `${srcParsed.path}/`
        : '';

    // Linux cp convention: trailing slash = contents only, no slash = include folder name
    const folderName =
      !isWildcard && srcParsed.path && !srcParsed.path.endsWith('/')
        ? (srcParsed.path.split('/').filter(Boolean).pop() ?? '')
        : '';

    const destBase = destParsed.path?.replace(/\/$/, '') || '';
    const effectiveDestPrefix = [destBase, folderName]
      .filter(Boolean)
      .join('/');
    const effectiveDestPrefixWithSlash = effectiveDestPrefix
      ? `${effectiveDestPrefix}/`
      : '';

    if (
      srcParsed.bucket === destParsed.bucket &&
      prefix === effectiveDestPrefixWithSlash
    ) {
      exitWithError('Source and destination are the same');
    }

    const { items, error } = await listAllItems(
      srcParsed.bucket,
      prefix || undefined,
      config
    );

    if (error) {
      exitWithError(error);
    }

    let itemsToCopy = items.filter((item) => item.name !== prefix);

    if (isWildcard) {
      const filePattern = srcParsed.path.split('/').pop()!;
      const regex = globToRegex(filePattern);
      itemsToCopy = itemsToCopy.filter((item) => {
        const rel = prefix ? item.name.slice(prefix.length) : item.name;
        if (!recursive && rel.includes('/')) return false;
        return regex.test(rel.split('/').pop()!);
      });
    }

    const copyTasks = itemsToCopy.map((item) => async () => {
      const relativePath = prefix ? item.name.slice(prefix.length) : item.name;
      const destKey = effectiveDestPrefix
        ? `${effectiveDestPrefix}/${relativePath}`
        : relativePath;

      const copyResult = await copyObject(
        config,
        srcParsed.bucket,
        item.name,
        destParsed.bucket,
        destKey
      );

      if (copyResult.error) {
        console.error(`Failed to copy ${item.name}: ${copyResult.error}`);
        return null;
      } else {
        // Nested folder markers copy with the data but aren't listed.
        if (!_jsonMode && !isFolderMarker(item.name))
          console.log(
            `Copied t3://${srcParsed.bucket}/${item.name} -> t3://${destParsed.bucket}/${destKey}`
          );
        return item.name;
      }
    });
    const copyResults = await executeWithConcurrency(copyTasks, 8);
    const copiedKeys = copyResults.filter((key) => key !== null);

    // Copy folder marker if exists. Skipped for wildcards, which name files
    // inside the folder rather than the folder itself.
    if (effectiveDestPrefix && prefix && !isWildcard) {
      const { data: markerData } = await list({
        prefix,
        limit: 1,
        config: {
          ...config,
          bucket: srcParsed.bucket,
        },
      });

      if (markerData?.items?.some((item) => item.name === prefix)) {
        const destFolderMarker = `${effectiveDestPrefix}/`;
        const markerResult = await copyObject(
          config,
          srcParsed.bucket,
          prefix,
          destParsed.bucket,
          destFolderMarker
        );
        if (markerResult.error) {
          console.error(`Failed to copy folder marker: ${markerResult.error}`);
        } else {
          copiedKeys.push(prefix);
        }
      }
    }

    const copied = countObjects(
      itemsToCopy.map((item) => item.name),
      copiedKeys
    );

    // Nothing matched at all. When items matched but every copy failed, fall
    // through and report `0` — the per-object errors are already on stderr.
    if (itemsToCopy.length === 0 && copiedKeys.length === 0) {
      if (_jsonMode) {
        console.log(
          JSON.stringify({
            action: 'copied',
            direction: 'remote-to-remote',
            count: 0,
          })
        );
      } else {
        console.log('No objects to copy');
      }
      return;
    }

    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'copied',
          direction: 'remote-to-remote',
          count: copied,
        })
      );
    } else {
      console.log(`Copied ${copied} object(s)`);
    }
  } else {
    // Single object
    const srcFileName = srcParsed.path.split('/').pop()!;
    let destKey: string;

    if (!destParsed.path) {
      destKey = srcFileName;
    } else if (destParsed.path.endsWith('/')) {
      destKey = `${destParsed.path}${srcFileName}`;
    } else {
      const destIsFolder = await isPathFolder(
        destParsed.bucket,
        destParsed.path,
        config
      );
      if (destIsFolder) {
        destKey = `${destParsed.path}/${srcFileName}`;
      } else {
        destKey = destParsed.path;
      }
    }

    if (srcParsed.bucket === destParsed.bucket && srcParsed.path === destKey) {
      exitWithError('Source and destination are the same');
    }

    const result = await copyObject(
      config,
      srcParsed.bucket,
      srcParsed.path,
      destParsed.bucket,
      destKey
    );

    if (result.error) {
      exitWithError(result.error);
    }

    if (_jsonMode) {
      console.log(
        JSON.stringify({
          action: 'copied',
          direction: 'remote-to-remote',
          count: 1,
          src: `t3://${srcParsed.bucket}/${srcParsed.path}`,
          dest: `t3://${destParsed.bucket}/${destKey}`,
        })
      );
    } else {
      console.log(
        `Copied t3://${srcParsed.bucket}/${srcParsed.path} -> t3://${destParsed.bucket}/${destKey}`
      );
    }
  }
}

export default async function cp(options: Record<string, unknown>) {
  const src = getOption<string>(options, ['src']);
  const dest = getOption<string>(options, ['dest']);

  if (!src || !dest) {
    exitWithError('Both src and dest arguments are required');
  }

  const recursive = !!getOption<boolean>(options, ['recursive', 'r']);
  const accessArg = getOption<string>(options, ['access', 'a', 'A']);
  const cacheControl = getOption<string>(options, [
    'cache-control',
    'cacheControl',
  ]);
  // Commander parses `--no-overwrite` as `overwrite: false`.
  const noOverwrite =
    getOption<boolean>(options, ['overwrite']) === false ||
    !!getOption<boolean>(options, ['no-overwrite', 'noOverwrite']);
  const format = getFormat(options);
  _jsonMode = format === 'json';

  let access: 'public' | 'private' | undefined;
  if (accessArg === undefined) {
    access = undefined;
  } else if (accessArg === 'public' || accessArg === 'private') {
    access = accessArg;
  } else {
    exitWithError('Access level must be either "public" or "private"');
  }

  const direction = detectDirection(src, dest);

  // --access only affects the object being written, which only happens on
  // upload. copy() can't carry access and a downloaded file has none.
  if (access !== undefined && direction !== 'local-to-remote') {
    exitWithError(
      '--access only applies to local-to-remote uploads. Use "tigris objects set-access" to change access on existing objects.'
    );
  }

  // Same reasoning as --access: Cache-Control is stored on the object at write
  // time, and the only write a cp performs is an upload. copy() can't carry it
  // and a downloaded file has nowhere to put it.
  if (cacheControl !== undefined && direction !== 'local-to-remote') {
    exitWithError('--cache-control only applies to local-to-remote uploads.');
  }

  if (noOverwrite && direction !== 'local-to-remote') {
    exitWithError('--no-overwrite only applies to local-to-remote uploads.');
  }

  const config = await getStorageConfig({ withCredentialProvider: true });

  switch (direction) {
    case 'local-to-remote': {
      const destParsed = parseRemotePath(dest);
      if (!destParsed.bucket) {
        exitWithError('Invalid destination path');
      }
      await copyLocalToRemote(src, destParsed, config, recursive, {
        access,
        cacheControl,
        noOverwrite,
      });
      break;
    }
    case 'remote-to-local': {
      const srcParsed = parseRemotePath(src);
      if (!srcParsed.bucket) {
        exitWithError('Invalid source path');
      }
      await copyRemoteToLocal(src, srcParsed, dest, config, recursive);
      break;
    }
    case 'remote-to-remote': {
      const srcParsed = parseRemotePath(src);
      const destParsed = parseRemotePath(dest);
      if (!srcParsed.bucket) {
        exitWithError('Invalid source path');
      }
      if (!destParsed.bucket) {
        exitWithError('Invalid destination path');
      }
      await copyRemoteToRemote(src, srcParsed, destParsed, config, recursive);
      break;
    }
  }

  process.exit(0);
}
