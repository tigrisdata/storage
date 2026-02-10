import {
  createReadStream,
  createWriteStream,
  statSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from 'fs';
import { resolve, dirname, basename, join, relative } from 'path';
import { homedir } from 'os';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import {
  isRemotePath,
  parseRemotePath,
  isPathFolder,
  listAllItems,
  globToRegex,
  wildcardPrefix,
} from '../utils/path.js';
import { getOption } from '../utils/options.js';
import { getStorageConfig } from '../auth/s3-client.js';
import { formatSize } from '../utils/format.js';
import { get, put, list, head } from '@tigrisdata/storage';
import type { ParsedPath } from '../types.js';

type CopyDirection = 'local-to-remote' | 'remote-to-local' | 'remote-to-remote';

function detectDirection(src: string, dest: string): CopyDirection {
  const srcRemote = isRemotePath(src);
  const destRemote = isRemotePath(dest);

  if (!srcRemote && !destRemote) {
    console.error(
      'At least one path must be a remote Tigris path (t3:// or tigris://)'
    );
    process.exit(1);
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

async function uploadFile(
  localPath: string,
  bucket: string,
  key: string,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  showProgress = false
): Promise<{ error?: string }> {
  let fileSize: number | undefined;
  try {
    const stats = statSync(localPath);
    fileSize = stats.size;
  } catch {
    return { error: `File not found: ${localPath}` };
  }

  const fileStream = createReadStream(localPath);
  const body = Readable.toWeb(fileStream) as ReadableStream;

  const useMultipart = fileSize !== undefined && fileSize > 100 * 1024 * 1024;

  const { error: putError } = await put(key, body, {
    multipart: useMultipart,
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
  });

  if (showProgress) {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  if (putError) {
    return { error: putError.message };
  }

  return {};
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
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  return {};
}

async function copyObject(
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  srcBucket: string,
  srcKey: string,
  destBucket: string,
  destKey: string,
  showProgress = false
): Promise<{ error?: string }> {
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

  let fileSize: number | undefined;
  if (showProgress) {
    const { data: headData } = await head(srcKey, {
      config: {
        ...config,
        bucket: srcBucket,
      },
    });
    fileSize = headData?.size;
  }

  const { data, error: getError } = await get(srcKey, 'stream', {
    config: {
      ...config,
      bucket: srcBucket,
    },
  });

  if (getError) {
    return { error: getError.message };
  }

  const useMultipart = fileSize !== undefined && fileSize > 100 * 1024 * 1024;

  const { error: putError } = await put(destKey, data, {
    multipart: useMultipart,
    onUploadProgress: showProgress
      ? ({ loaded }) => {
          if (fileSize !== undefined && fileSize > 0) {
            const pct = Math.round((loaded / fileSize) * 100);
            process.stdout.write(
              `\rCopying: ${formatSize(loaded)} / ${formatSize(fileSize)} (${pct}%)`
            );
          } else {
            process.stdout.write(`\rCopying: ${formatSize(loaded)}`);
          }
        }
      : undefined,
    config: {
      ...config,
      bucket: destBucket,
    },
  });

  if (showProgress) {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
  }

  if (putError) {
    return { error: putError.message };
  }

  return {};
}

// --- Local to Remote ---
async function copyLocalToRemote(
  src: string,
  destParsed: ParsedPath,
  config: Awaited<ReturnType<typeof getStorageConfig>>,
  recursive: boolean
) {
  const localPath = resolveLocalPath(src);
  const isWildcard = src.includes('*');

  if (isWildcard) {
    const files = listLocalFilesWithWildcard(localPath, recursive);
    if (files.length === 0) {
      console.log('No files matching pattern');
      return;
    }

    const wildcardDir = dirname(localPath);
    let copied = 0;
    for (const file of files) {
      // Use relative path to preserve directory structure when recursive
      const relPath = relative(wildcardDir, file);
      const destKey = destParsed.path
        ? `${destParsed.path.replace(/\/$/, '')}/${relPath}`
        : relPath;

      const result = await uploadFile(file, destParsed.bucket, destKey, config);
      if (result.error) {
        console.error(`Failed to upload ${file}: ${result.error}`);
      } else {
        console.log(`Uploaded ${file} -> t3://${destParsed.bucket}/${destKey}`);
        copied++;
      }
    }
    console.log(`Uploaded ${copied} file(s)`);
    return;
  }

  let stats;
  try {
    stats = statSync(localPath);
  } catch {
    console.error(`Source not found: ${src}`);
    process.exit(1);
  }

  if (stats.isDirectory()) {
    if (!recursive) {
      console.error(
        `${src} is a directory (not copied). Use -r to copy recursively.`
      );
      process.exit(1);
    }

    const files = listLocalFiles(localPath);
    if (files.length === 0) {
      console.log('No files to upload');
      return;
    }

    // Linux cp convention: trailing slash = contents only, no slash = include dir name
    const dirName = src.endsWith('/') ? '' : basename(localPath);

    let copied = 0;
    for (const file of files) {
      const relativePath = relative(localPath, file);
      const parts = [
        destParsed.path?.replace(/\/$/, ''),
        dirName,
        relativePath,
      ].filter(Boolean);
      const destKey = parts.join('/');

      const result = await uploadFile(file, destParsed.bucket, destKey, config);
      if (result.error) {
        console.error(`Failed to upload ${file}: ${result.error}`);
      } else {
        console.log(`Uploaded ${file} -> t3://${destParsed.bucket}/${destKey}`);
        copied++;
      }
    }
    console.log(`Uploaded ${copied} file(s)`);
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
      true
    );
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    console.log(`Uploaded ${src} -> t3://${destParsed.bucket}/${destKey}`);
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
    console.error('Cannot copy a bucket. Provide a path within the bucket.');
    process.exit(1);
  }

  const localDest = resolveLocalPath(dest);
  const isWildcard = srcParsed.path.includes('*');
  let isFolder =
    srcParsed.path.endsWith('/') || (!srcParsed.path && rawEndsWithSlash);

  if (!isWildcard && !isFolder) {
    isFolder = await isPathFolder(srcParsed.bucket, srcParsed.path, config);
  }

  if (isFolder && !isWildcard && !recursive) {
    console.error(
      `Source is a remote folder (not copied). Use -r to copy recursively.`
    );
    process.exit(1);
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
      console.error(error.message);
      process.exit(1);
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
      console.log('No objects to download');
      return;
    }

    let downloaded = 0;
    for (const item of filesToDownload) {
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
      } else {
        console.log(
          `Downloaded t3://${srcParsed.bucket}/${item.name} -> ${localFilePath}`
        );
        downloaded++;
      }
    }
    console.log(`Downloaded ${downloaded} file(s)`);
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
      true
    );
    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }
    console.log(
      `Downloaded t3://${srcParsed.bucket}/${srcParsed.path} -> ${localFilePath}`
    );
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
    console.error('Cannot copy a bucket. Provide a path within the bucket.');
    process.exit(1);
  }

  const isWildcard = src.includes('*');
  let isFolder =
    srcParsed.path.endsWith('/') || (!srcParsed.path && rawEndsWithSlash);

  if (!isWildcard && !isFolder && srcParsed.path) {
    isFolder = await isPathFolder(srcParsed.bucket, srcParsed.path, config);
  }

  if (isFolder && !isWildcard && !recursive) {
    console.error(
      `Source is a remote folder (not copied). Use -r to copy recursively.`
    );
    process.exit(1);
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
      console.error('Source and destination are the same');
      process.exit(1);
    }

    const { items, error } = await listAllItems(
      srcParsed.bucket,
      prefix || undefined,
      config
    );

    if (error) {
      console.error(error.message);
      process.exit(1);
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

    let copied = 0;
    for (const item of itemsToCopy) {
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
      } else {
        console.log(
          `Copied t3://${srcParsed.bucket}/${item.name} -> t3://${destParsed.bucket}/${destKey}`
        );
        copied++;
      }
    }

    // Copy folder marker if exists
    let copiedMarker = false;
    if (effectiveDestPrefix && prefix) {
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
          copiedMarker = true;
        }
      }
    }

    if (copied === 0 && copiedMarker) {
      copied = 1;
    }

    if (copied === 0) {
      console.log('No objects to copy');
      return;
    }

    console.log(`Copied ${copied} object(s)`);
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
      console.error('Source and destination are the same');
      process.exit(1);
    }

    const result = await copyObject(
      config,
      srcParsed.bucket,
      srcParsed.path,
      destParsed.bucket,
      destKey,
      true
    );

    if (result.error) {
      console.error(result.error);
      process.exit(1);
    }

    console.log(
      `Copied t3://${srcParsed.bucket}/${srcParsed.path} -> t3://${destParsed.bucket}/${destKey}`
    );
  }
}

