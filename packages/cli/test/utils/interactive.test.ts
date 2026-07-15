import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireInteractive } from '../../src/utils/interactive.js';

describe('requireInteractive', () => {
  const originalIsTTY = process.stdin.isTTY;
  const exitSpy = vi
    .spyOn(process, 'exit')
    .mockImplementation(() => undefined as never);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    exitSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      writable: true,
    });
  });

  it('does nothing when stdin is a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
    });
    requireInteractive('use --yes flag');
    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('prints error and exits when stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    requireInteractive('use --yes flag');
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('includes the hint in the error message', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      writable: true,
    });
    requireInteractive('use --format json');
    const hintCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes('use --format json')
    );
    expect(hintCall).toBeTruthy();
  });
});
