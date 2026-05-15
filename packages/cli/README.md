# @tigrisdata/cli

Command line interface for Tigris object storage.

## Installation

```bash
npm install -g @tigrisdata/cli
```

You can also install CLI using brew

```sh
brew install tigrisdata/tap/tigris
```

## Usage

```
tigris <command> [flags]
```

Run `tigris help` to see all available commands, or `tigris <command> help` for details on a specific command.

### Commands

| Command | Description |
|---------|-------------|
| `tigris configure` (c) | Save access-key credentials to ~/.tigris/config.json for persistent use across all commands |
| `tigris login` (l) | Start a session via OAuth (default) or temporary credentials. Session state is cleared on logout |
| `tigris whoami` (w) | Print the currently authenticated user, organization, and auth method |
| `tigris update` | Update the CLI to the latest version |
| `tigris logout` | End the current session and clear login state. Credentials saved via 'configure' are kept |
| `tigris credentials` (creds) | Test whether your current credentials can reach Tigris and optionally verify access to a specific bucket |
| `tigris ls` (list) | List all buckets (no arguments) or objects under a bucket/prefix path. Accepts bare names or t3:// URIs |
| `tigris mk` (create) | Create a bucket (bare name) or a folder inside a bucket (bucket/folder/ with trailing slash) |
| `tigris touch` | Create an empty (zero-byte) object at the given bucket/key path |
| `tigris stat` | Show storage stats (no args), bucket info, or object metadata |
| `tigris presign` | Generate a presigned URL for temporary access to an object without credentials |
| `tigris cp` (copy) | Copy files between local filesystem and Tigris, or between paths within Tigris. At least one side must be a remote t3:// path |
| `tigris mv` (move) | Move (rename) objects within Tigris. Both source and destination must be remote t3:// paths |
| `tigris rm` (remove) | Remove a bucket, folder, or object from Tigris. A bare bucket name deletes the bucket itself |
| `tigris bundle` | Download multiple objects as a streaming tar archive in a single request. Designed for batch workloads that need many objects without per-object HTTP overhead |
| `tigris organizations` (orgs) | List, create, and switch between organizations. An organization is a workspace that contains your resources like buckets and access keys |
| `tigris buckets` (b) | Create, inspect, update, and delete buckets. Buckets are top-level containers that hold objects |
| `tigris snapshots` (s) | List and take snapshots. A snapshot is a point-in-time, read-only copy of a bucket's state |
| `tigris objects` (o) | Low-level object operations for listing, downloading, uploading, and deleting individual objects in a bucket |
| `tigris access-keys` (keys) | Create, list, inspect, delete, and assign roles to access keys. Access keys are credentials used for programmatic API access |
| `tigris iam` | Identity and Access Management - manage policies, users, and permissions |

---

### `tigris configure` (c)

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

### `tigris login` (l)

Start a session via OAuth (default) or temporary credentials. Session state is cleared on logout

| Command | Description |
|---------|-------------|
| `tigris login select` | Choose how to login - OAuth (browser) or credentials (access key) |
| `tigris login oauth` (o) | Login via browser using OAuth2 device flow. Best for interactive use |
| `tigris login credentials` (c) | Login with an access key and secret. Creates a temporary session that is cleared on logout |

#### `tigris login select`

Choose how to login - OAuth (browser) or credentials (access key)

```
tigris login select
```

#### `tigris login oauth` (o)

Login via browser using OAuth2 device flow. Best for interactive use

```
tigris login oauth
```

**Examples:**
```bash
tigris login oauth
```

#### `tigris login credentials` (c)

Login with an access key and secret. Creates a temporary session that is cleared on logout

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

### `tigris whoami` (w)

Print the currently authenticated user, organization, and auth method

```
tigris whoami
```

**Examples:**
```bash
tigris whoami
```

### `tigris update`

Update the CLI to the latest version

```
tigris update
```

**Examples:**
```bash
tigris update
```

### `tigris logout`

End the current session and clear login state. Credentials saved via 'configure' are kept

```
tigris logout
```

**Examples:**
```bash
tigris logout
```

### `tigris credentials` (creds)

Test whether your current credentials can reach Tigris and optionally verify access to a specific bucket

| Command | Description |
|---------|-------------|
| `tigris credentials test` (t) | Verify that current credentials are valid. Optionally checks access to a specific bucket |

#### `tigris credentials test` (t)

Verify that current credentials are valid. Optionally checks access to a specific bucket

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

### `tigris ls` (list)

List all buckets (no arguments) or objects under a bucket/prefix path. Accepts bare names or t3:// URIs

```
tigris ls [path] [flags]
```

| Flag | Description |
|------|-------------|
| `-snapshot, --snapshot-version` | Read from a specific bucket snapshot. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464) |
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |
| `--source` | List objects from a specific storage source on buckets with shadow migration enabled |

