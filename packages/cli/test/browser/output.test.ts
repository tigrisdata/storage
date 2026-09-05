import { beforeEach, describe, expect, it } from 'vitest';

import {
  beginCapture,
  console as capturingConsole,
  endCapture,
  writeErr,
  writeOut,
  writeOutBytes,
} from '../../src/browser/output';

describe('browser output capture', () => {
  beforeEach(() => {
    // Leave no capture open between tests.
    try {
      endCapture();
    } catch {
      // not capturing
    }
  });

  it('separates stdout from stderr', () => {
    beginCapture();
    capturingConsole.log('to stdout');
    capturingConsole.error('to stderr');
    capturingConsole.warn('also stderr');

    expect(endCapture()).toEqual({
      stdout: 'to stdout\n',
      stderr: 'to stderr\nalso stderr\n',
      stdoutKind: 'text',
    });
  });

  it('joins varargs with spaces and serialises non-strings', () => {
    beginCapture();
    capturingConsole.log('count:', 3, { ok: true });

    expect(endCapture().stdout).toBe('count: 3 {"ok":true}\n');
  });

  it('renders an Error with its stack rather than [object Object]', () => {
    beginCapture();
    capturingConsole.error(new Error('boom'));

    expect(endCapture().stderr).toContain('boom');
  });

  it('writes raw text without adding newlines', () => {
    beginCapture();
    writeOut('no');
    writeOut('newline');
    writeErr('err');

    expect(endCapture()).toEqual({
      stdout: 'nonewline',
      stderr: 'err',
      stdoutKind: 'text',
    });
  });

  it('clears buffers between captures', () => {
    beginCapture();
    capturingConsole.log('first');
    endCapture();

    beginCapture();
    capturingConsole.log('second');

    expect(endCapture().stdout).toBe('second\n');
  });

  it('keeps binary bytes intact instead of decoding them as text', () => {
    // Regression: stdout was UTF-8-decoded on capture, so a streamed download
    // of a non-text object had every invalid byte replaced with U+FFFD and
    // `objects get bucket key > file` wrote a corrupted file.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00, 0xfe]);

    beginCapture();
    writeOutBytes(bytes);
    const { stdout, stdoutKind } = endCapture();

    expect(stdoutKind).toBe('bytes');
    // latin1-shaped: one char per byte, so the original bytes are recoverable.
    expect([...stdout].map((c) => c.charCodeAt(0))).toEqual([...bytes]);
  });

  it('reports text when only strings were written', () => {
    beginCapture();
    capturingConsole.log('just text');
    expect(endCapture().stdoutKind).toBe('text');
  });

  it('carries text written before a binary chunk as its UTF-8 bytes', () => {
    // A command may print a status line and then stream a download; once the
    // stream is binary the whole capture has to be byte-faithful.
    beginCapture();
    writeOut('é');
    writeOutBytes(new Uint8Array([0xff]));
    const { stdout, stdoutKind } = endCapture();

    expect(stdoutKind).toBe('bytes');
    expect([...stdout].map((c) => c.charCodeAt(0))).toEqual([0xc3, 0xa9, 0xff]);
  });

  it('refuses to nest, because a shared buffer cannot serve two runs', () => {
    beginCapture();
    expect(() => beginCapture()).toThrow(/not re-entrant/);
  });
});
