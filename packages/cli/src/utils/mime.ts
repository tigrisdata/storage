import { extname } from 'path';

/**
 * Inline MIME table covering the file types commonly served from
 * Tigris buckets. Mirrors the AWS CLI behaviour of `mimetypes.guess_type`
 * by extension — extension-only, no content sniffing. Returns
 * `undefined` for unknown extensions so callers omit the
 * `Content-Type` header and let the server default apply (matches
 * `aws s3 cp`'s behaviour, which never emits a fallback
 * `application/octet-stream`).
 */
const MIME_TABLE: Record<string, string> = {
  // Markup / scripts
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  json: 'application/json',
  map: 'application/json',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',

  // Plain text
  txt: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  yaml: 'application/yaml',
  yml: 'application/yaml',

  // Documents
  pdf: 'application/pdf',
  rtf: 'application/rtf',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',

  // Fonts
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',

  // Video
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',

  // Audio
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  opus: 'audio/opus',

  // Archives
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
};

/**
 * Look up a Content-Type from a file path's extension. Returns
 * `undefined` when the extension is unknown — callers should omit the
 * Content-Type rather than fall back to `application/octet-stream`.
 */
export function getContentType(filePath: string): string | undefined {
  const ext = extname(filePath).slice(1).toLowerCase();
  if (!ext) return undefined;
  return MIME_TABLE[ext];
}