**Examples:**
```bash
tigris ls
tigris ls my-bucket
tigris ls my-bucket/images/
tigris ls t3://my-bucket/prefix/
```

### `tigris mk` (create)

Create a bucket (bare name) or a folder inside a bucket (bucket/folder/ with trailing slash)

```
tigris mk <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (only applies when creating a bucket) (default: private) |
| `--public` | Shorthand for --access public (only applies when creating a bucket) |
| `-s, --enable-snapshots` | Enable snapshots for the bucket (only applies when creating a bucket) (default: false) |
| `-t, --default-tier` | Default storage tier (only applies when creating a bucket) (default: STANDARD) |
| `-l, --locations` | Location for the bucket (only applies when creating a bucket) (default: global) |
| `-fork, --fork-of` | Create this bucket as a fork (copy-on-write clone) of the named source bucket |
| `-source-snap, --source-snapshot` | Fork from a specific snapshot of the source bucket. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464). Requires --fork-of |

**Examples:**
```bash
tigris mk my-bucket
tigris mk my-bucket --access public --region iad
tigris mk my-bucket/images/
tigris mk t3://my-bucket
tigris mk my-fork --fork-of my-bucket
tigris mk my-fork --fork-of my-bucket --source-snapshot 1765889000501544464
```

### `tigris touch`

Create an empty (zero-byte) object at the given bucket/key path

```
tigris touch <path>
```

**Examples:**
```bash
tigris touch my-bucket/placeholder.txt
tigris touch t3://my-bucket/logs/
```

### `tigris stat`

Show storage stats (no args), bucket info, or object metadata

```
tigris stat [path] [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `-snapshot, --snapshot-version` | Read from a specific bucket snapshot. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464) |
| `--version-id` | Object version id to stat (requires bucket versioning). Omit to stat the latest version |

**Examples:**
```bash
tigris stat
tigris stat t3://my-bucket
tigris stat t3://my-bucket/my-object.json
```

### `tigris presign`

Generate a presigned URL for temporary access to an object without credentials

```
tigris presign <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-m, --method` | HTTP method for the presigned URL (default: get) |
| `-e, --expires-in` | URL expiry time in seconds (default: 3600) |
| `--access-key` | Access key ID to use for signing. If not provided, resolved from credentials or auto-selected |
| `--select` | Interactively select an access key (OAuth only) |
| `--format` | Output format (default: url) |

**Examples:**
```bash
tigris presign my-bucket/file.txt
tigris presign t3://my-bucket/report.pdf --method put --expires-in 7200
tigris presign my-bucket/image.png --format json
tigris presign my-bucket/data.csv --access-key tid_AaBb
```

### `tigris cp` (copy)

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

### `tigris mv` (move)

Move (rename) objects within Tigris. Both source and destination must be remote t3:// paths

```
tigris mv <src> <dest> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --recursive` | Move directories recursively |
| `-f, --force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris mv t3://my-bucket/old.txt t3://my-bucket/new.txt -f
tigris mv t3://my-bucket/old-dir/ t3://my-bucket/new-dir/ -rf
tigris mv my-bucket/a.txt my-bucket/b.txt -f
```

### `tigris rm` (remove)

Remove a bucket, folder, or object from Tigris. A bare bucket name deletes the bucket itself

```
tigris rm <path> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --recursive` | Remove directories recursively |
| `-f, --force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris rm t3://my-bucket/file.txt -f
tigris rm t3://my-bucket/folder/ -rf
tigris rm t3://my-bucket -f
tigris rm "t3://my-bucket/logs/*.tmp" -f
```

### `tigris bundle`

Download multiple objects as a streaming tar archive in a single request. Designed for batch workloads that need many objects without per-object HTTP overhead

```
tigris bundle <bucket> [flags]
```

| Flag | Description |
|------|-------------|
| `-k, --keys` | Comma-separated object keys, or path to a file with one key per line. If a local file matching the value exists, it is read as a keys file. If omitted, reads keys from stdin |
| `-o, --output` | Output file path. Defaults to stdout (for piping) |
| `--compression` | Compression algorithm for the archive. Auto-detected from output file extension when not specified |
| `--on-error` | How to handle missing objects. 'skip' omits them, 'fail' aborts the request (default: skip) |

**Examples:**
```bash
tigris bundle my-bucket --keys key1.jpg,key2.jpg --output archive.tar
tigris bundle my-bucket --keys keys.txt --output archive.tar
tigris bundle t3://my-bucket --keys keys.txt --compression gzip -o archive.tar.gz
cat keys.txt | tigris bundle my-bucket > archive.tar
```

### `tigris organizations` (orgs)

List, create, and switch between organizations. An organization is a workspace that contains your resources like buckets and access keys

| Command | Description |
|---------|-------------|
| `tigris organizations list` (l) | List all organizations you belong to and interactively select one as active |
| `tigris organizations create` (c) | Create a new organization with the given name |
| `tigris organizations select` (s) | Set the named organization as your active org for all subsequent commands |

