# @tigrisdata/cli

Command line interface for Tigris object storage.

## Installation

```bash
npm install -g @tigrisdata/cli
```

## Usage

```
tigris <command> [flags]
```

Run `tigris help` to see all available commands, or `tigris <command> help` for details on a specific command.

### Core Commands

- `tigris ls [path]` - List buckets or objects in a bucket or path
- `tigris mk <path>` - Create a bucket or a folder in a bucket
- `tigris touch <path>` - Create an empty object in a bucket
- `tigris cp <src> <dest>` - Copy a folder or an object
- `tigris mv <src> <dest>` - Move a folder or an object
- `tigris rm <path>` - Remove a bucket or a folder in a bucket or an object in a bucket or path

### Authentication

- `tigris login` - Login to Tigris (interactive selection between user and machine)
- `tigris logout` - Logout from Tigris
- `tigris whoami` - Show information about the current user
- `tigris configure` - Configure Tigris credentials interactively

### Resources

- `tigris organizations` - Manage organizations
- `tigris buckets` - Manage buckets
- `tigris forks` - Manage forks
- `tigris snapshots` - Manage snapshots
- `tigris objects` - Manage objects

---

## Core Commands

### `ls` | `list`

List buckets or objects in a bucket or path

```
tigris ls [path]
```

**Examples:**
```bash
tigris ls my-bucket
tigris ls my-bucket/my-path
```

### `mk` | `create`

Create a bucket or a folder in a bucket

```
tigris mk <path>
```

**Examples:**
```bash
tigris mk my-bucket
tigris mk my-bucket/my-path
```

### `touch`

Create an empty object in a bucket

```
tigris touch <path>
```

**Examples:**
```bash
tigris touch my-bucket/my-file.txt
```

### `cp` | `copy`

Copy a folder or an object

```
tigris cp <src> <dest>
```

**Examples:**
```bash
tigris cp bucket/file.txt bucket/copy.txt
tigris cp bucket/folder/ other-bucket/folder/
```

### `mv` | `move`

Move a folder or an object

```
tigris mv <src> <dest> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --force` | Skip confirmation prompt |

**Examples:**
```bash
tigris mv bucket/file.txt bucket/copy.txt
tigris mv bucket/folder/ other-bucket/folder/
```

### `rm` | `remove`

Remove a bucket or a folder in a bucket or an object in a bucket or path

```
tigris rm <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --force` | Skip confirmation prompt |

**Examples:**
```bash
tigris rm my-bucket
tigris rm my-bucket/my-path
tigris rm my-bucket/my-path/*
```

## Authentication

### `login` | `l`

Login to Tigris (interactive selection between user and machine)

| Command | Description |
|---------|-------------|
| `login select` | Interactive selection between user and machine login |
| `login ui` (u) | Login as a user (OAuth2 flow) |
| `login credentials` (c) | Login as a machine (with access key and secret) |

#### `login select`

```
tigris login select [flags]
```

| Flag | Description |
|------|-------------|
| `-key, --access-key` | Access key (optional, will use credentials flow if provided) |
| `-secret, --access-secret` | Access secret (optional, will use credentials flow if provided) |
| `-p, --profile` | Use saved credentials profile (loads from ~/.tigris/credentials.json) |
| `-o, --oauth` | Login as a user (OAuth2 flow) |

#### `login ui`

```
tigris login ui
```

#### `login credentials`

```
tigris login credentials [flags]
```

| Flag | Description |
|------|-------------|
| `-key, --access-key` | Access key (optional, will prompt or use saved credentials if not provided) |
| `-secret, --access-secret` | Access secret (optional, will prompt or use saved credentials if not provided) |

### `logout`

Logout from Tigris

```
tigris logout
```

### `whoami` | `w`

Show information about the current user

```
tigris whoami
```

### `configure` | `c`

Configure Tigris credentials interactively

```
tigris configure [flags]
```

| Flag | Description |
|------|-------------|
| `-key, --access-key` | Tigris Access key ID |
| `-secret, --access-secret` | Tigris Access secret |
| `-e, --endpoint` | Tigris Endpoint |

## Resources

### `organizations` | `orgs`

Manage organizations

| Command | Description |
|---------|-------------|
| `organizations list` (l) | List organizations |
| `organizations create` (c) | Create organization |
| `organizations select` (s) | Select the organization to use |

#### `organizations list`

```
tigris organizations list [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Format (default: select) |
| `-i, --select` | Interactive selection mode |

#### `organizations create`

```
tigris organizations create <name>
```

#### `organizations select`

```
tigris organizations select <name>
```

### Buckets

Buckets are containers for objects. You can also create forks and snapshots of buckets.

#### `buckets` | `b`

Manage buckets

| Command | Description |
|---------|-------------|
| `buckets list` (l) | List buckets |
| `buckets create` (c) | Create bucket |
| `buckets get` (g) | Get bucket details |
| `buckets delete` (d) | Delete bucket |

##### `buckets list`

```
tigris buckets list [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Format (default: table) |

##### `buckets create`

```
tigris buckets create [name] [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (default: private) |
| `-s, --enable-snapshots` | Enable snapshots for the bucket (default: false) |
| `-t, --default-tier` | Choose the default tier for the bucket (default: STANDARD) |
| `-c, --consistency` | Choose the consistency level for the bucket (default: default) |
| `-r, --region` | Region (default: global) |

##### `buckets get`

```
tigris buckets get <name>
```

##### `buckets delete`

```
tigris buckets delete <name>
```

#### `forks` | `f`

Manage forks

| Command | Description |
|---------|-------------|
| `forks list` (l) | List forks of a bucket |
| `forks create` (c) | Create a fork of a bucket |

##### `forks list`

```
tigris forks list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: table) |

##### `forks create`

```
tigris forks create <name> <fork-name> [flags]
```

| Flag | Description |
|------|-------------|
| `-s, --snapshot` | Create fork from a specific snapshot |

#### `snapshots` | `s`

Manage snapshots

| Command | Description |
|---------|-------------|
| `snapshots list` (l) | List snapshots of a bucket |
| `snapshots take` (t) | Take a snapshot of a bucket |

##### `snapshots list`

```
tigris snapshots list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: table) |

##### `snapshots take`

```
tigris snapshots take <name> [snapshot-name]
```

### `objects` | `o`

Manage objects

| Command | Description |
|---------|-------------|
| `objects list` (l) | List objects in a bucket |
| `objects get` (g) | Get an object |
| `objects put` (p) | Upload an object |
| `objects delete` (d) | Delete an object |

#### `objects list`

```
tigris objects list <bucket> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Filter objects by prefix |
| `-f, --format` | Output format (default: table) |

#### `objects get`

```
tigris objects get <bucket> <key> [flags]
```

| Flag | Description |
|------|-------------|
| `-o, --output` | Output file path (if not specified, prints to stdout) |
| `-m, --mode` | Response mode (auto-detected from extension if not specified) |

#### `objects put`

```
tigris objects put <bucket> <key> <file> [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (default: private) |
| `-t, --content-type` | Content type |
| `-f, --format` | Output format (default: table) |

#### `objects delete`

```
tigris objects delete <bucket> <key>
```

## License

MIT
