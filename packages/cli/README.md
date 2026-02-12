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

- `tigris ls [path]` - List all buckets (no arguments) or objects under a bucket/prefix path. Accepts bare names or t3:// URIs
- `tigris mk <path>` - Create a bucket (bare name) or a folder inside a bucket (bucket/folder/ with trailing slash)
- `tigris touch <path>` - Create an empty (zero-byte) object at the given bucket/key path
- `tigris cp <src> <dest>` - Copy files between local filesystem and Tigris, or between paths within Tigris. At least one side must be a remote t3:// path
- `tigris mv <src> <dest>` - Move (rename) objects within Tigris. Both source and destination must be remote t3:// paths
- `tigris rm <path>` - Remove a bucket, folder, or object from Tigris. A bare bucket name deletes the bucket itself

### Authentication

- `tigris login` - Start a session via OAuth (default) or temporary credentials. Session state is cleared on logout
- `tigris logout` - End the current session and clear login state. Credentials saved via 'configure' are kept
- `tigris whoami` - Print the currently authenticated user, organization, and auth method
- `tigris configure` - Save access-key credentials to ~/.tigris/config.json for persistent use across all commands

### Resources

- `tigris organizations` - List, create, and switch between organizations. An organization is a workspace that contains your resources like buckets and access keys
- `tigris access-keys` - Create, list, inspect, delete, and assign roles to access keys. Access keys are credentials used for programmatic API access
- `tigris credentials` - Test whether your current credentials can reach Tigris and optionally verify access to a specific bucket
- `tigris buckets` - Create, inspect, update, and delete buckets. Buckets are top-level containers that hold objects
- `tigris forks` - List and create forks. A fork is a writable copy-on-write clone of a bucket, useful for testing or branching data
- `tigris snapshots` - List and take snapshots. A snapshot is a point-in-time, read-only copy of a bucket's state
- `tigris objects` - Low-level object operations for listing, downloading, uploading, and deleting individual objects in a bucket

---

## Core Commands

### `ls` | `list`

List all buckets (no arguments) or objects under a bucket/prefix path. Accepts bare names or t3:// URIs

```
tigris ls [path]
```

**Examples:**
```bash
tigris ls
tigris ls my-bucket
tigris ls my-bucket/images/
tigris ls t3://my-bucket/prefix/
```

### `mk` | `create`

Create a bucket (bare name) or a folder inside a bucket (bucket/folder/ with trailing slash)

```
tigris mk <path>
```

**Examples:**
```bash
tigris mk my-bucket
tigris mk my-bucket/images/
tigris mk t3://my-bucket
```

### `touch`

Create an empty (zero-byte) object at the given bucket/key path

```
tigris touch <path>
```

**Examples:**
```bash
tigris touch my-bucket/placeholder.txt
tigris touch t3://my-bucket/logs/
```

### `cp` | `copy`

Copy files between local filesystem and Tigris, or between paths within Tigris. At least one side must be a remote t3:// path

```
tigris cp <src> <dest> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --recursive` | Copy directories recursively |

**Examples:**
```bash
tigris cp ./file.txt t3://my-bucket/file.txt
tigris cp t3://my-bucket/file.txt ./local-copy.txt
tigris cp t3://my-bucket/src/ t3://my-bucket/dest/ -r
tigris cp ./images/ t3://my-bucket/images/ -r
```

### `mv` | `move`

Move (rename) objects within Tigris. Both source and destination must be remote t3:// paths

```
tigris mv <src> <dest> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --recursive` | Move directories recursively |
| `-f, --force` | Skip confirmation prompt |

**Examples:**
```bash
tigris mv t3://my-bucket/old.txt t3://my-bucket/new.txt -f
tigris mv t3://my-bucket/old-dir/ t3://my-bucket/new-dir/ -rf
tigris mv my-bucket/a.txt my-bucket/b.txt -f
```

### `rm` | `remove`

Remove a bucket, folder, or object from Tigris. A bare bucket name deletes the bucket itself

```
tigris rm <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --recursive` | Remove directories recursively |
| `-f, --force` | Skip confirmation prompt |

**Examples:**
```bash
tigris rm t3://my-bucket/file.txt -f
tigris rm t3://my-bucket/folder/ -rf
tigris rm t3://my-bucket -f
tigris rm "t3://my-bucket/logs/*.tmp" -f
```

## Authentication

### `login` | `l`

Start a session via OAuth (default) or temporary credentials. Session state is cleared on logout

| Command | Description |
|---------|-------------|
| `login select` | Choose how to login - OAuth (browser) or credentials (access key) |
| `login oauth` (o) | Login via browser using OAuth2 device flow. Best for interactive use |
| `login credentials` (c) | Login with an access key and secret. Creates a temporary session that is cleared on logout |

#### `login select`

```
tigris login select
```

#### `login oauth`

```
tigris login oauth
```

**Examples:**
```bash
tigris login oauth
```

#### `login credentials`

```
tigris login credentials [flags]
```

