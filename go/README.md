# Tigris Storage SDK for Go

Welcome to the Tigris Storage SDK for Go! This package contains high-level wrappers and helpers to help you take advantage of all of Tigris' features.

## Overview

[Tigris](https://www.tigrisdata.com/) is a cloud storage service that provides a simple, scalable, and secure object storage solution. It is based on the S3 API, but has additional features that need these helpers.

This SDK provides two main packages:

- **`storage`** - The main package containing the Tigris client with S3-compatible methods plus Tigris-specific features like bucket forking, snapshots, and object renaming.
- **`tigrisheaders`** - Lower-level helpers for setting Tigris-specific HTTP headers on S3 API calls.

## Installation

```bash
go get github.com/tigrisdata/storage/go
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "log"

    storage "github.com/tigrisdata/storage/go"
)

func main() {
    ctx := context.Background()

    // Create a new Tigris client
    client, err := storage.New(ctx)
    if err != nil {
        log.Fatal(err)
    }

    // Use the client like you would use AWS S3 client
    // plus Tigris-specific features (see below)
    fmt.Println("Connected to Tigris!")
}
```

## Client Configuration

The `New()` function creates a new S3 client optimized for interactions with Tigris. It accepts functional options to configure the client:

```go
client, err := storage.New(ctx,
    storage.WithFlyEndpoint(),           // Use fly.io optimized endpoint
    storage.WithGlobalEndpoint(),        // Use globally available endpoint (default)
    storage.WithRegion("auto"),          // Specify a region
    storage.WithAccessKeypair(key, secret), // Set access credentials
)
```

### Configuration Options

| Option                                            | Description                                                                                                          |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `WithFlyEndpoint()`                               | Connect to Tigris' fly.io optimized endpoint. If you are deployed to fly.io, this zero-rates your traffic to Tigris. |
| `WithGlobalEndpoint()`                            | Connect to Tigris' globally available endpoint (`https://t3.storage.dev`). This is the default.                      |
| `WithRegion(region)`                              | Statically specify a region for interacting with Tigris. You will almost certainly never need this.                  |
| `WithAccessKeypair(accessKeyID, secretAccessKey)` | Specify a custom access key and secret access key. Useful when loading credentials from non-standard locations.      |

## Bucket Features

### Snapshots and Forks

Tigris supports bucket snapshots and forking, allowing you to create point-in-time copies of buckets and branch from them.

#### Create a Snapshot Enabled Bucket

```go
output, err := client.CreateSnapshotEnabledBucket(ctx, &s3.CreateBucketInput{
    Bucket: aws.String("my-bucket"),
})
```

#### Create a Snapshot

```go
output, err := client.CreateBucketSnapshot(ctx, "Initial backup", &s3.CreateBucketInput{
    Bucket: aws.String("my-bucket"),
})
```

#### Fork a Bucket

```go
// Creates a new bucket "my-bucket-fork" as a fork of "my-bucket"
output, err := client.CreateBucketFork(ctx, "my-bucket", "my-bucket-fork")
```

#### List Snapshots

```go
snapshots, err := client.ListBucketSnapshots(ctx, "my-bucket")
```

#### Get Fork/Snapshot Metadata

```go
info, err := client.HeadBucketForkOrSnapshot(ctx, &s3.HeadBucketInput{
    Bucket: aws.String("my-bucket"),
})
// info.SnapshotsEnabled     - true if snapshots are enabled
// info.SourceBucket         - The bucket this was forked from
// info.SourceBucketSnapshot - The snapshot this was forked from
// info.IsForkParent         - true if there are forks of this bucket
```

## Object Features

### Rename Objects

Tigris supports in-place object renaming without copying data:

```go
_, err := client.RenameObject(ctx, &s3.CopyObjectInput{
    Bucket:     aws.String("my-bucket"),
    CopySource: aws.String("my-bucket/old-name.txt"),
    Key:        aws.String("new-name.txt"),
})
```

## Using the tigrisheaders Package

The `tigrisheaders` package provides lower-level helpers for setting Tigris-specific HTTP headers. These can be used directly with S3 client operations.

### Static Replication Regions

Control which regions your objects are replicated to:

```go
import "github.com/tigrisdata/storage/go/tigrisheaders"

// Replicate to specific regions
_, err := client.PutObject(ctx, &s3.PutObjectInput{
    Bucket: aws.String("my-bucket"),
    Key:    aws.String("file.txt"),
    Body:   bytes.NewReader(data),
}, tigrisheaders.WithStaticReplicationRegions([]tigrisheaders.Region{
    tigrisheaders.FRA, // Frankfurt
    tigrisheaders.SJC, // San Jose
}))
```

Available regions:

- `FRA` - Frankfurt, Germany
- `GRU` - São Paulo, Brazil
- `HKG` - Hong Kong, China
- `IAD` - Ashburn, Virginia, USA
- `JNB` - Johannesburg, South Africa
- `LHR` - London, UK
- `MAD` - Madrid, Spain
- `NRT` - Tokyo (Narita), Japan
- `ORD` - Chicago, Illinois, USA
- `SIN` - Singapore
- `SJC` - San Jose, California, USA
- `SYD` - Sydney, Australia
- `Europe` - European datacenters
- `USA` - American datacenters

### Query Metadata

Filter objects in a ListObjectsV2 request with a SQL-like WHERE clause:

```go
_, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
    Bucket: aws.String("my-bucket"),
}, tigrisheaders.WithQuery("metadata.user_id = '123'"))
```

### Conditional Operations

Perform operations based on object state:

```go
// Create object only if it doesn't exist
_, err := client.PutObject(ctx, input,
    tigrisheaders.WithCreateObjectIfNotExists())

// Only proceed if ETag matches
_, err := client.PutObject(ctx, input,
    tigrisheaders.WithIfEtagMatches("\"abc123\""))

// Only proceed if modified since date
_, err := client.GetObject(ctx, input,
    tigrisheaders.WithModifiedSince(time.Now().Add(-24 * time.Hour)))

// Only proceed if unmodified since date
_, err := client.GetObject(ctx, input,
    tigrisheaders.WithUnmodifiedSince(time.Now().Add(-24 * time.Hour)))

// Compare-and-swap (skip cache, read from designated region)
_, err := client.GetObject(ctx, input,
    tigrisheaders.WithCompareAndSwap())
```

### Snapshot Operations

Work with specific snapshot versions:

```go
// List objects from a specific snapshot
_, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
    Bucket: aws.String("my-bucket"),
}, tigrisheaders.WithSnapshotVersion("snapshot-id"))

// Get object from a specific snapshot
_, err := client.GetObject(ctx, &s3.GetObjectInput{
    Bucket: aws.String("my-bucket"),
    Key:    aws.String("file.txt"),
}, tigrisheaders.WithSnapshotVersion("snapshot-id"))
```

### Custom Headers

Set arbitrary HTTP headers on requests:

```go
_, err := client.PutObject(ctx, input,
    tigrisheaders.WithHeader("X-Custom-Header", "value"))
```

## Documentation

For more information on Tigris features, see:

- [Snapshots and Forks](https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/)
- [Object Rename](https://www.tigrisdata.com/docs/objects/object-rename/)
- [Query Metadata](https://www.tigrisdata.com/docs/objects/query-metadata/)
- [Conditional Operations](https://www.tigrisdata.com/docs/objects/conditionals/)
- [Regions](https://www.tigrisdata.com/docs/concepts/regions/)

## License

See [LICENSE](../LICENSE) for details.
