package simplestorage

import (
	"os"

	storage "github.com/tigrisdata/storage/go"
)

// Option is a functional option for new client creation.
type Option func(o *Options)

// Options is the set of options for client creation.
//
// These fields are made public so you can implement your own configuration resolution methods.
type Options struct {
	// The bucket to operate against. Defaults to the contents of the environment variable
	// `TIGRIS_STORAGE_BUCKET`.
	BucketName string

	// The access key ID of the Tigris keypair the Client should use. Defaults to the contents
	// of the environment variable `TIGRIS_STORAGE_ACCESS_KEY_ID`.
	AccessKeyID string

	// The access key ID of the Tigris keypair the Client should use. Defaults to the contents
	// of the environment variable `TIGRIS_STORAGE_SECRET_ACCESS_KEY`.
	SecretAccessKey string

	BaseEndpoint string // The Tigris base endpoint the Client should use (defaults to GlobalEndpoint)
	Region       string // The S3 region the Client should use (defaults to "auto").
	UsePathStyle bool   // Should the Client use S3 path style resolution? (defaults to false).
}

func (Options) defaults() Options {
	return Options{
		BucketName:      os.Getenv("TIGRIS_STORAGE_BUCKET"),
		AccessKeyID:     os.Getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY"),

		BaseEndpoint: storage.GlobalEndpoint,
		Region:       "auto",
		UsePathStyle: false,
	}
}

// WithBucket sets the default bucket for Tigris operations. If this is not set
// via the `TIGRIS_STORAGE_BUCKET` environment variable or this call, New() will
// return ErrNoBucketName.
func WithBucket(bucketName string) Option {
	return func(o *Options) {
		o.BucketName = bucketName
	}
}

// WithFlyEndpoint lets you connect to Tigris' fly.io optimized endpoint.
//
// If you are deployed to fly.io, this zero-rates your traffic to Tigris.
//
// If you are not deployed to fly.io, please use WithGlobalEndpoint instead.
func WithFlyEndpoint() Option {
	return func(o *Options) {
		o.BaseEndpoint = storage.FlyEndpoint
	}
}

// WithGlobalEndpoint lets you connect to Tigris' globally available endpoint.
//
// If you are deployed to fly.io, please use WithFlyEndpoint instead.
func WithGlobalEndpoint() Option {
	return func(o *Options) {
		o.BaseEndpoint = storage.GlobalEndpoint
	}
}

// WithEndpoint sets a custom endpoint for connecting to Tigris.
//
// This allows you to connect to a custom Tigris endpoint instead of the default
// global endpoint. Use this for:
//   - Using a custom proxy or gateway
//   - Testing against local development endpoints
//
// For most use cases, consider using WithGlobalEndpoint or WithFlyEndpoint instead.
func WithEndpoint(endpoint string) Option {
	return func(o *Options) {
		o.BaseEndpoint = endpoint
	}
}

// WithRegion lets you statically specify a region for interacting with Tigris.
//
// You will almost certainly never need this. This is here for development usecases where the default region is not "auto".
func WithRegion(region string) Option {
	return func(o *Options) {
		o.Region = region
	}
}

// WithPathStyle configures whether to use path-style addressing for S3 requests.
//
// By default, Tigris uses virtual-hosted-style addressing (e.g., https://bucket.t3.storage.dev).
// Path-style addressing (e.g., https://t3.storage.dev/bucket) may be needed for:
//   - Compatibility with older S3 clients that don't support virtual-hosted-style
//   - Working through certain proxies or load balancers that don't support virtual-hosted-style
//   - Local development environments with custom DNS setups
//
// Enable this only if you encounter issues with the default virtual-hosted-style addressing.
func WithPathStyle(enabled bool) Option {
	return func(o *Options) {
		o.UsePathStyle = enabled
	}
}

// WithAccessKeypair lets you specify a custom access key and secret access key for interfacing with Tigris.
//
// This is useful when you need to load environment variables from somewhere other than the default AWS configuration path.
func WithAccessKeypair(accessKeyID, secretAccessKey string) Option {
	return func(o *Options) {
		o.AccessKeyID = accessKeyID
		o.SecretAccessKey = secretAccessKey
	}
}
