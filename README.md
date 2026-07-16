# Tigris Storage SDKs

Tigris is a globally distributed object storage service that provides low latency anywhere in the world, enabling developers to store and access any amount of data for a wide range of use cases.

## JavaScript/TypeScript SDK

This monorepo contains multiple JavaScript/TypeScript packages for Tigris object storage:

- [`@tigrisdata/storage`](./packages/storage) - Tigris Storage SDK
- [`@tigrisdata/iam`](./packages/iam) - Tigris IAM SDK
- [`@tigrisdata/cli`](./packages/cli) - Command line interface for Tigris object storage
- [`@tigrisdata/agent-kit`](./packages/agent-kit) - Composed workflows for AI agents (sandboxes, workspaces, checkpoints, coordination)
- [`@tigrisdata/keyv-tigris`](./packages/keyv-tigris) - Tigris adapter for [Keyv](https://keyv.org/)
- [`@tigrisdata/react`](./packages/react) - Ready to use React Components and Hooks
- [`@tigrisdata/agent-shell`](./packages/agent-shell) - A virtual bash environment for AI agents, backed by Tigris object storage

### Apps

Non-published apps live in [`apps/`](./apps):

- [`agent-shell-playground`](./apps/agent-shell-playground) - Vite playground for `@tigrisdata/agent-shell`

## Go SDK

The Go SDK is maintained in a separate repository:

- Repository: [https://github.com/tigrisdata/storage-go](https://github.com/tigrisdata/storage-go)
- Documentation: [https://pkg.go.dev/github.com/tigrisdata/storage-go](https://pkg.go.dev/github.com/tigrisdata/storage-go)

Install with:

```sh
go get github.com/tigrisdata/storage-go
```

See the documentation for examples and quickstart advice.
