package simplestorage

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	storage "github.com/tigrisdata/storage/go"
)

type Client struct {
	cli     *storage.Client
	options Options
}

type ClientOption func(*ClientOptions)

func WithBucket(bucket string) ClientOption {
	return func(co *ClientOptions) {
		co.BucketName = bucket
	}
}

func WithS3Headers(opts ...func(*s3.Options)) ClientOption {
	return func(co *ClientOptions) {
		co.S3Headers = append(co.S3Headers, opts...)
	}
}

func WithStartAfter(startAfter string) ClientOption {
	return func(co *ClientOptions) {
		co.StartAfter = aws.String(startAfter)
	}
}

func WithMaxKeys(maxKeys int32) ClientOption {
	return func(co *ClientOptions) {
		co.MaxKeys = &maxKeys
	}
}

type ClientOptions struct {
	BucketName string
	S3Headers  []func(*s3.Options)

	// List options
	StartAfter *string
	MaxKeys    *int32
}

func (ClientOptions) defaults(o Options) ClientOptions {
	return ClientOptions{
		BucketName: o.BucketName,
	}
}

func New(ctx context.Context, options ...Option) (*Client, error) {
	o := new(Options).defaults()

	for _, doer := range options {
		doer(&o)
	}

	var storageOpts []storage.Option

	if o.BaseEndpoint != storage.GlobalEndpoint {
		storageOpts = append(storageOpts, storage.WithEndpoint(o.BaseEndpoint))
	}

	storageOpts = append(storageOpts, storage.WithRegion(o.Region))
	storageOpts = append(storageOpts, storage.WithPathStyle(o.UsePathStyle))

	if o.AccessKeyID != "" && o.SecretAccessKey != "" {
		storageOpts = append(storageOpts, storage.WithAccessKeypair(o.AccessKeyID, o.SecretAccessKey))
	}

	cli, err := storage.New(ctx, storageOpts...)
	if err != nil {
		return nil, fmt.Errorf("simplestorage: can't create storage client: %w", err)
	}

	return &Client{
		cli:     cli,
		options: o,
	}, nil
}

type Object struct {
	Bucket       string        // Bucket the object is in
	Key          string        // Key for the object
	ContentType  string        // MIME type for the object or application/octet-stream
	Etag         string        // Entity tag for the object (usually a checksum)
	Version      string        // Version tag for the object
	Size         int64         // Size of the object in bytes or 0 if unknown
	LastModified time.Time     // Creation date of the object
	Body         io.ReadCloser // Body of the object so it can be read, don't forget to close it.
}

func (c *Client) Get(ctx context.Context, key string, opts ...ClientOption) (*Object, error) {
	o := new(ClientOptions).defaults(c.options)

	for _, doer := range opts {
		doer(&o)
	}

	resp, err := c.cli.GetObject(
		ctx,
		&s3.GetObjectInput{
			Bucket: aws.String(o.BucketName),
			Key:    aws.String(key),
		},
		o.S3Headers...,
	)

	if err != nil {
		return nil, fmt.Errorf("simplestorage: can't get %s/%s: %v", o.BucketName, key, err)
	}

	return &Object{
		Bucket:       o.BucketName,
		Key:          key,
		ContentType:  Lower(resp.ContentType, "application/octet-stream"),
		Etag:         Lower(resp.ETag, ""),
		Size:         Lower(resp.ContentLength, 0),
		Version:      Lower(resp.VersionId, ""),
		LastModified: Lower(resp.LastModified, time.Unix(1, 1)),
		Body:         resp.Body,
	}, nil
}

func (c *Client) Put(ctx context.Context, obj *Object, opts ...ClientOption) (*Object, error) {
	o := new(ClientOptions).defaults(c.options)

	for _, doer := range opts {
		doer(&o)
	}

	resp, err := c.cli.PutObject(
		ctx,
		&s3.PutObjectInput{
			Bucket:        aws.String(o.BucketName),
			Key:           aws.String(obj.Key),
			Body:          obj.Body,
			ContentType:   Raise(obj.ContentType),
			ContentLength: Raise(obj.Size),
		},
		o.S3Headers...,
	)

	if err != nil {
		return nil, fmt.Errorf("simplestorage: can't put %s/%s: %v", o.BucketName, obj.Key, err)
	}

	obj.Bucket = o.BucketName
	obj.Etag = *resp.ETag
	obj.Version = *resp.VersionId

	return obj, nil
}

func (c *Client) Delete(ctx context.Context, key string, opts ...ClientOption) error {
	o := new(ClientOptions).defaults(c.options)

	for _, doer := range opts {
		doer(&o)
	}

	if _, err := c.cli.DeleteObject(
		ctx,
		&s3.DeleteObjectInput{
			Bucket: aws.String(o.BucketName),
			Key:    aws.String(key),
		},
		o.S3Headers...,
	); err != nil {
		return fmt.Errorf("simplestorage: can't delete %s/%s: %v", o.BucketName, key, err)
	}

	return nil
}

func (c *Client) List(ctx context.Context, prefix string, opts ...ClientOption) ([]Object, error) {
	o := new(ClientOptions).defaults(c.options)

	for _, doer := range opts {
		doer(&o)
	}

	resp, err := c.cli.ListObjectsV2(
		ctx,
		&s3.ListObjectsV2Input{
			Bucket: aws.String(o.BucketName),
			Prefix: aws.String(prefix),

			MaxKeys:    o.MaxKeys,
			StartAfter: o.StartAfter,
		},
		o.S3Headers...,
	)

	if err != nil {
		return nil, fmt.Errorf("simplestorage: can't list %s/%s: %v", o.BucketName, prefix, err)
	}

	var result []Object

	for _, obj := range resp.Contents {
		result = append(result, Object{
			Bucket:       o.BucketName,
			Key:          *obj.Key,
			Etag:         Lower(obj.ETag, ""),
			Size:         Lower(obj.Size, 0),
			LastModified: Lower(obj.LastModified, time.Unix(1, 1)),
		})
	}

	return result, nil
}

// Lower returns the value pointed to by p, or defaultVal if p is nil.
func Lower[T any](p *T, defaultVal T) T {
	if p != nil {
		return *p
	}
	return defaultVal
}

// Raise returns a pointer to v, or nil if v is the zero value for type T.
func Raise[T comparable](v T) *T {
	var zero T
	if v == zero {
		return nil
	}
	return &v
}
