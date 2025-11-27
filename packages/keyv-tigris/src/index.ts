import { config as envConfig } from '@shared/index';
import type { TigrisStorageCoreConfig } from '@shared/types';
import { get, head, list, put, remove } from '@tigrisdata/storage';
import { EventEmitter } from 'events';
import type { KeyvStoreAdapter } from 'keyv';

export type KeyvTigrisOptions = {
  config?: TigrisStorageCoreConfig;
  namespace?: string;
};

type InternalOpts = KeyvTigrisOptions & {
  url: string;
};

export class KeyvTigris extends EventEmitter implements KeyvStoreAdapter {
  opts: InternalOpts;
  namespace?: string;

  constructor(options: KeyvTigrisOptions = {}) {
    super();
    this.opts = {
      url: '',
      ...options,
      config: {
        ...envConfig,
        ...options.config,
      },
    };
    this.namespace = options.namespace;
  }

  private getKey(key: string): string {
    return this.namespace ? `${this.namespace}/${key}` : key;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const path = this.getKey(key);

    try {
      const { data, error } = await get(path, 'string', {
        config: this.opts.config,
      });

      if (error || !data) {
        return undefined;
      }

      return data as T;
    } catch {
      return undefined;
    }
  }

  async getMany<T>(keys: string[]): Promise<Array<T | undefined>> {
    return Promise.all(keys.map((key) => this.get<T>(key)));
  }

  // The ttl parameter is required by the KeyvStoreAdapter interface signature, but Keyv handles TTL internally so we don't need to use it in our implementation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const path = this.getKey(key);

    const { error } = await put(path, value as string, {
      config: this.opts.config,
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
    const path = this.getKey(key);

    // Check if key exists first
    const exists = await this.has(key);
    if (!exists) {
      return false;
    }

    const { error } = await remove(path, {
      config: this.opts.config,
    });

    return !error;
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    const results = await Promise.all(keys.map((key) => this.delete(key)));
    return results.every((result) => result);
  }

  async clear(): Promise<void> {
    const keyPrefix = this.namespace ? `${this.namespace}/` : '';

    let paginationToken: string | undefined;

    do {
      const { data, error } = await list({
        config: this.opts.config,
        paginationToken,
      });

      if (error || !data) {
        this.emit('error', error || new Error('Failed to list objects'));
        return;
      }

      const keysToDelete = keyPrefix
        ? data.items
            .filter((item) => item.name.startsWith(keyPrefix))
            .map((item) => item.name)
        : data.items.map((item) => item.name);

      await Promise.all(
        keysToDelete.map((key) => remove(key, { config: this.opts.config }))
      );

      paginationToken = data.paginationToken;
    } while (paginationToken);
  }

  async has(key: string): Promise<boolean> {
    const path = this.getKey(key);

    const { data, error } = await head(path, {
      config: this.opts.config,
    });

    if (error || !data) {
      return false;
    }

    return true;
  }

  async hasMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((key) => this.has(key)));
  }

  async *iterator<Value>(
    namespace?: string
  ): AsyncGenerator<Array<string | Awaited<Value> | undefined>, void> {
    const ns = namespace || this.namespace;
    const keyPrefix = ns ? `${ns}/` : '';

    let paginationToken: string | undefined;

    do {
      const { data, error } = await list({
        config: this.opts.config,
        paginationToken,
      });

      if (error || !data) {
        return;
      }

      for (const item of data.items) {
        if (!keyPrefix || item.name.startsWith(keyPrefix)) {
          const key = keyPrefix ? item.name.slice(keyPrefix.length) : item.name;
          const value = await this.get<Value>(key);
          yield [key, value as Awaited<Value> | undefined];
        }
      }

      paginationToken = data.paginationToken;
    } while (paginationToken);
  }

  async disconnect(): Promise<void> {
    // No persistent connection to close for Tigris storage
  }
}

export default KeyvTigris;
