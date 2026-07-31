import { describe, expect, it, vi } from 'vitest';
import { TigrisClientBase } from './base';
import type { TigrisAuth } from './init-types';

class TestClient extends TigrisClientBase<{ auth: TigrisAuth }> {
  resolve() {
    return this.resolveAuthFields();
  }
}

describe('TigrisClientBase construct-time validation', () => {
  it('throws when auth is missing', () => {
    expect(() => new TestClient({} as { auth: TigrisAuth })).toThrow(
      /requires an `auth` option/
    );
  });

  it('throws when credentials are missing a required field', () => {
    expect(
      () =>
        new TestClient({
          auth: { accessKeyId: 'ak' } as unknown as TigrisAuth,
        })
    ).toThrow(/requires both fields/);
  });

  it('throws when a session is missing organizationId', () => {
    expect(
      () =>
        new TestClient({
          auth: { sessionToken: 'tok' } as unknown as TigrisAuth,
        })
    ).toThrow(/requires `organizationId`/);
  });

  it('throws on an auth object matching neither shape', () => {
    expect(
      () => new TestClient({ auth: { foo: 'bar' } as unknown as TigrisAuth })
    ).toThrow(/must be credentials/);
  });

  it('accepts static credentials without throwing', () => {
    expect(
      () =>
        new TestClient({
          auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
        })
    ).not.toThrow();
  });

  it('accepts a static session without throwing', () => {
    expect(
      () =>
        new TestClient({
          auth: { sessionToken: 'tok', organizationId: 'org_1' },
        })
    ).not.toThrow();
  });

  it('accepts a resolver function without calling it', () => {
    const resolver = vi.fn();
    expect(() => new TestClient({ auth: resolver })).not.toThrow();
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('TigrisClientBase#resolveAuthFields', () => {
  it('resolves static credentials as-is', async () => {
    const client = new TestClient({
      auth: { accessKeyId: 'ak', secretAccessKey: 'sk' },
    });

    expect(await client.resolve()).toEqual({
      data: {
        accessKeyId: 'ak',
        secretAccessKey: 'sk',
      },
    });
  });

  it('resolves a static session as-is', async () => {
    const client = new TestClient({
      auth: { sessionToken: 'tok', organizationId: 'org_1' },
    });

    expect(await client.resolve()).toEqual({
      data: { sessionToken: 'tok', organizationId: 'org_1' },
    });
  });

  it('resolves a resolver function through the session cache', async () => {
    const resolver = vi.fn().mockResolvedValue({
      sessionToken: 'tok',
      organizationId: 'org_1',
    });
    const client = new TestClient({ auth: resolver });

    await client.resolve();
    await client.resolve();

    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('surfaces a resolver rejection as an error, not a throw', async () => {
    const resolver = vi
      .fn()
      .mockRejectedValue(new Error('token endpoint down'));
    const client = new TestClient({ auth: resolver });

    const result = await client.resolve();

    expect(result.error?.message).toBe('token endpoint down');
  });
});
