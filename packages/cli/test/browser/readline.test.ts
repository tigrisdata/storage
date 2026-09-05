import { afterEach, describe, expect, it, vi } from 'vitest';

import { type BrowserHost, setHost } from '../../src/browser/host';
import { setRunInterrupter } from '../../src/browser/interrupt';
import { beginCapture, endCapture } from '../../src/browser/output';
import { createInterface } from '../../src/browser/shims/node-readline';

function installHost(input: BrowserHost['input']) {
  setHost({
    confirm: async () => false,
    input,
    select: async (_message, choices) => choices[0].value,
  });
}

afterEach(() => {
  setHost(null);
  setRunInterrupter(null);
});

describe('readline shim', () => {
  it('answers the question with what the host returns', async () => {
    installHost(async () => 'y');

    const answer = await new Promise<string>((resolve) =>
      createInterface().question('Delete? (y/N): ', resolve)
    );

    expect(answer).toBe('y');
  });

  it('interrupts the run on Ctrl+C instead of answering no', async () => {
    // Regression: the rejection became '', which `confirm` read as a decline,
    // so `buckets delete` finished as declined rather than interrupted.
    installHost(async () => {
      throw new Error('Operation cancelled');
    });
    const interrupter = vi.fn();
    setRunInterrupter(interrupter);
    const callback = vi.fn();

    createInterface().question('Delete? (y/N): ', callback);

    await vi.waitFor(() => expect(interrupter).toHaveBeenCalledTimes(1));
    expect(interrupter.mock.calls[0]?.[0]).toMatchObject({ exitCode: 130 });
    expect(callback).not.toHaveBeenCalled();
  });

  it('reports a host failure that is not a cancellation', async () => {
    installHost(async () => {
      throw new Error('terminal detached');
    });
    const interrupter = vi.fn();
    setRunInterrupter(interrupter);
    beginCapture();

    createInterface().question('Delete? (y/N): ', () => {});
    await vi.waitFor(() => expect(interrupter).toHaveBeenCalledTimes(1));

    expect(endCapture().stderr).toContain('terminal detached');
  });

  it('falls back to an empty answer when no run is active', async () => {
    installHost(async () => {
      throw new Error('Operation cancelled');
    });

    const answer = await new Promise<string>((resolve) =>
      createInterface().question('Delete? (y/N): ', resolve)
    );

    expect(answer).toBe('');
  });
});
