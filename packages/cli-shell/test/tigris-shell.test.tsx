import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { restoreAuth0Session } from '../src/auth/oauth';
import { TigrisShell } from '../src/components/TigrisShell';

// xterm needs a real DOM with layout; a recording stand-in is enough here.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    dispose = vi.fn();
    clear = vi.fn();
    cols = 80;
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

// Keep Auth0 out of it: no session to restore, and login never runs.
vi.mock('../src/auth/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/auth/oauth')>()),
  restoreAuth0Session: vi.fn(async () => false),
  createAuth0Login: vi.fn(() => async () => {}),
}));

const setAccessKeySession = vi.fn(async () => {});
vi.mock('@tigrisdata/cli/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tigrisdata/cli/browser')>()),
  setAccessKeySession: (...args: unknown[]) =>
    (setAccessKeySession as (...a: unknown[]) => Promise<void>)(...args),
}));

const KEY = { accessKeyId: 'tid_a', secretAccessKey: 'tsec_a' };

afterEach(() => setAccessKeySession.mockClear());

describe('TigrisShell access key', () => {
  it('installs a key that arrives after mount', async () => {
    // Regression: only the boot path installed the key, so credentials
    // fetched asynchronously left the shell signed out.
    const view = render(<TigrisShell welcome={false} />);
    await vi.waitFor(() => expect(setAccessKeySession).not.toHaveBeenCalled());

    view.rerender(<TigrisShell welcome={false} accessKey={KEY} />);

    await vi.waitFor(() =>
      expect(setAccessKeySession).toHaveBeenCalledWith(KEY)
    );
  });

  it('installs a mount-time key exactly once', async () => {
    render(<TigrisShell welcome={false} accessKey={KEY} />);

    await vi.waitFor(() =>
      expect(setAccessKeySession).toHaveBeenCalledWith(KEY)
    );
    expect(setAccessKeySession).toHaveBeenCalledTimes(1);
  });

  it('does not reinstall an unchanged key on re-render', async () => {
    const view = render(<TigrisShell welcome={false} accessKey={KEY} />);
    await vi.waitFor(() =>
      expect(setAccessKeySession).toHaveBeenCalledTimes(1)
    );

    view.rerender(<TigrisShell welcome={false} accessKey={{ ...KEY }} />);
    await new Promise((r) => setTimeout(r, 10));

    expect(setAccessKeySession).toHaveBeenCalledTimes(1);
  });

  it('lets a key that arrives during an Auth0 restore win', async () => {
    // Regression: the late-key effect wrote straight away, and a persisted
    // Auth0 session finishing its restore afterwards overwrote it, so the
    // shell ran as the OAuth user instead of the supplied key.
    const order: string[] = [];
    vi.mocked(restoreAuth0Session).mockImplementationOnce(async () => {
      order.push('restore:start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('restore:end');
      return true;
    });
    setAccessKeySession.mockImplementationOnce(async () => {
      order.push('key');
    });

    const view = render(<TigrisShell welcome={false} />);
    view.rerender(<TigrisShell welcome={false} accessKey={KEY} />);

    await vi.waitFor(() =>
      expect(order).toEqual(['restore:start', 'restore:end', 'key'])
    );
  });

  it('installs a changed key', async () => {
    const view = render(<TigrisShell welcome={false} accessKey={KEY} />);
    await vi.waitFor(() =>
      expect(setAccessKeySession).toHaveBeenCalledTimes(1)
    );

    const next = { accessKeyId: 'tid_b', secretAccessKey: 'tsec_b' };
    view.rerender(<TigrisShell welcome={false} accessKey={next} />);

    await vi.waitFor(() =>
      expect(setAccessKeySession).toHaveBeenLastCalledWith(next)
    );
  });
});
