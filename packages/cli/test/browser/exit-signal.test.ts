import { describe, expect, it } from 'vitest';

import { ExitSignal, isExitSignal } from '../../src/browser/exit-signal';

describe('ExitSignal', () => {
  it('carries the exit code the CLI asked for', () => {
    expect(new ExitSignal(2).exitCode).toBe(2);
    expect(new ExitSignal(0).exitCode).toBe(0);
  });

  it('is an Error, so it unwinds through the CLI unchanged', () => {
    const signal = new ExitSignal(1);
    expect(signal).toBeInstanceOf(Error);
    expect(signal.name).toBe('ExitSignal');
  });

  it('is distinguishable from ordinary failures', () => {
    expect(isExitSignal(new ExitSignal(3))).toBe(true);
    expect(isExitSignal(new Error('network unreachable'))).toBe(false);
    expect(isExitSignal('exit')).toBe(false);
  });
});
