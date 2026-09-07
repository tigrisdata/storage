/** `node:url` — `fileURLToPath` is the only export the CLI reaches. */

export function fileURLToPath(url: string | URL): string {
  const href = typeof url === 'string' ? url : url.href;
  return href.startsWith('file://') ? href.slice('file://'.length) : href;
}

export default { fileURLToPath };
