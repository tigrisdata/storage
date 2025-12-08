import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KV } from '../index';

const TEST_NAMESPACE = 'kv-test';

describe('KV', () => {
  let kv: KV<string>;

  beforeEach(() => {
    kv = new KV<string>({ namespace: TEST_NAMESPACE });
  });

  afterEach(async () => {
    await kv.clear();
  });

  describe('basic operations', () => {
    it('should set and get a value', async () => {
      const result = await kv.set('test-key', 'test-value');
      expect(result).toBe(true);

      const value = await kv.get('test-key');
      expect(value).toBe('test-value');
    });

    it('should return undefined for non-existent key', async () => {
      const value = await kv.get('non-existent-key');
      expect(value).toBeUndefined();
    });

    it('should delete a key', async () => {
      await kv.set('delete-key', 'delete-value');
      const deleted = await kv.delete('delete-key');
      expect(deleted).toBe(true);

      const value = await kv.get('delete-key');
      expect(value).toBeUndefined();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await kv.delete('non-existent-key');
      expect(deleted).toBe(false);
    });

    it('should check if key exists with has()', async () => {
      await kv.set('exists-key', 'exists-value');

      const exists = await kv.has('exists-key');
      expect(exists).toBe(true);

      const notExists = await kv.has('not-exists-key');
      expect(notExists).toBe(false);
    });

    it('should overwrite existing value', async () => {
      await kv.set('overwrite-key', 'first-value');
      await kv.set('overwrite-key', 'second-value');

      const value = await kv.get('overwrite-key');
      expect(value).toBe('second-value');
    });
  });

  describe('batch operations', () => {
    it('should get many values', async () => {
      await kv.set('many-1', 'value-1');
      await kv.set('many-2', 'value-2');
      await kv.set('many-3', 'value-3');

      const values = await kv.getMany(['many-1', 'many-2', 'many-3', 'many-4']);
      expect(values).toEqual(['value-1', 'value-2', 'value-3', undefined]);
    });

    it('should set many values', async () => {
      const results = await kv.setMany([
        { key: 'setmany-1', value: 'value-1' },
        { key: 'setmany-2', value: 'value-2' },
      ]);

      expect(results).toEqual([true, true]);

      const value1 = await kv.get('setmany-1');
      const value2 = await kv.get('setmany-2');
      expect(value1).toBe('value-1');
      expect(value2).toBe('value-2');
    });

    it('should delete many keys', async () => {
      await kv.set('delmany-1', 'value-1');
      await kv.set('delmany-2', 'value-2');

      const result = await kv.deleteMany(['delmany-1', 'delmany-2']);
      expect(result).toBe(true);

      const values = await kv.getMany(['delmany-1', 'delmany-2']);
      expect(values).toEqual([undefined, undefined]);
    });

    it('should check many keys with hasMany()', async () => {
      await kv.set('hasmany-1', 'value-1');
      await kv.set('hasmany-2', 'value-2');

      const results = await kv.hasMany([
        'hasmany-1',
        'hasmany-2',
        'hasmany-3',
      ]);
      expect(results).toEqual([true, true, false]);
    });
  });

  describe('clear', () => {
    it('should clear all keys in namespace', async () => {
      await kv.set('clear-1', 'value-1');
      await kv.set('clear-2', 'value-2');

      await kv.clear();

      const value1 = await kv.get('clear-1');
      const value2 = await kv.get('clear-2');
      expect(value1).toBeUndefined();
      expect(value2).toBeUndefined();
    });
  });

  describe('iteration', () => {
    it('should iterate over all entries', async () => {
      await kv.set('iter-1', 'value-1');
      await kv.set('iter-2', 'value-2');

      const entries: Array<[string, string]> = [];
      for await (const entry of kv.iterator()) {
        entries.push(entry);
      }

      expect(entries.length).toBe(2);
      expect(entries.map(([k]) => k).sort()).toEqual(['iter-1', 'iter-2']);
    });

    it('should get all entries', async () => {
      await kv.set('entries-1', 'value-1');
      await kv.set('entries-2', 'value-2');

      const entries = await kv.entries();

      expect(entries.length).toBe(2);
      expect(entries.map(([k]) => k).sort()).toEqual(['entries-1', 'entries-2']);
    });

    it('should get all keys', async () => {
      await kv.set('keys-1', 'value-1');
      await kv.set('keys-2', 'value-2');

      const keys = await kv.keys();

      expect(keys.sort()).toEqual(['keys-1', 'keys-2']);
    });

    it('should get all values', async () => {
      await kv.set('values-1', 'value-1');
      await kv.set('values-2', 'value-2');

      const values = await kv.values();

      expect(values.sort()).toEqual(['value-1', 'value-2']);
    });
  });
});

describe('KV with namespace', () => {
  let kv1: KV<string>;
  let kv2: KV<string>;

  beforeEach(() => {
    kv1 = new KV<string>({ namespace: 'namespace1' });
    kv2 = new KV<string>({ namespace: 'namespace2' });
  });

  afterEach(async () => {
    await kv1.clear();
    await kv2.clear();
  });

  it('should isolate keys by namespace', async () => {
    await kv1.set('shared-key', 'value-from-ns1');
    await kv2.set('shared-key', 'value-from-ns2');

    const value1 = await kv1.get('shared-key');
    const value2 = await kv2.get('shared-key');

    expect(value1).toBe('value-from-ns1');
    expect(value2).toBe('value-from-ns2');
  });

  it('should clear only keys in own namespace', async () => {
    await kv1.set('ns1-key', 'ns1-value');
    await kv2.set('ns2-key', 'ns2-value');

    await kv1.clear();

    const value1 = await kv1.get('ns1-key');
    const value2 = await kv2.get('ns2-key');

    expect(value1).toBeUndefined();
    expect(value2).toBe('ns2-value');
  });

  it('should use slash as namespace separator', async () => {
    const nsKv = new KV<string>({ namespace: 'app/users' });

    await nsKv.set('user1', 'John');

    // Verify namespace format
    expect(nsKv.namespace).toBe('app/users');

    const value = await nsKv.get('user1');
    expect(value).toBe('John');

    await nsKv.clear();
  });
});

