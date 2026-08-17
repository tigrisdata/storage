import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TigrisIAM } from './tigris-iam';

const mockWhoami = vi.fn();
const mockCreateTeam = vi.fn();

// Named params (not `...args`) so `.length` mirrors the real bare
// functions' arity — bindOperations slices positional args from the
// trailing options object by declared arity, so a rest-param mock
// here would silently break that slicing.
vi.mock('./operations', () => ({
  whoami: (opts?: unknown) => mockWhoami(opts),
  createTeam: (input: unknown, opts?: unknown) => mockCreateTeam(input, opts),
  // Non-function export — must not become an instance method.
  SomeEnum: { A: 0, B: 1 },
}));

beforeEach(() => {
  mockWhoami.mockReset().mockResolvedValue({ data: {} });
  mockCreateTeam.mockReset().mockResolvedValue({ data: { teamId: 't' } });
});

describe('TigrisIAM', () => {
  it('attaches every function export as an instance method', () => {
    const iam = new TigrisIAM({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    expect(typeof iam.whoami).toBe('function');
    expect(typeof iam.createTeam).toBe('function');
  });

  it('does not attach non-function exports', () => {
    const iam = new TigrisIAM({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    expect(
      (iam as unknown as Record<string, unknown>).SomeEnum
    ).toBeUndefined();
  });

  it('builds config from static credentials', async () => {
    const iam = new TigrisIAM({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    await iam.whoami();

    expect(mockWhoami).toHaveBeenCalledWith({
      config: expect.objectContaining({
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      }),
    });
  });

  it('resolves a resolver-function auth into sessionToken/organizationId fields', async () => {
    const resolver = vi
      .fn()
      .mockResolvedValue({ sessionToken: 'tok', organizationId: 'org_1' });
    const iam = new TigrisIAM({ auth: resolver });

    await iam.createTeam({ name: 'eng' });
    await iam.createTeam({ name: 'eng' });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(mockCreateTeam).toHaveBeenCalledWith(
      { name: 'eng' },
      {
        config: expect.objectContaining({
          sessionToken: 'tok',
          organizationId: 'org_1',
        }),
      }
    );
  });

  it('surfaces an auth resolver failure as { error } instead of calling the underlying function', async () => {
    const resolver = vi
      .fn()
      .mockRejectedValue(new Error('token endpoint down'));
    const iam = new TigrisIAM({ auth: resolver });

    const result = await iam.whoami();

    expect(result).toEqual({ error: new Error('token endpoint down') });
    expect(mockWhoami).not.toHaveBeenCalled();
  });

  it('throws synchronously on a malformed auth option', () => {
    expect(
      () =>
        new TigrisIAM({
          auth: { accessKeyId: 'ak' } as never,
        })
    ).toThrow(/requires both fields/);
  });
});
