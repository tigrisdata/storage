import { config as envConfig } from '@shared/index';
import type { TigrisStorageCoreConfig } from '@shared/types';
import { get, head, list, put, remove } from '@tigrisdata/storage';
import { EventEmitter } from 'events';

export interface KVOptions extends TigrisStorageCoreConfig {
  namespace?: string;
  ttl?: number;
}

interface StoredValue<T> {
  value: T;
  expires?: number;
}

export class KV<T = unknown> extends EventEmitter {
  private opts: TigrisStorageCoreConfig;
  private _namespace?: string;
  private _ttl?: number;

  constructor(options: KVOptions = {}) {
    super();
    const { namespace, ttl, ...storageOpts } = options;
    this.opts = {
      ...envConfig,
      ...storageOpts,
    };
    this._namespace = namespace;
    this._ttl = ttl;
  }

  get namespace(): string | undefined {
    return this._namespace;
  }

  private getFullKey(key: string): string {
    if (this._namespace) {
      return `${this._namespace}/${key}`;
    }
    return key;
  }

  private getKeyWithoutNamespace(fullKey: string): string {
    if (this._namespace && fullKey.startsWith(`${this._namespace}/`)) {
      return fullKey.slice(this._namespace.length + 1);
    }
    return fullKey;
  }

  private isExpired(stored: StoredValue<T>): boolean {
    if (stored.expires === undefined) {
      return false;
    }
    return Date.now() > stored.expires;
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const fullKey = this.getFullKey(key);
      const { data, error } = await get(fullKey, 'string', {
        config: this.opts,
      });

      if (error) {
        this.emit('error', error);
        return undefined;
      }

      if (!data) {
        return undefined;
      }

      try {
        const stored: StoredValue<T> = JSON.parse(data);

        if (this.isExpired(stored)) {
          await this.delete(key);
          return undefined;
        }

        return stored.value;
      } catch {
        return data as unknown as T;
      }
    } catch {
      return undefined;
    }
  }

  async getMany(keys: string[]): Promise<Array<T | undefined>> {
    return Promise.all(keys.map((k) => this.get(k)));
  }

  async set(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const effectiveTtl = ttl ?? this._ttl;

      const stored: StoredValue<T> = {
        value,
        expires:
          effectiveTtl !== undefined ? Date.now() + effectiveTtl : undefined,
      };

      const { error } = await put(fullKey, JSON.stringify(stored), {
        config: this.opts,
        contentType: 'application/json',
      });

      if (error) {
        this.emit('error', error);
        return false;
      }

      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  async setMany(
    entries: Array<{ key: string; value: T; ttl?: number }>
  ): Promise<boolean[]> {
    return Promise.all(
      entries.map(({ key, value, ttl }) => this.set(key, value, ttl))
    );
  }

  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);

    // Check if key exists using head (without expiration check to avoid circular dependency)
    const { data: headData } = await head(fullKey, {
      config: this.opts,
    });

    if (!headData) {
      return false;
    }

    const { error } = await remove(fullKey, {
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
    const prefix = this._namespace ? `${this._namespace}/` : undefined;

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
    // Use get() directly to check existence and handle TTL expiration
    const value = await this.get(key);
    return value !== undefined;
  }

  async hasMany(keys: string[]): Promise<boolean[]> {
    return Promise.all(keys.map((k) => this.has(k)));
  }

  async *iterator(): AsyncGenerator<[string, T], void> {
    const prefix = this._namespace ? `${this._namespace}/` : undefined;

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
        const key = this.getKeyWithoutNamespace(item.name);
        const value = await this.get(key);

        if (value !== undefined) {
          yield [key, value];
        }
      }

      paginationToken = data.paginationToken;
    } while (paginationToken);
  }

  async entries(): Promise<Array<[string, T]>> {
    const result: Array<[string, T]> = [];
    for await (const entry of this.iterator()) {
      result.push(entry);
    }
    return result;
  }

  async keys(): Promise<string[]> {
    const result: string[] = [];
    for await (const [key] of this.iterator()) {
      result.push(key);
    }
    return result;
  }

  async values(): Promise<T[]> {
    const result: T[] = [];
    for await (const [, value] of this.iterator()) {
      result.push(value);
    }
    return result;
  }

  disconnect(): void {
    // No persistent connection to close for Tigris storage
  }
}