| Flag | Description |
|------|-------------|
| `-key, --access-key` | Your access key ID (will prompt if not provided) |
| `-secret, --access-secret` | Your secret access key (will prompt if not provided) |

**Examples:**
```bash
tigris login credentials --access-key tid_AaBb --access-secret tsec_XxYy
tigris login credentials
```

### `logout`

End the current session and clear login state. Credentials saved via 'configure' are kept

```
tigris logout
```

**Examples:**
```bash
tigris logout
```

### `whoami` | `w`

Print the currently authenticated user, organization, and auth method

```
tigris whoami
```

**Examples:**
```bash
tigris whoami
```

### `configure` | `c`

Save access-key credentials to ~/.tigris/config.json for persistent use across all commands

```
tigris configure [flags]
```

| Flag | Description |
|------|-------------|
| `-key, --access-key` | Your Tigris access key ID |
| `-secret, --access-secret` | Your Tigris secret access key |
| `-e, --endpoint` | Tigris API endpoint (default: https://t3.storage.dev) |

**Examples:**
```bash
tigris configure --access-key tid_AaBb --access-secret tsec_XxYy
tigris configure --endpoint https://custom.endpoint.dev
```

## Resources

### `organizations` | `orgs`

List, create, and switch between organizations. An organization is a workspace that contains your resources like buckets and access keys

| Command | Description |
|---------|-------------|
| `organizations list` (l) | List all organizations you belong to and interactively select one as active |
| `organizations create` (c) | Create a new organization with the given name |
| `organizations select` (s) | Set the named organization as your active org for all subsequent commands |

#### `organizations list`

```
tigris organizations list [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: select) |
| `-i, --select` | Interactive selection mode |

**Examples:**
```bash
tigris orgs list
tigris orgs list --format json
```

#### `organizations create`

```
tigris organizations create <name>
```

**Examples:**
```bash
tigris orgs create my-org
```

#### `organizations select`

```
tigris organizations select <name>
```

**Examples:**
```bash
tigris orgs select my-org
```

### `access-keys` | `keys`

Create, list, inspect, delete, and assign roles to access keys. Access keys are credentials used for programmatic API access

| Command | Description |
|---------|-------------|
| `access-keys list` (l) | List all access keys in the current organization |
| `access-keys create` (c) | Create a new access key with the given name. Returns the key ID and secret (shown only once) |
| `access-keys delete` (d) | Permanently delete an access key by its ID. This revokes all access immediately |
| `access-keys get` (g) | Show details for an access key including its name, creation date, and assigned bucket roles |
| `access-keys assign` (a) | Assign per-bucket roles to an access key. Pair each --bucket with a --role (Editor or ReadOnly), or use --admin for org-wide access |

#### `access-keys list`

```
tigris access-keys list
```

**Examples:**
```bash
tigris access-keys list
```

#### `access-keys create`

```
tigris access-keys create <name>
```

**Examples:**
```bash
tigris access-keys create my-ci-key
```

#### `access-keys delete`

```
tigris access-keys delete <id>
```

**Examples:**
```bash
tigris access-keys delete tid_AaBbCcDdEeFf
```

#### `access-keys get`

```
tigris access-keys get <id>
```

**Examples:**
```bash
tigris access-keys get tid_AaBbCcDdEeFf
```

#### `access-keys assign`

```
tigris access-keys assign <id> [flags]
```

| Flag | Description |
|------|-------------|
| `-b, --bucket` | Bucket name (can specify multiple, comma-separated). Each bucket is paired positionally with a --role value |
| `-r, --role` | Role to assign (can specify multiple, comma-separated). Each role pairs with the corresponding --bucket value |
| `--admin` | Grant admin access to all buckets in the organization |
| `--revoke-roles` | Revoke all bucket roles from the access key |

**Examples:**
```bash
tigris access-keys assign tid_AaBb --bucket my-bucket --role Editor
tigris access-keys assign tid_AaBb --bucket a,b --role Editor,ReadOnly
tigris access-keys assign tid_AaBb --admin
tigris access-keys assign tid_AaBb --revoke-roles
```

### `credentials` | `creds`

Test whether your current credentials can reach Tigris and optionally verify access to a specific bucket

| Command | Description |
|---------|-------------|
| `credentials test` (t) | Verify that current credentials are valid. Optionally checks access to a specific bucket |

#### `credentials test`

```
tigris credentials test [flags]
```

| Flag | Description |
|------|-------------|
| `-b, --bucket` | Bucket name to test access against (optional) |

**Examples:**
```bash
tigris credentials test
tigris credentials test --bucket my-bucket
```

### Buckets

Buckets are containers for objects. You can also create forks and snapshots of buckets.

#### `buckets` | `b`

Create, inspect, update, and delete buckets. Buckets are top-level containers that hold objects

| Command | Description |
|---------|-------------|
| `buckets list` (l) | List all buckets in the current organization |
| `buckets create` (c) | Create a new bucket with optional access, tier, consistency, and region settings |
| `buckets get` (g) | Show details for a bucket including access level, region, tier, and custom domain |
| `buckets delete` (d) | Delete one or more buckets by name. The bucket must be empty or delete-protection must be off |
| `buckets set` (s) | Update settings on an existing bucket such as access level, region, caching, or custom domain |

##### `buckets list`

```
tigris buckets list [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: table) |

**Examples:**
```bash
tigris buckets list
tigris buckets list --format json
```

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

**Examples:**
```bash
tigris buckets create my-bucket
tigris buckets create my-bucket --access public --region iad
tigris buckets create my-bucket --enable-snapshots --default-tier STANDARD_IA
```

##### `buckets get`

```
tigris buckets get <name>
```

**Examples:**
```bash
tigris buckets get my-bucket
```

##### `buckets delete`

```
tigris buckets delete <name>
```

**Examples:**
```bash
tigris buckets delete my-bucket
tigris buckets delete bucket-a,bucket-b
```

##### `buckets set`

```
tigris buckets set <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--access` | Bucket access level |
| `--region` | Allowed regions (can specify multiple) |
| `--allow-object-acl` | Enable object-level ACL |
| `--disable-directory-listing` | Disable directory listing |
| `--cache-control` | Default cache-control header value |
| `--custom-domain` | Custom domain for the bucket |
| `--enable-delete-protection` | Enable delete protection |

**Examples:**
```bash
tigris buckets set my-bucket --access public
tigris buckets set my-bucket --region iad,fra --cache-control 'max-age=3600'
tigris buckets set my-bucket --custom-domain assets.example.com
```

#### `forks` | `f`

List and create forks. A fork is a writable copy-on-write clone of a bucket, useful for testing or branching data

| Command | Description |
|---------|-------------|
| `forks list` (l) | List all forks created from the given source bucket |
| `forks create` (c) | Create a new fork (copy-on-write clone) of the source bucket. Optionally fork from a specific snapshot |

##### `forks list`

```
tigris forks list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: table) |

**Examples:**
```bash
tigris forks list my-bucket
tigris forks list my-bucket --format json
```

##### `forks create`

```
tigris forks create <name> <fork-name> [flags]
```

| Flag | Description |
|------|-------------|
| `-s, --snapshot` | Create fork from a specific snapshot |

**Examples:**
```bash
tigris forks create my-bucket my-fork
tigris forks create my-bucket my-fork --snapshot snap-2025-01-01
```

#### `snapshots` | `s`

List and take snapshots. A snapshot is a point-in-time, read-only copy of a bucket's state

| Command | Description |
|---------|-------------|
| `snapshots list` (l) | List all snapshots for the given bucket, ordered by creation time |
| `snapshots take` (t) | Take a new snapshot of the bucket's current state. Optionally provide a name for the snapshot |

##### `snapshots list`

```
tigris snapshots list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-f, --format` | Output format (default: table) |

**Examples:**
```bash
tigris snapshots list my-bucket
tigris snapshots list my-bucket --format json
```

##### `snapshots take`

```
tigris snapshots take <name> [snapshot-name]
```

**Examples:**
```bash
tigris snapshots take my-bucket
tigris snapshots take my-bucket my-snapshot
```

### `objects` | `o`

Low-level object operations for listing, downloading, uploading, and deleting individual objects in a bucket

| Command | Description |
|---------|-------------|
| `objects list` (l) | List objects in a bucket, optionally filtered by a key prefix |
| `objects get` (g) | Download an object by key. Prints to stdout by default, or saves to a file with --output |
| `objects put` (p) | Upload a local file as an object. Content-type is auto-detected from extension unless overridden |
| `objects delete` (d) | Delete one or more objects by key from the given bucket |

#### `objects list`

```
tigris objects list <bucket> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Filter objects by key prefix (e.g. "images/" to list only images) |
| `-f, --format` | Output format (default: table) |

**Examples:**
```bash
tigris objects list my-bucket
tigris objects list my-bucket --prefix images/
tigris objects list my-bucket --format json
```

#### `objects get`

```
tigris objects get <bucket> <key> [flags]
```

| Flag | Description |
|------|-------------|
| `-o, --output` | Output file path (if not specified, prints to stdout) |
| `-m, --mode` | Response mode: "string" loads into memory, "stream" writes in chunks (auto-detected from extension if not specified) |

**Examples:**
```bash
tigris objects get my-bucket config.json
tigris objects get my-bucket archive.zip --output ./archive.zip --mode stream
```

#### `objects put`

```
tigris objects put <bucket> <key> [file] [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (default: private) |
| `-t, --content-type` | Content type (auto-detected from extension if omitted) |
| `-f, --format` | Output format (default: table) |

**Examples:**
```bash
tigris objects put my-bucket report.pdf ./report.pdf
tigris objects put my-bucket logo.png ./logo.png --access public --content-type image/png
```

#### `objects delete`

```
tigris objects delete <bucket> <key>
```

**Examples:**
```bash
tigris objects delete my-bucket old-file.txt
tigris objects delete my-bucket file-a.txt,file-b.txt
```

## License

MIT
