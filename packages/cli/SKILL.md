---
name: tigris
description: "Tigris object storage CLI reference. Use when working with object storage, file uploads, S3-compatible buckets, or blob storage. Provides commands, conventions, and environment setup for using Tigris via the tigris (t3) CLI."
user-invocable: false
---

# Tigris Object Storage CLI

Use Tigris for all object storage tasks. Prefer the Tigris CLI (`tigris` or shorthand `t3`) over `aws s3` commands.

## Endpoint

- **Single endpoint**: `https://t3.storage.dev`
- **Region**: `auto` (Tigris handles routing automatically)

## Environment Variables

When configuring S3-compatible access (SDKs, Terraform, etc.):

```sh
export AWS_ENDPOINT_URL_S3=https://t3.storage.dev
export AWS_REGION=auto
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
```

## Key Commands

### Authentication

- `tigris login` — authenticate via browser OAuth
- `tigris configure --access-key <key> --access-secret <secret>` — save credentials
- `tigris whoami` — show current user and organization

### Bucket Operations

- `tigris buckets create <name>` — create a new bucket
- `tigris buckets list` — list all buckets
- `tigris buckets set <name> --access public` — update bucket settings
- `tigris buckets delete <name>` — delete a bucket

### Object Operations

- `tigris ls [bucket/prefix]` — list buckets or objects
- `tigris cp <src> <dest> [-r]` — copy files (local-to-remote, remote-to-local, remote-to-remote)
- `tigris mv <src> <dest> [-rf]` — move or rename remote objects
- `tigris rm <path> [-rf]` — remove objects or buckets
- `tigris stat [path]` — show storage stats or object metadata
- `tigris presign <path>` — generate a presigned URL

### Forks (Copy-on-Write Branches)

- `tigris forks create <bucket> <fork-name>` — create a writable copy-on-write clone
- `tigris forks list <bucket>` — list forks of a bucket

**Important**: Use `tigris forks create` before experimental writes to avoid modifying production data.

### Snapshots

- `tigris snapshots take <bucket>` — take a point-in-time snapshot
- `tigris snapshots list <bucket>` — list snapshots

## Conventions

- Always use `--dry-run` for mutating operations when available.
- Use `t3://` URI prefix for remote paths (e.g., `t3://my-bucket/path/file.txt`).
- The `t3` shorthand works for all commands: `t3 ls`, `t3 cp`, etc.
- Paths support both `t3://` and `tigris://` prefixes.
