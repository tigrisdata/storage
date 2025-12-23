import { get, head, list, put, remove } from '@tigrisdata/storage';
import { EventEmitter } from 'events';
import type { KeyvStoreAdapter } from 'keyv';

export interface KeyvTigrisOptions {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
}

type InternalOpts = KeyvTigrisOptions & { url: string };

export class KeyvTigris extends EventEmitter implements KeyvStoreAdapter {
  opts: InternalOpts;
  namespace?: string; // Set by Keyv

  constructor(options: KeyvTigrisOptions = {}) {
    super();
    this.opts = { url: '', ...options };
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const { data, error } = await get(key, 'string', {
        config: this.opts,
      });

      if (error) {
        this.emit('error', error);
      }

      if (error || !data) {
        return undefined;
      }

      return data as T;
    } catch {
      return undefined;
    }
  }

  async getMany<T>(keys: string[]): Promise<Array<T | undefined>> {
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }

  // The ttl parameter is required by the KeyvStoreAdapter interface signature,
  // but Keyv handles TTL internally so we don't need to use it in our implementation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const { error } = await put(key, value as string, {
      config: this.opts,
      contentType: 'application/json',
    });

    if (error) {
      this.emit('error', error);
    }
  }

  async setMany<T>(
    entries: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<void> {
    await Promise.all(
      entries.map(({ key, value, ttl }) => this.set(key, value, ttl))
    );
  }

  async delete(key: string): Promise<boolean> {
    // Check if key exists first
    const exists = await this.has(key);
    if (!exists) {
      return false;
    }

    const { error } = await remove(key, {
      config: this.opts,
    });

    if (error) {
      this.emit('error', error);
      return false;
    }

    return true;
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    const results = await Promise.all(keys.map((k) => this.delete(k)));
    return results.every((result) => result);
  }

  async clear(): Promise<void> {
    // Keyv sets namespace on store, prefix format is "namespace:key"
    const prefix = this.namespace ? `${this.namespace}:` : undefined;

    let paginationToken: string | undefined;

    do {
      const { data, error } = await list({
        config: this.opts,
        prefix,
        paginationToken,
      });

      if (error || !data) {
        this.emit('error', error || new Error('Failed to list objects'));
        return;
      }

      await Promise.all(
        data.items.map((item) => remove(item.name, { config: this.opts }))
      );

      paginationToken = data.paginationToken;
    } while (paginationToken);
  }

  async has(key: string): Promise<boolean> {
    const { data, error } = await head(key, {
      config: this.opts,
    });

    if (error) {
      this.emit('error', error);
      return false;
    }

    if (!data) {
      return false;
    }

    return true;
  }

  async hasMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((k) => this.has(k)));
  }

  async *iterator<Value>(): AsyncGenerator<
    Array<string | Awaited<Value> | undefined>,
    void
  > {
    // Keyv sets namespace on store, prefix format is "namespace:key"
    const prefix = this.namespace ? `${this.namespace}:` : undefined;

    let paginationToken: string | undefined;

    do {
      const { data, error } = await list({
        config: this.opts,
        prefix,
        paginationToken,
      });

      if (error) {
        this.emit('error', error);
      }

      if (error || !data) {
        return;
      }

      for (const item of data.items) {
        const { data: valueData } = await get(item.name, 'string', {
          config: this.opts,
        });
        yield [item.name, valueData as Awaited<Value> | undefined];
      }

      paginationToken = data.paginationToken;
    } while (paginationToken);
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close for Tigris storage
  }
}
