package simplestorage

import (
	"os"

	storage "github.com/tigrisdata/storage/go"
)

type Option func(o *Options)

type Options struct {
	BucketName      string
	AccessKeyID     string
	SecretAccessKey string

	BaseEndpoint string
	Region       string
	UsePathStyle bool
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
