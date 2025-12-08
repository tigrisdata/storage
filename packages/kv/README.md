# Tigris KV

A simple key-value store powered by [Tigris Storage](https://www.tigrisdata.com/).

Why use object storage as a key-value store? Tigris excels at handling small objects. Here's a detailed write-up and benchmark: [Benchmarking Small Objects](https://www.tigrisdata.com/blog/benchmark-small-objects/)

## Installation

```bash
npm install @tigrisdata/kv
```

## Configuration

Create an account and set up a bucket at [storage.new](https://storage.new)

Set up your Tigris credentials using environment variables (you can also use a `.env` file).

```bash
TIGRIS_STORAGE_BUCKET=your-bucket-name
TIGRIS_STORAGE_ACCESS_KEY_ID=your-access-key
TIGRIS_STORAGE_SECRET_ACCESS_KEY=your-secret-key
TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev  # optional, defaults to this
```

## Usage

### Basic Operations

```typescript
import { KV } from '@tigrisdata/kv';

const kv = new KV<string>();

// Set a value
await kv.set('foo', 'bar');

// Get a value
const value = await kv.get('foo'); // 'bar'

// Delete a key
await kv.delete('foo');

// Clear all keys
await kv.clear();

// Check if key exists
await kv.has('foo'); // false
```

### Using Namespaces

Namespaces allow you to isolate different sets of keys. Keys are prefixed with the namespace using `/` as a separator.

```typescript
const users = new KV<{ name: string }>({ namespace: 'users' });
const sessions = new KV<{ token: string }>({ namespace: 'sessions' });

// These don't conflict - stored as 'users/123' and 'sessions/123'
await users.set('123', { name: 'Alice' });
await sessions.set('123', { token: 'abc' });

// Nested namespaces are supported
const adminUsers = new KV<{ name: string }>({ namespace: 'app/admin/users' });
await adminUsers.set('1', { name: 'Admin' }); // stored as 'app/admin/users/1'
```

### TTL (Time-To-Live)

Set expiration times for keys in milliseconds.

```typescript
// Default TTL for all keys (1 hour)
const kv = new KV<string>({ ttl: 3600000 });

await kv.set('session', 'data'); // expires in 1 hour

// Override TTL per key (5 minutes)
await kv.set('temp', 'data', 300000);

// No TTL (persists indefinitely)
const persistent = new KV<string>();
await persistent.set('config', 'value');
```

### Batch Operations

```typescript
const kv = new KV<string>();

// Set multiple values
await kv.setMany([
  { key: 'key1', value: 'value1' },
  { key: 'key2', value: 'value2', ttl: 60000 },
]);

// Get multiple values
const values = await kv.getMany(['key1', 'key2', 'key3']);
// ['value1', 'value2', undefined]

// Check multiple keys
const exists = await kv.hasMany(['key1', 'key2', 'key3']);
// [true, true, false]

// Delete multiple keys
await kv.deleteMany(['key1', 'key2']);
```

### Iterating Over Keys

```typescript
const kv = new KV<string>();

await kv.set('key1', 'value1');
await kv.set('key2', 'value2');

// Async iterator
for await (const [key, value] of kv.iterator()) {
  console.log(key, value);
}

// Get all entries
const entries = await kv.entries(); // [['key1', 'value1'], ['key2', 'value2']]

// Get all keys
const keys = await kv.keys(); // ['key1', 'key2']

// Get all values
const values = await kv.values(); // ['value1', 'value2']
```

### Error Handling

```typescript
const kv = new KV<string>();

kv.on('error', (error) => {
  console.error('Storage error:', error);
});
```

### Passing Configuration Directly

```typescript
const kv = new KV<string>({
  bucket: 'your-bucket-name',
  accessKeyId: 'your-access-key',
  secretAccessKey: 'your-secret-key',
  endpoint: 'https://t3.storage.dev',
  namespace: 'myapp',
  ttl: 3600000,
});
```

## API

### Constructor Options (`KVOptions`)

| Option            | Type     | Description                                             |
| ----------------- | -------- | ------------------------------------------------------- |
| `bucket`          | `string` | Tigris bucket name                                      |
| `accessKeyId`     | `string` | Tigris access key ID                                    |
| `secretAccessKey` | `string` | Tigris secret access key                                |
| `endpoint`        | `string` | Tigris endpoint URL (default: `https://t3.storage.dev`) |
| `namespace`       | `string` | Optional namespace prefix for keys (uses `/` separator) |
| `ttl`             | `number` | Default TTL in milliseconds for all keys                |

### Methods

| Method                      | Returns                        | Description                          |
| --------------------------- | ------------------------------ | ------------------------------------ |
| `get(key)`                  | `Promise<T \| undefined>`      | Get a value by key                   |
| `getMany(keys)`             | `Promise<(T \| undefined)[]>`  | Get multiple values                  |
| `set(key, value, ttl?)`     | `Promise<boolean>`             | Set a value with optional TTL        |
| `setMany(entries)`          | `Promise<boolean[]>`           | Set multiple values                  |
| `delete(key)`               | `Promise<boolean>`             | Delete a key                         |
| `deleteMany(keys)`          | `Promise<boolean>`             | Delete multiple keys                 |
| `has(key)`                  | `Promise<boolean>`             | Check if key exists                  |
| `hasMany(keys)`             | `Promise<boolean[]>`           | Check if multiple keys exist         |
| `clear()`                   | `Promise<void>`                | Clear all keys (in namespace)        |
| `iterator()`                | `AsyncGenerator<[string, T]>`  | Iterate over all key-value pairs     |
| `entries()`                 | `Promise<[string, T][]>`       | Get all entries as array             |
| `keys()`                    | `Promise<string[]>`            | Get all keys                         |
| `values()`                  | `Promise<T[]>`                 | Get all values                       |
| `disconnect()`              | `void`                         | Cleanup (no-op for Tigris)           |

## License

MIT
