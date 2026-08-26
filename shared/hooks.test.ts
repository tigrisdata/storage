import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitHook, getTigrisHttpHooks, setTigrisHttpHooks } from './hooks';

afterEach(() => {
  setTigrisHttpHooks(undefined);
});

describe('the hook registry', () => {
  it('starts empty', () => {
    expect(getTigrisHttpHooks()).toBeUndefined();
  });

  it('round-trips registered hooks', () => {
    const hooks = { onError: vi.fn() };
    setTigrisHttpHooks(hooks);

    expect(getTigrisHttpHooks()).toBe(hooks);
  });

  it('clears on undefined', () => {
    setTigrisHttpHooks({ onError: vi.fn() });
    setTigrisHttpHooks(undefined);

    expect(getTigrisHttpHooks()).toBeUndefined();
  });

  /**
   * `shared/` is bundled into every package rather than published once, so a
   * module-level registry would give `@tigrisdata/storage` and
   * `@tigrisdata/iam` a private copy each and silently drop the other
   * package's telemetry. These pin the registry to the shared global that
   * makes one registration cover them all.
   */
  it('stores hooks on a shared global rather than in module state', () => {
    const hooks = { onError: vi.fn() };
    setTigrisHttpHooks(hooks);

    const slot = (
      globalThis as Record<symbol, { hooks?: unknown } | undefined>
    )[Symbol.for('@tigrisdata/http-hooks.v1')];

    expect(slot?.hooks).toBe(hooks);
  });

  it('reads hooks a separate bundle copy registered', () => {
    // Stands in for another package's inlined copy of this module writing to
    // the same global slot.
    const hooks = { onError: vi.fn() };
    (globalThis as Record<symbol, { hooks?: unknown }>)[
      Symbol.for('@tigrisdata/http-hooks.v1')
    ] = { hooks };

    expect(getTigrisHttpHooks()).toBe(hooks);
  });

  it('keeps the registry key off enumerable global listings', () => {
    setTigrisHttpHooks({ onError: vi.fn() });

    const key = Symbol.for('@tigrisdata/http-hooks.v1');
    expect(Object.getOwnPropertySymbols(globalThis)).toContain(key);
    expect(Object.getOwnPropertyDescriptor(globalThis, key)?.enumerable).toBe(
      false
    );
  });
});

describe('emitHook', () => {
  it('passes the context through', () => {
    const hook = vi.fn();
    emitHook(hook, { source: 'http_error' });

    expect(hook).toHaveBeenCalledWith({ source: 'http_error' });
  });

  it('is a no-op when no hook is registered', () => {
    expect(() => emitHook(undefined, {})).not.toThrow();
  });

  it('swallows a synchronous throw so telemetry cannot fail a request', () => {
    const hook = vi.fn(() => {
      throw new Error('sentry is down');
    });

    expect(() => emitHook(hook, {})).not.toThrow();
    expect(hook).toHaveBeenCalled();
  });

  it('swallows a rejected promise without an unhandled rejection', async () => {
    const hook = vi.fn(() => Promise.reject(new Error('flush failed')));

    expect(() => emitHook(hook, {})).not.toThrow();
    await Promise.resolve();
    expect(hook).toHaveBeenCalled();
  });

  it('does not wait on a slow hook', async () => {
    let settled = false;
    emitHook(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            settled = true;
            resolve();
          }, 50);
        }),
      {}
    );

    // Returned synchronously, long before the hook's promise settles.
    expect(settled).toBe(false);
  });
});