#### `tigris organizations list` (l)

List all organizations you belong to and interactively select one as active

```
tigris organizations list [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: select) |
| `-i, --select` | Interactive selection mode |

**Examples:**
```bash
tigris orgs list
tigris orgs list --format json
```

#### `tigris organizations create` (c)

Create a new organization with the given name

```
tigris organizations create <name>
```

**Examples:**
```bash
tigris orgs create my-org
```

#### `tigris organizations select` (s)

Set the named organization as your active org for all subsequent commands

```
tigris organizations select <name>
```

**Examples:**
```bash
tigris orgs select my-org
```

### `tigris buckets` (b)

Create, inspect, update, and delete buckets. Buckets are top-level containers that hold objects

| Command | Description |
|---------|-------------|
| `tigris buckets list` (l) | List all buckets in the current organization |
| `tigris buckets create` (c) | Create a new bucket with optional access, tier, and location settings |
| `tigris buckets get` (g) | Show details for a bucket including access level, region, tier, and custom domain |
| `tigris buckets delete` (d) | Delete one or more buckets by name. The bucket must be empty or delete-protection must be off |
| `tigris buckets set` (s) | Update settings on an existing bucket such as access level, location, caching, or custom domain |
| `tigris buckets set-locations` | Set the data locations for a bucket |
| `tigris buckets set-migration` | Configure data migration from an external S3-compatible source bucket. Tigris will pull objects on demand from the source |
| `tigris buckets migrate` | Actively migrate all objects from a shadow bucket to Tigris by scheduling server-side migration for unmigrated objects |
| `tigris buckets lifecycle` (lc) | Manage bucket lifecycle rules. Each rule combines an optional storage-class transition and/or expiration (TTL), scoped to an optional key prefix |
| `tigris buckets set-notifications` | Configure object event notifications on a bucket. Sends webhook requests to a URL when objects are created, updated, or deleted |
| `tigris buckets set-cors` | Configure CORS rules on a bucket. Each invocation adds a rule unless --override or --reset is used |

#### `tigris buckets list` (l)

List all buckets in the current organization

```
tigris buckets list [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `--forks-of` | Only list buckets that are forks of the named source bucket |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |

**Examples:**
```bash
tigris buckets list
tigris buckets list --format json
tigris buckets list --forks-of my-bucket
```

#### `tigris buckets create` (c)

Create a new bucket with optional access, tier, and location settings

```
tigris buckets create [name] [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (default: private) |
| `--public` | Shorthand for --access public |
| `-s, --enable-snapshots` | Enable snapshots for the bucket (default: false) |
| `-t, --default-tier` | Choose the default tier for the bucket (default: STANDARD) |
| `-l, --locations` | Location for the bucket (default: global) |
| `-fork, --fork-of` | Create this bucket as a fork (copy-on-write clone) of the named source bucket |
| `-source-snap, --source-snapshot` | Fork from a specific snapshot of the source bucket. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464). Requires --fork-of |

**Examples:**
```bash
tigris buckets create my-bucket
tigris buckets create my-bucket --access public --locations iad
tigris buckets create my-bucket --enable-snapshots --default-tier STANDARD_IA
tigris buckets create my-fork --fork-of my-bucket
tigris buckets create my-fork --fork-of my-bucket --source-snapshot 1765889000501544464
```

#### `tigris buckets get` (g)

Show details for a bucket including access level, region, tier, and custom domain

```
tigris buckets get <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris buckets get my-bucket
```

#### `tigris buckets delete` (d)

Delete one or more buckets by name. The bucket must be empty or delete-protection must be off

```
tigris buckets delete <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris buckets delete my-bucket --yes
tigris buckets delete bucket-a,bucket-b --yes
```

#### `tigris buckets set` (s)

Update settings on an existing bucket such as access level, location, caching, or custom domain

```
tigris buckets set <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--access` | Bucket access level |
| `--locations` | Bucket location (see https://www.tigrisdata.com/docs/buckets/locations/ for more details) |
| `--allow-object-acl` | Enable object-level ACL |
| `--disable-directory-listing` | Disable directory listing |
| `--cache-control` | Default cache-control header value |
| `--custom-domain` | Custom domain for the bucket |
| `--enable-delete-protection` | Enable delete protection |
| `--enable-additional-headers` | Enable additional HTTP headers (X-Content-Type-Options nosniff) |

**Examples:**
```bash
tigris buckets set my-bucket --access public
tigris buckets set my-bucket --locations iad,fra --cache-control 'max-age=3600'
tigris buckets set my-bucket --custom-domain assets.example.com
```

#### `tigris buckets set-locations`

Set the data locations for a bucket

```
tigris buckets set-locations <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-l, --locations` | Bucket location |

**Examples:**
```bash
tigris buckets set-locations my-bucket --locations iad
tigris buckets set-locations my-bucket --locations iad,fra
tigris buckets set-locations my-bucket --locations global
```

#### `tigris buckets set-migration`

Configure data migration from an external S3-compatible source bucket. Tigris will pull objects on demand from the source

```
tigris buckets set-migration <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-b, --bucket` | Name of the source bucket to migrate from |
| `-e, --endpoint` | Endpoint URL of the source S3-compatible service |
| `-r, --region` | Region of the source bucket |
| `-key, --access-key` | Access key for the source bucket |
| `-secret, --secret-key` | Secret key for the source bucket |
| `--write-through` | Enable write-through mode (writes go to both source and Tigris) |
| `--disable` | Disable migration and clear all migration settings |

**Examples:**
```bash
tigris buckets set-migration my-bucket --bucket source-bucket --endpoint https://s3.amazonaws.com --region us-east-1 --access-key AKIA... --secret-key wJal...
tigris buckets set-migration my-bucket --bucket source-bucket --endpoint https://s3.amazonaws.com --region us-east-1 --access-key AKIA... --secret-key wJal... --write-through
tigris buckets set-migration my-bucket --disable
```

#### `tigris buckets migrate`

Actively migrate all objects from a shadow bucket to Tigris by scheduling server-side migration for unmigrated objects

```
tigris buckets migrate <path>
```

**Examples:**
```bash
tigris buckets migrate my-bucket
tigris buckets migrate my-bucket/images/
tigris buckets migrate t3://my-bucket/prefix/
```

#### `tigris buckets lifecycle` (lc)

Manage bucket lifecycle rules. Each rule combines an optional storage-class transition and/or expiration (TTL), scoped to an optional key prefix

| Command | Description |
|---------|-------------|
| `tigris buckets lifecycle list` (l) | List lifecycle rules on a bucket |
| `tigris buckets lifecycle create` (c) | Create a new lifecycle rule. A rule must include a transition (--storage-class with --days or --date) and/or an expiration (--expire-days or --expire-date), and may optionally be scoped via --prefix |
| `tigris buckets lifecycle edit` (e) | Edit an existing lifecycle rule by its id. Only specified fields are changed |

##### `tigris buckets lifecycle list` (l)

List lifecycle rules on a bucket

```
tigris buckets lifecycle list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris buckets lifecycle list my-bucket
tigris buckets lifecycle list my-bucket --json
```

##### `tigris buckets lifecycle create` (c)

Create a new lifecycle rule. A rule must include a transition (--storage-class with --days or --date) and/or an expiration (--expire-days or --expire-date), and may optionally be scoped via --prefix

```
tigris buckets lifecycle create <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Key prefix to scope the rule to. Omit for a bucket-wide rule |
| `-s, --storage-class` | Target storage class for the transition |
| `-d, --days` | Transition objects after this many days (used with --storage-class) |
| `--date` | Transition objects on this date (ISO-8601, e.g. 2026-06-01) (used with --storage-class) |
| `--expire-days` | Expire (delete) objects after this many days |
| `--expire-date` | Expire (delete) objects on this date (ISO-8601, e.g. 2026-06-01) |
| `--disable` | Create the rule in a disabled state |

**Examples:**
```bash
tigris buckets lifecycle create my-bucket --storage-class STANDARD_IA --days 30
tigris buckets lifecycle create my-bucket --prefix logs/ --storage-class GLACIER --days 90
tigris buckets lifecycle create my-bucket --prefix tmp/ --expire-days 7
tigris buckets lifecycle create my-bucket --prefix archive/ --storage-class GLACIER --days 30 --expire-days 365
```

##### `tigris buckets lifecycle edit` (e)

Edit an existing lifecycle rule by its id. Only specified fields are changed

```
tigris buckets lifecycle edit <name> <id> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Replace the rule's key prefix |
| `-s, --storage-class` | Replace the rule's transition target |
| `-d, --days` | Replace the rule's transition days |
| `--date` | Replace the rule's transition date (ISO-8601) |
| `--expire-days` | Replace the rule's expiration days |
| `--expire-date` | Replace the rule's expiration date (ISO-8601) |
| `--enable` | Enable the rule |
| `--disable` | Disable the rule (does not remove it) |

**Examples:**
```bash
tigris buckets lifecycle edit my-bucket abc123 --days 60
tigris buckets lifecycle edit my-bucket abc123 --expire-days 90
tigris buckets lifecycle edit my-bucket abc123 --enable
```

#### `tigris buckets set-notifications`

Configure object event notifications on a bucket. Sends webhook requests to a URL when objects are created, updated, or deleted

```
tigris buckets set-notifications <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-u, --url` | Webhook URL to send notifications to (must be http or https) |
| `-f, --filter` | SQL WHERE clause to filter events by key (e.g. WHERE `key` REGEXP "^images") |
| `-t, --token` | Token for webhook authentication |
| `--username` | Username for basic webhook authentication |
| `--password` | Password for basic webhook authentication |
| `--enable` | Enable notifications on the bucket (uses existing config) |
| `--disable` | Disable notifications on the bucket (preserves existing config) |
| `--reset` | Clear all notification settings on the bucket |

**Examples:**
```bash
tigris buckets set-notifications my-bucket --url https://example.com/webhook
tigris buckets set-notifications my-bucket --url https://example.com/webhook --token secret123
tigris buckets set-notifications my-bucket --url https://example.com/webhook --username admin --password secret
tigris buckets set-notifications my-bucket --url https://example.com/webhook --filter "WHERE `key` REGEXP \"^images\""
tigris buckets set-notifications my-bucket --enable
tigris buckets set-notifications my-bucket --disable
tigris buckets set-notifications my-bucket --reset
```

#### `tigris buckets set-cors`

Configure CORS rules on a bucket. Each invocation adds a rule unless --override or --reset is used

```
tigris buckets set-cors <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-o, --origins` | Allowed origins (comma-separated, or '*' for all) |
| `-m, --methods` | Allowed HTTP methods (comma-separated, e.g. GET,POST,PUT) |
| `--headers` | Allowed request headers (comma-separated, or '*' for all) |
| `--expose-headers` | Response headers to expose (comma-separated) |
| `--max-age` | Preflight cache duration in seconds (default: 3600) |
| `--override` | Replace all existing CORS rules instead of appending |
| `--reset` | Clear all CORS rules on the bucket |

**Examples:**
```bash
tigris buckets set-cors my-bucket --origins '*' --methods GET,HEAD
tigris buckets set-cors my-bucket --origins https://example.com --methods GET,POST --headers Content-Type,Authorization --max-age 3600
tigris buckets set-cors my-bucket --origins https://example.com --override
tigris buckets set-cors my-bucket --reset
```

### `tigris snapshots` (s)

List and take snapshots. A snapshot is a point-in-time, read-only copy of a bucket's state

| Command | Description |
|---------|-------------|
| `tigris snapshots list` (l) | List all snapshots for the given bucket, ordered by creation time |
| `tigris snapshots take` (t) | Take a new snapshot of the bucket's current state. Optionally provide a name for the snapshot |

#### `tigris snapshots list` (l)

List all snapshots for the given bucket, ordered by creation time

```
tigris snapshots list <name> [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |

**Examples:**
```bash
tigris snapshots list my-bucket
tigris snapshots list my-bucket --format json
```

#### `tigris snapshots take` (t)

Take a new snapshot of the bucket's current state. Optionally provide a name for the snapshot

```
tigris snapshots take <name> [snapshot-name]
```

**Examples:**
```bash
tigris snapshots take my-bucket
tigris snapshots take my-bucket my-snapshot
```

### `tigris objects` (o)

Low-level object operations for listing, downloading, uploading, and deleting individual objects in a bucket

| Command | Description |
|---------|-------------|
| `tigris objects list` (l) | List objects in a bucket, optionally filtered by a key prefix |
| `tigris objects list-versions` (lv) | List object versions and delete markers in a bucket (requires bucket versioning). Returns both arrays separately to match the S3 ListObjectVersions response |
| `tigris objects get` (g) | Download an object by key. Prints to stdout by default, or saves to a file with --output |
| `tigris objects put` (p) | Upload a local file as an object. Content-type is auto-detected from extension unless overridden |
| `tigris objects delete` (d) | Delete one or more objects by key from the given bucket. On a versioned bucket, the default creates a delete marker; use --version-id or --all-versions to hard-delete versions |
| `tigris objects set` (s) | (Deprecated) Update settings on an existing object such as access level. Use `tigris objects set-access` for ACL changes and `tigris mv` to rename |
| `tigris objects set-access` (sa) | Set the access level (public or private) on an existing object |
| `tigris objects info` (i) | Show metadata for an object (content type, size, modified date) |

#### `tigris objects list` (l)

List objects in a bucket, optionally filtered by a key prefix

```
tigris objects list <bucket> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Filter objects by key prefix (e.g. "images/" to list only images) |
| `--format` | Output format (default: table) |
| `-snapshot, --snapshot-version` | Read from a specific bucket snapshot. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |
| `--source` | List objects from a specific storage source on buckets with shadow migration enabled |

**Examples:**
```bash
tigris objects list my-bucket
tigris objects list t3://my-bucket
tigris objects list t3://my-bucket/images/
tigris objects list my-bucket --prefix images/
tigris objects list my-bucket --format json
```

#### `tigris objects list-versions` (lv)

List object versions and delete markers in a bucket (requires bucket versioning). Returns both arrays separately to match the S3 ListObjectVersions response

```
tigris objects list-versions <bucket> [flags]
```

| Flag | Description |
|------|-------------|
| `-p, --prefix` | Filter by key prefix |
| `-d, --delimiter` | Group keys sharing a common prefix up to the delimiter (e.g. "/" for folder-style grouping) |
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `--key-marker` | Pagination marker — the key to start listing from (from a prior nextKeyMarker) |
| `--version-id-marker` | Pagination marker — the version id to start listing from (from a prior nextVersionIdMarker) |

**Examples:**
```bash
tigris objects list-versions my-bucket
tigris objects list-versions t3://my-bucket/logs/
tigris objects list-versions my-bucket --prefix images/
tigris objects list-versions my-bucket --format json
```

#### `tigris objects get` (g)

Download an object by key. Prints to stdout by default, or saves to a file with --output

```
tigris objects get <bucket> [key] [flags]
```

| Flag | Description |
|------|-------------|
| `-o, --output` | Output file path (if not specified, prints to stdout) |
| `-m, --mode` | Response mode: "string" loads into memory, "stream" writes in chunks (auto-detected from extension if not specified) |
| `-snapshot, --snapshot-version` | Read from a specific bucket snapshot. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp (e.g. 1765889000501544464) |
| `--version-id` | Object version id to download (requires bucket versioning). Omit to download the latest version |

**Examples:**
```bash
tigris objects get my-bucket config.json
tigris objects get t3://my-bucket/config.json
tigris objects get my-bucket archive.zip --output ./archive.zip --mode stream
```

#### `tigris objects put` (p)

Upload a local file as an object. Content-type is auto-detected from extension unless overridden

```
tigris objects put <bucket> [key] [file] [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level (default: private) |
| `-t, --content-type` | Content type (auto-detected from extension if omitted) |
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris objects put my-bucket report.pdf ./report.pdf
tigris objects put t3://my-bucket/report.pdf ./report.pdf
tigris objects put my-bucket logo.png ./logo.png --access public --content-type image/png
```

#### `tigris objects delete` (d)

Delete one or more objects by key from the given bucket. On a versioned bucket, the default creates a delete marker; use --version-id or --all-versions to hard-delete versions

```
tigris objects delete <bucket> [key] [flags]
```

| Flag | Description |
|------|-------------|
| `--version-id` | Hard-delete a specific object version (requires bucket versioning). Targets a single key |
| `--all-versions` | Hard-delete every version and delete marker for the given key(s). Mutually exclusive with --version-id |
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris objects delete my-bucket old-file.txt --yes
tigris objects delete t3://my-bucket/old-file.txt --yes
tigris objects delete my-bucket file-a.txt,file-b.txt --yes
tigris objects delete my-bucket old-file.txt --version-id abc123 --yes
tigris objects delete my-bucket old-file.txt --all-versions --yes
```

#### `tigris objects set` (s)

(Deprecated) Update settings on an existing object such as access level. Use `tigris objects set-access` for ACL changes and `tigris mv` to rename

```
tigris objects set <bucket> [key] [flags]
```

| Flag | Description |
|------|-------------|
| `-a, --access` | Access level |
| `-n, --new-key` | Rename the object to a new key |

**Examples:**
```bash
tigris objects set my-bucket my-file.txt --access public
tigris objects set t3://my-bucket/my-file.txt --access public
tigris objects set my-bucket my-file.txt --access private
```

#### `tigris objects set-access` (sa)

Set the access level (public or private) on an existing object

```
tigris objects set-access <bucket> [key] [access] [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris objects set-access my-bucket my-file.txt public
tigris objects set-access t3://my-bucket/my-file.txt private
```

#### `tigris objects info` (i)

Show metadata for an object (content type, size, modified date)

```
tigris objects info <bucket> [key] [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `-snapshot, --snapshot-version` | Read from a specific bucket snapshot |
| `--version-id` | Object version id (requires bucket versioning). Omit to read the latest version |

**Examples:**
```bash
tigris objects info my-bucket report.pdf
tigris objects info t3://my-bucket/report.pdf
tigris objects info my-bucket report.pdf --format json
tigris objects info my-bucket report.pdf --version-id abc123
```

### `tigris access-keys` (keys)

Create, list, inspect, delete, and assign roles to access keys. Access keys are credentials used for programmatic API access

| Command | Description |
|---------|-------------|
| `tigris access-keys list` (l) | List all access keys in the current organization |
| `tigris access-keys create` (c) | Create a new access key with the given name. Returns the key ID and secret (shown only once) |
| `tigris access-keys delete` (d) | Permanently delete an access key by its ID. This revokes all access immediately |
| `tigris access-keys get` (g) | Show details for an access key including its name, creation date, and assigned bucket roles |
| `tigris access-keys assign` (a) | Assign per-bucket roles to an access key. Pair each --bucket with a --role (Editor or ReadOnly), or use --admin for org-wide access |
| `tigris access-keys rotate` (r) | Rotate an access key's secret. The current secret is immediately invalidated and a new one is returned (shown only once) |
| `tigris access-keys attach-policy` (ap) | Attach an IAM policy to an access key. If no policy ARN is provided, shows interactive selection of available policies |
| `tigris access-keys detach-policy` (dp) | Detach an IAM policy from an access key. If no policy ARN is provided, shows interactive selection of attached policies |
| `tigris access-keys list-policies` (lp) | List all IAM policies attached to an access key |

#### `tigris access-keys list` (l)

List all access keys in the current organization

```
tigris access-keys list [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |

**Examples:**
```bash
tigris access-keys list
```

#### `tigris access-keys create` (c)

Create a new access key with the given name. Returns the key ID and secret (shown only once)

```
tigris access-keys create <name>
```

**Examples:**
```bash
tigris access-keys create my-ci-key
```

#### `tigris access-keys delete` (d)

Permanently delete an access key by its ID. This revokes all access immediately

```
tigris access-keys delete <id> [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris access-keys delete tid_AaBbCcDdEeFf --yes
```

#### `tigris access-keys get` (g)

Show details for an access key including its name, creation date, and assigned bucket roles

```
tigris access-keys get <id>
```

**Examples:**
```bash
tigris access-keys get tid_AaBbCcDdEeFf
```

#### `tigris access-keys assign` (a)

Assign per-bucket roles to an access key. Pair each --bucket with a --role (Editor or ReadOnly), or use --admin for org-wide access

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

#### `tigris access-keys rotate` (r)

Rotate an access key's secret. The current secret is immediately invalidated and a new one is returned (shown only once)

```
tigris access-keys rotate <id> [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris access-keys rotate tid_AaBbCcDdEeFf --yes
```

#### `tigris access-keys attach-policy` (ap)

Attach an IAM policy to an access key. If no policy ARN is provided, shows interactive selection of available policies

```
tigris access-keys attach-policy <id> [flags]
```

| Flag | Description |
|------|-------------|
| `--policy-arn` | ARN of the policy to attach |

**Examples:**
```bash
tigris access-keys attach-policy tid_AaBb --policy-arn arn:aws:iam::org_id:policy/my-policy
tigris access-keys attach-policy tid_AaBb
```

#### `tigris access-keys detach-policy` (dp)

Detach an IAM policy from an access key. If no policy ARN is provided, shows interactive selection of attached policies

```
tigris access-keys detach-policy <id> [flags]
```

| Flag | Description |
|------|-------------|
| `--policy-arn` | ARN of the policy to detach |
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris access-keys detach-policy tid_AaBb --policy-arn arn:aws:iam::org_id:policy/my-policy --yes
tigris access-keys detach-policy tid_AaBb
```

#### `tigris access-keys list-policies` (lp)

List all IAM policies attached to an access key

```
tigris access-keys list-policies <id> [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |

**Examples:**
```bash
tigris access-keys list-policies tid_AaBbCcDdEeFf
```

### `tigris iam`

Identity and Access Management - manage policies, users, and permissions

| Command | Description |
|---------|-------------|
| `tigris iam policies` (p) | Manage IAM policies. Policies define permissions for access keys |
| `tigris iam users` (u) | Manage organization users and invitations |

#### `tigris iam policies` (p)

Manage IAM policies. Policies define permissions for access keys

| Command | Description |
|---------|-------------|
| `tigris iam policies list` (l) | List all policies in the current organization |
| `tigris iam policies get` (g) | Show details for a policy including its document and attached users. If no ARN provided, shows interactive selection |
| `tigris iam policies create` (c) | Create a new policy with the given name and policy document. Document can be provided via file, inline JSON, or stdin |
| `tigris iam policies edit` (e) | Update an existing policy's document. Document can be provided via file, inline JSON, or stdin. If no ARN provided, shows interactive selection |
| `tigris iam policies delete` (d) | Delete a policy. If no ARN provided, shows interactive selection |
| `tigris iam policies link-key` (lnk) | Link an access key to a policy. If no policy ARN is provided, shows interactive selection. If no access key ID is provided, shows interactive selection of unlinked keys |
| `tigris iam policies unlink-key` (ulnk) | Unlink an access key from a policy. If no policy ARN is provided, shows interactive selection. If no access key ID is provided, shows interactive selection of linked keys |
| `tigris iam policies list-keys` (lk) | List all access keys attached to a policy. If no policy ARN is provided, shows interactive selection |

##### `tigris iam policies list` (l)

List all policies in the current organization

```
tigris iam policies list [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |
| `--limit` | Maximum number of items to return per page |
| `-pt, --page-token` | Pagination token from a previous request to fetch the next page |

**Examples:**
```bash
tigris iam policies list
```

##### `tigris iam policies get` (g)

Show details for a policy including its document and attached users. If no ARN provided, shows interactive selection

```
tigris iam policies get [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris iam policies get
tigris iam policies get arn:aws:iam::org_id:policy/my-policy
```

##### `tigris iam policies create` (c)

Create a new policy with the given name and policy document. Document can be provided via file, inline JSON, or stdin

```
tigris iam policies create <name> [flags]
```

| Flag | Description |
|------|-------------|
| `-d, --document` | Policy document (JSON file path or inline JSON). If omitted, reads from stdin |
| `--description` | Policy description |

**Examples:**
```bash
tigris iam policies create my-policy --document policy.json
tigris iam policies create my-policy --document '{"Version":"2012-10-17","Statement":[...]}'
cat policy.json | tigris iam policies create my-policy
```

##### `tigris iam policies edit` (e)

Update an existing policy's document. Document can be provided via file, inline JSON, or stdin. If no ARN provided, shows interactive selection

```
tigris iam policies edit [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `-d, --document` | New policy document (JSON file path or inline JSON). If omitted, reads from stdin |
| `--description` | Update policy description |

**Examples:**
```bash
tigris iam policies edit --document policy.json
tigris iam policies edit arn:aws:iam::org_id:policy/my-policy --document policy.json
cat policy.json | tigris iam policies edit arn:aws:iam::org_id:policy/my-policy
```

##### `tigris iam policies delete` (d)

Delete a policy. If no ARN provided, shows interactive selection

```
tigris iam policies delete [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris iam policies delete
tigris iam policies delete arn:aws:iam::org_id:policy/my-policy --yes
```

##### `tigris iam policies link-key` (lnk)

Link an access key to a policy. If no policy ARN is provided, shows interactive selection. If no access key ID is provided, shows interactive selection of unlinked keys

```
tigris iam policies link-key [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--id` | Access key ID to attach |

**Examples:**
```bash
tigris iam policies link-key arn:aws:iam::org_id:policy/my-policy --id tid_AaBb
tigris iam policies link-key
```

##### `tigris iam policies unlink-key` (ulnk)

Unlink an access key from a policy. If no policy ARN is provided, shows interactive selection. If no access key ID is provided, shows interactive selection of linked keys

```
tigris iam policies unlink-key [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--id` | Access key ID to detach |
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris iam policies unlink-key arn:aws:iam::org_id:policy/my-policy --id tid_AaBb --yes
tigris iam policies unlink-key
```

##### `tigris iam policies list-keys` (lk)

List all access keys attached to a policy. If no policy ARN is provided, shows interactive selection

```
tigris iam policies list-keys [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris iam policies list-keys arn:aws:iam::org_id:policy/my-policy
tigris iam policies list-keys
```

#### `tigris iam users` (u)

Manage organization users and invitations

| Command | Description |
|---------|-------------|
| `tigris iam users list` (l) | List all users and pending invitations in the organization |
| `tigris iam users invite` (i) | Invite users to the organization by email |
| `tigris iam users revoke-invitation` (ri) | Revoke pending invitations. If no invitation ID provided, shows interactive selection |
| `tigris iam users update-role` (ur) | Update user roles in the organization. If no user ID provided, shows interactive selection |
| `tigris iam users remove` (rm) | Remove users from the organization. If no user ID provided, shows interactive selection |

##### `tigris iam users list` (l)

List all users and pending invitations in the organization

```
tigris iam users list [flags]
```

| Flag | Description |
|------|-------------|
| `--format` | Output format (default: table) |

**Examples:**
```bash
tigris iam users list
tigris iam users list --format json
```

##### `tigris iam users invite` (i)

Invite users to the organization by email

```
tigris iam users invite <email> [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --role` | Role to assign to the invited user(s) (default: member) |

**Examples:**
```bash
tigris iam users invite user@example.com
tigris iam users invite user@example.com --role admin
tigris iam users invite user1@example.com,user2@example.com
```

##### `tigris iam users revoke-invitation` (ri)

Revoke pending invitations. If no invitation ID provided, shows interactive selection

```
tigris iam users revoke-invitation [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris iam users revoke-invitation
tigris iam users revoke-invitation invitation_id --yes
tigris iam users revoke-invitation id1,id2,id3 --yes
```

##### `tigris iam users update-role` (ur)

Update user roles in the organization. If no user ID provided, shows interactive selection

```
tigris iam users update-role [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `-r, --role` | Role(s) to assign (comma-separated). Each role pairs with the corresponding user ID. If one role is given, it applies to all users |

**Examples:**
```bash
tigris iam users update-role --role admin
tigris iam users update-role user_id --role member
tigris iam users update-role id1,id2 --role admin
tigris iam users update-role id1,id2 --role admin,member
```

##### `tigris iam users remove` (rm)

Remove users from the organization. If no user ID provided, shows interactive selection

```
tigris iam users remove [resource] [flags]
```

| Flag | Description |
|------|-------------|
| `--force` | Skip confirmation prompts (alias for --yes) |

**Examples:**
```bash
tigris iam users remove
tigris iam users remove user@example.com --yes
tigris iam users remove user@example.com,user@example.net --yes
```

## License

MIT
