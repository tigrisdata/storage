# Tigris Storage SDK

Tigris is a globally distributed object storage service that provides low latency anywhere in the world, enabling developers to store and access any amount of data for a wide range of use cases.

This monorepo contains multiple JavaScript/TypeScript packages for Tigris object storage:

- [`@tigrisdata/storage`](./packages/storage) - Tigris Storage SDK
- [`@tigrisdata/keyv-tigris`](./packages/keyv-tigris) - Tigris adapter for [Keyv](https://keyv.org/)
- [`@tigrisdata/react`](./packages/react) - Ready to use React Components and Hooks

## Go SDK

The Go SDK is maintained in a separate repository:

- Repository: [https://github.com/tigrisdata/storage-go](https://github.com/tigrisdata/storage-go)
- Documentation: [https://pkg.go.dev/github.com/tigrisdata/storage-go](https://pkg.go.dev/github.com/tigrisdata/storage-go)

Install with:

```sh
go get github.com/tigrisdata/storage-go
```

See the documentation for examples and quickstart advice.
