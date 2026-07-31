import { describe, expect, it, vi } from 'vitest';
import { bindOperations } from './bind-operations';

describe('bindOperations', () => {
  it('skips non-function exports (enums, re-exported values)', () => {
    const ns = { SomeEnum: { A: 0, B: 1 }, someValue: 'x' };
    const buildConfig = vi.fn();

    const bound = bindOperations(ns, buildConfig);

    expect(bound).toEqual({});
  });

  it('injects config even when the caller omits the trailing options arg', async () => {
    const list = vi.fn(async (opts?: { config?: unknown }) => ({
      data: opts,
    }));
    const buildConfig = vi.fn().mockResolvedValue({ data: { endpoint: 'e' } });

    const bound = bindOperations({ list }, buildConfig);
    const result = await bound.list();

    expect(list).toHaveBeenCalledWith({ config: { endpoint: 'e' } });
    expect(result).toEqual({ data: { config: { endpoint: 'e' } } });
  });

  it('slices by declared arity, not by call-site arg count', async () => {
    // Mirrors head(path, opts?): a positional string arg, options omitted.
    const head = vi.fn(async (_path: string, opts?: { config?: unknown }) => ({
      data: opts,
    }));
    const buildConfig = vi.fn().mockResolvedValue({ data: {} });

    const bound = bindOperations({ head }, buildConfig);
    await bound.head('folder/file.txt');

    expect(head).toHaveBeenCalledWith('folder/file.txt', { config: {} });
  });

  it('does not mistake a positional object arg for the options bag when options is omitted', async () => {
    // Mirrors createTeam(input, opts?): `input` is data, not options —
    // must not be scanned for `bucket` or have `config` merged into it.
    const createTeam = vi.fn(
      async (input: { name: string }, opts?: { config?: unknown }) => ({
        input,
        opts,
      })
    );
    const buildConfig = vi.fn().mockResolvedValue({ data: { endpoint: 'e' } });

    const bound = bindOperations({ createTeam }, buildConfig);
    await bound.createTeam({ name: 'eng' });

    expect(createTeam).toHaveBeenCalledWith(
      { name: 'eng' },
      { config: { endpoint: 'e' } }
    );
  });

  it('extracts a per-call bucket override and forwards it to buildConfig', async () => {
    const get = vi.fn(
      async (
        _path: string,
        opts?: { bucket?: string; format?: string; config?: unknown }
      ) => opts
    );
    const buildConfig = vi.fn().mockResolvedValue({ data: {} });

    const bound = bindOperations({ get }, buildConfig);
    await bound.get('key', { bucket: 'other-bucket', format: 'string' });

    expect(buildConfig).toHaveBeenCalledWith('other-bucket');
    expect(get).toHaveBeenCalledWith('key', { format: 'string', config: {} });
  });

  it('short-circuits with the buildConfig error and does not call the underlying function', async () => {
    const put = vi.fn();
    const buildConfig = vi
      .fn()
      .mockResolvedValue({ error: new Error('bad auth') });

    const bound = bindOperations({ put }, buildConfig);
    const result = await bound.put('key', 'body');

    expect(result).toEqual({ error: new Error('bad auth') });
    expect(put).not.toHaveBeenCalled();
  });

  it('pads omitted leading positional args with undefined instead of sliding options left', async () => {
    // Mirrors listForks(sourceBucketName?: string | Options, options?: Options):
    // the bare function dispatches on `typeof sourceBucketName === 'object'`
    // to support being called with a single bare options object. If a
    // zero-arg class-method call collapsed to a single positional slot,
    // that dispatch would fire here too and strand `config` off the end,
    // unread — dropping all auth for the call.
    const listForks = vi.fn(
      async (
        sourceBucketName?: string | { config?: unknown },
        options?: { config?: unknown }
      ) => {
        if (typeof sourceBucketName === 'object') {
          return { data: { usedConfig: sourceBucketName.config } };
        }
        return { data: { usedConfig: options?.config } };
      }
    );
    const buildConfig = vi.fn().mockResolvedValue({ data: { endpoint: 'e' } });

    const bound = bindOperations({ listForks }, buildConfig);
    const result = await bound.listForks();

    expect(listForks).toHaveBeenCalledWith(undefined, {
      config: { endpoint: 'e' },
    });
    expect(result).toEqual({ data: { usedConfig: { endpoint: 'e' } } });
  });

  it('passes a bare config value (no wrapping object) for bareConfigParams entries', async () => {
    const handleClientUpload = vi.fn(
      async (_req: unknown, config?: unknown) => config
    );
    const buildConfig = vi.fn().mockResolvedValue({ data: { endpoint: 'e' } });

    const bound = bindOperations({ handleClientUpload }, buildConfig, {
      bareConfigParams: ['handleClientUpload'],
    });
    await bound.handleClientUpload({ action: 'init' });

    expect(buildConfig).toHaveBeenCalledWith();
    expect(handleClientUpload).toHaveBeenCalledWith(
      { action: 'init' },
      { endpoint: 'e' }
    );
  });
});