export default async function cp(options: Record<string, unknown>) {
  const src = getOption<string>(options, ['src']);
  const dest = getOption<string>(options, ['dest']);

  if (!src || !dest) {
    console.error('Both src and dest arguments are required');
    process.exit(1);
  }

  const recursive = !!getOption<boolean>(options, ['recursive', 'r']);
  const direction = detectDirection(src, dest);
  const config = await getStorageConfig();

  switch (direction) {
    case 'local-to-remote': {
      const destParsed = parseRemotePath(dest);
      if (!destParsed.bucket) {
        console.error('Invalid destination path');
        process.exit(1);
      }
      await copyLocalToRemote(src, destParsed, config, recursive);
      break;
    }
    case 'remote-to-local': {
      const srcParsed = parseRemotePath(src);
      if (!srcParsed.bucket) {
        console.error('Invalid source path');
        process.exit(1);
      }
      await copyRemoteToLocal(src, srcParsed, dest, config, recursive);
      break;
    }
    case 'remote-to-remote': {
      const srcParsed = parseRemotePath(src);
      const destParsed = parseRemotePath(dest);
      if (!srcParsed.bucket) {
        console.error('Invalid source path');
        process.exit(1);
      }
      if (!destParsed.bucket) {
        console.error('Invalid destination path');
        process.exit(1);
      }
      await copyRemoteToRemote(src, srcParsed, destParsed, config, recursive);
      break;
    }
  }

  process.exit(0);
}
