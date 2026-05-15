import { describe, expect, it } from 'vitest';

import { getContentType } from '../../src/utils/mime.js';

describe('getContentType', () => {
  it('returns text/html for .html', () => {
    expect(getContentType('foo.html')).toBe('text/html');
    expect(getContentType('a/b/index.html')).toBe('text/html');
  });

  it('handles uppercase extensions (lowercases internally)', () => {
    expect(getContentType('IMAGE.PNG')).toBe('image/png');
    expect(getContentType('Foo.JPG')).toBe('image/jpeg');
  });

  it('matches the final extension only (.tar.gz → gzip)', () => {
    expect(getContentType('archive.tar.gz')).toBe('application/gzip');
  });

  it('returns text/javascript for .js / .mjs / .cjs', () => {
    expect(getContentType('app.js')).toBe('text/javascript');
    expect(getContentType('app.mjs')).toBe('text/javascript');
    expect(getContentType('app.cjs')).toBe('text/javascript');
  });

  it('returns image/svg+xml for .svg', () => {
    expect(getContentType('logo.svg')).toBe('image/svg+xml');
  });

  it('returns undefined when the extension is unknown', () => {
    // AWS-CLI behavior parity: callers omit the header and let the
    // server default apply rather than emitting application/octet-stream.
    expect(getContentType('mystery.xyz')).toBeUndefined();
  });

  it('returns undefined when there is no extension', () => {
    expect(getContentType('Makefile')).toBeUndefined();
    expect(getContentType('binary')).toBeUndefined();
  });

  it('returns undefined for dotfiles (no extension after the dot)', () => {
    // extname('.gitignore') === '' — these are treated as no-extension.
    expect(getContentType('.gitignore')).toBeUndefined();
    expect(getContentType('.env')).toBeUndefined();
  });
});
