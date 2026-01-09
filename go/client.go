package storage

import (
	"context"
	"fmt"
	"net/http"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/middleware"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/tigrisdata/storage/go/tigrisheaders"
)

// Client is a wrapper around the AWS SDK S3 Client with additional methods for integration with Tigris.
type Client struct {
	*s3.Client
}

// CreateBucketFork creates a fork of the source bucket named target.
func (c *Client) CreateBucketFork(ctx context.Context, source, target string, opts ...func(*s3.Options)) (*s3.CreateBucketOutput, error) {
	opts = append(opts, tigrisheaders.WithHeader("X-Tigris-Fork-Source-Bucket", source))

	return c.Client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(target),
	}, opts...)
}

// CreateBucketSnapshot creates a snapshot with the given description for a bucket.
func (c *Client) CreateBucketSnapshot(ctx context.Context, description string, in *s3.CreateBucketInput, opts ...func(*s3.Options)) (*s3.CreateBucketOutput, error) {
	opts = append(opts, tigrisheaders.WithTakeSnapshot(description))

	return c.Client.CreateBucket(ctx, in, opts...)
}

// CreateSnapshottableBucket creates a new bucket with the ability to take snapshots and fork the contents of it.
func (c *Client) CreateSnapshottableBucket(ctx context.Context, in *s3.CreateBucketInput, opts ...func(*s3.Options)) (*s3.CreateBucketOutput, error) {
	opts = append(opts, tigrisheaders.WithEnableSnapshot())

	return c.Client.CreateBucket(ctx, in, opts...)
}

// HeadBucketForkOrSnapshotOutput records the fork/snapshot metadata for a bucket.
type HeadBucketForkOrSnapshotOutput struct {
	SnapshotsEnabled     bool   // true if snapshots are enabled, otherwise false.
	SourceBucket         string // The name of the bucket this bucket was forked from.
	SourceBucketSnapshot string // The snapshot this bucket was forked from.
	IsForkParent         bool   // true if there are forks of this bucket, otherwise false.
}

// HeadBucketForkOrSnapshot fetches the fork/snapshot metadata for a bucket.
//
// For more information, see the Tigris documentation[1].
//
// [1]: https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/#retrieving-snapshot-and-fork-info-for-a-bucket
func (c *Client) HeadBucketForkOrSnapshot(ctx context.Context, in *s3.HeadBucketInput, opts ...func(*s3.Options)) (*HeadBucketForkOrSnapshotOutput, error) {
	resp, err := c.Client.HeadBucket(ctx, in, opts...)
	if err != nil {
		return nil, err
	}

	rawResp, ok := middleware.GetRawResponse(resp.ResultMetadata).(*http.Response)
	if !ok {
		return nil, fmt.Errorf("unexpected response type from middleware")
	}
	return &HeadBucketForkOrSnapshotOutput{
		SnapshotsEnabled:     rawResp.Header.Get("X-Tigris-Enable-Snapshot") == "true",
		SourceBucket:         rawResp.Header.Get("X-Tigris-Fork-Source-Bucket"),
		SourceBucketSnapshot: rawResp.Header.Get("X-Tigris-Fork-Source-Bucket-Snapshot"),
		IsForkParent:         rawResp.Header.Get("X-Tigris-Is-Fork-Parent") == "true",
	}, nil
}

// ListBucketSnapshots lists the snapshots for a bucket.
//
// For more information, see the Tigris documentation[1].
//
// [1]: https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/#listing-snapshots
func (c *Client) ListBucketSnapshots(ctx context.Context, bucketName string, opts ...func(*s3.Options)) (*s3.ListBucketsOutput, error) {
	opts = append(opts, tigrisheaders.WithHeader("X-Tigris-Snapshot", bucketName))

	return c.Client.ListBuckets(ctx, &s3.ListBucketsInput{}, opts...)
}

// RenameObject performs an in-place rename of objects instead of copying the data.
//
// For more information, see the Tigris documentation[1].
//
// [1]: https://www.tigrisdata.com/docs/objects/object-rename/
func (c *Client) RenameObject(ctx context.Context, in *s3.CopyObjectInput, opts ...func(*s3.Options)) (*s3.CopyObjectOutput, error) {
	opts = append(opts, tigrisheaders.WithRename())

	return c.Client.CopyObject(ctx, in, opts...)
}
