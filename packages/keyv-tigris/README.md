# Tigris Adapter for Keyv

A [Tigris Storage](https://www.tigrisdata.com/) adapter for [Keyv](https://keyv.org/).

Why use object storage as a key–value store? Tigris excels at handling small objects. Here’s a detailed write-up and benchmark: [Benchmarking Small Objects](https://www.tigrisdata.com/blog/benchmark-small-objects/)

## Installation

```bash
npm install @tigrisdata/keyv-tigris keyv
```

## Configuration

Create an account and setup bucket at [storage.new](https://storage.new)

Set up your Tigris credentials using environment variables (You can also use `.env` file)

```bash
TIGRIS_STORAGE_BUCKET=your-bucket-name
TIGRIS_STORAGE_ACCESS_KEY_ID=your-access-key
TIGRIS_STORAGE_SECRET_ACCESS_KEY=your-secret-key
TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev  # optional, defaults to this
```

```typescript
import Keyv from 'keyv';
import KeyvTigris from '@tigrisdata/keyv-tigris';

const store = new KeyvTigris();

// Or pass the configuration directly:

const store = new KeyvTigris({
  config: {
    bucket: 'your-bucket-name',
    accessKeyId: 'your-access-key',
    secretAccessKey: 'your-secret-key',
    endpoint: 'https://t3.storage.dev',
  },
});

const keyv = new Keyv({ store });
```

## Usage

### Basic Operations

```typescript
import Keyv from 'keyv';
import KeyvTigris from '@tigrisdata/keyv-tigris';

const keyv = new Keyv({ store: new KeyvTigris() });

// Set a value
await keyv.set('foo', 'bar');

// Get a value
const value = await keyv.get('foo'); // 'bar'

// Set with TTL (in milliseconds)
await keyv.set('temporary', 'data', 60000); // expires in 1 minute

// Delete a key
await keyv.delete('foo');

// Clear all keys
await keyv.clear();

// Check if key exists
await keyv.has('foo'); // false
```

### Using Namespaces

Namespaces allow you to isolate different sets of keys (handled by Keyv):

```typescript
const users = new Keyv({
  store: new KeyvTigris(),
  namespace: 'users',
});

const sessions = new Keyv({
  store: new KeyvTigris(),
  namespace: 'sessions',
});

// These don't conflict
await users.set('123', { name: 'Alice' });
await sessions.set('123', { token: 'abc' });
```

### Iterating Over Keys

```typescript
const keyv = new Keyv({ store: new KeyvTigris() });

await keyv.set('key1', 'value1');
await keyv.set('key2', 'value2');

for await (const [key, value] of keyv.iterator()) {
  console.log(key, value);
}
```

### Batch Operations

```typescript
// Get multiple values
const values = await keyv.get(['key1', 'key2', 'key3']);

// Delete multiple keys
await keyv.delete(['key1', 'key2']);
```

### Error Handling

```typescript
const store = new KeyvTigris();

store.on('error', (error) => {
  console.error('Storage error:', error);
});

const keyv = new Keyv({ store });
```

## API

### `KeyvTigrisOptions`

| Option   | Type                      | Description                                                  |
| -------- | ------------------------- | ------------------------------------------------------------ |
| `config` | `TigrisStorageCoreConfig` | Tigris storage configuration (bucket, credentials, endpoint) |

### `TigrisStorageCoreConfig`

| Option            | Type     | Description                                             |
| ----------------- | -------- | ------------------------------------------------------- |
| `bucket`          | `string` | Tigris bucket name                                      |
| `accessKeyId`     | `string` | Tigris access key ID                                    |
| `secretAccessKey` | `string` | Tigris secret access key                                |
| `endpoint`        | `string` | Tigris endpoint URL (default: `https://t3.storage.dev`) |

## License

MIT