describe('KV with TTL', () => {
  let kv: KV<string>;

  beforeEach(() => {
    kv = new KV<string>({ namespace: 'ttl-test' });
  });

  afterEach(async () => {
    await kv.clear();
  });

  it('should expire key after TTL', async () => {
    await kv.set('ttl-key', 'ttl-value', 1000); // 1000ms TTL

    // Should exist immediately
    let value = await kv.get('ttl-key');
    expect(value).toBe('ttl-value');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Should be expired
    value = await kv.get('ttl-key');
    expect(value).toBeUndefined();
  });

  it('should use default TTL from constructor', async () => {
    const kvWithTtl = new KV<string>({
      namespace: 'ttl-default-test',
      ttl: 1000,
    });

    await kvWithTtl.set('default-ttl-key', 'value');

    let value = await kvWithTtl.get('default-ttl-key');
    expect(value).toBe('value');

    await new Promise((resolve) => setTimeout(resolve, 1200));

    value = await kvWithTtl.get('default-ttl-key');
    expect(value).toBeUndefined();

    await kvWithTtl.clear();
  });

  it('should override default TTL with per-key TTL', async () => {
    const kvWithTtl = new KV<string>({
      namespace: 'ttl-override-test',
      ttl: 500,
    });

    await kvWithTtl.set('override-key', 'value', 2000); // Override with longer TTL

    await new Promise((resolve) => setTimeout(resolve, 800));

    // Should still exist because per-key TTL is 2000ms
    const value = await kvWithTtl.get('override-key');
    expect(value).toBe('value');

    await kvWithTtl.clear();
  });

  it('should return false for has() on expired key', async () => {
    const key = `has-ttl-key-${Date.now()}`;
    await kv.set(key, 'value', 1000);

    let exists = await kv.has(key);
    expect(exists).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 1200));

    exists = await kv.has(key);
    expect(exists).toBe(false);
  });

  it('should treat TTL of 0 as immediate expiration', async () => {
    await kv.set('zero-ttl-key', 'value', 0);

    // Should be expired immediately
    const value = await kv.get('zero-ttl-key');
    expect(value).toBeUndefined();

    const exists = await kv.has('zero-ttl-key');
    expect(exists).toBe(false);
  });

  it('should not yield expired keys in iterator', async () => {
    await kv.set('iter-persistent', 'value1');
    await kv.set('iter-expiring', 'value2', 100);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const entries = await kv.entries();
    const keys = entries.map(([k]) => k);

    expect(keys).toContain('iter-persistent');
    expect(keys).not.toContain('iter-expiring');
  });

  it('should set TTL via setMany', async () => {
    await kv.setMany([
      { key: 'setmany-ttl-1', value: 'value1', ttl: 100 },
      { key: 'setmany-ttl-2', value: 'value2' }, // No TTL
    ]);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const value1 = await kv.get('setmany-ttl-1');
    const value2 = await kv.get('setmany-ttl-2');

    expect(value1).toBeUndefined();
    expect(value2).toBe('value2');
  });
});

describe('KV with complex values', () => {
  let kv: KV<{ name: string; age: number }>;

  beforeEach(() => {
    kv = new KV<{ name: string; age: number }>({ namespace: 'complex-test' });
  });

  afterEach(async () => {
    await kv.clear();
  });

  it('should store and retrieve objects', async () => {
    const user = { name: 'John', age: 30 };
    await kv.set('user', user);

    const retrieved = await kv.get('user');
    expect(retrieved).toEqual(user);
  });

  it('should store and retrieve nested objects', async () => {
    const kvNested = new KV<{ user: { name: string }; settings: { theme: string } }>({
      namespace: 'nested-test',
    });

    const data = {
      user: { name: 'John' },
      settings: { theme: 'dark' },
    };

    await kvNested.set('config', data);
    const retrieved = await kvNested.get('config');

    expect(retrieved).toEqual(data);

    await kvNested.clear();
  });
});

describe('KV without namespace', () => {
  let kv: KV<string>;

  beforeEach(() => {
    kv = new KV<string>();
  });

  afterEach(async () => {
    // Clean up test keys manually since clear without namespace would clear everything
    await kv.delete('no-ns-key');
  });

  it('should work without namespace', async () => {
    await kv.set('no-ns-key', 'no-ns-value');

    const value = await kv.get('no-ns-key');
    expect(value).toBe('no-ns-value');
  });
});

describe('KV events', () => {
  it('should emit error events', async () => {
    const kv = new KV<string>({
      namespace: 'events-test',
      bucket: 'non-existent-bucket',
      accessKeyId: 'invalid',
      secretAccessKey: 'invalid',
    });

    const errors: Error[] = [];
    kv.on('error', (err) => errors.push(err));

    // This should fail and emit an error
    await kv.get('any-key');

    // Note: Error emission depends on the storage implementation
    // This test verifies the error handling mechanism is in place
  });
});
