// Package storage contains a Tigris client and helpers for interacting with Tigris.
//
// Tigris is a cloud storage service that provides a simple, scalable, and secure object storage solution. It is based on the S3 API, but has additional features that need these helpers.
package storage

import (
	"context"
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsConfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const (
	GlobalEndpoint = "https://t3.storage.dev"
	FlyEndpoint    = "https://fly.storage.tigris.dev"
)

// Options is the set of options that can be configured for the Tigris client.
type Options struct {
	BaseEndpoint string
	Region       string
	UsePathStyle bool

	AccessKeyID     string
	SecretAccessKey string
}

// defaults returns the default configuration data for the Tigris client.
func (Options) defaults() Options {
	return Options{
		BaseEndpoint:    "https://t3.storage.dev",
		Region:          "auto",
		UsePathStyle:    false,
		AccessKeyID:     os.Getenv("TIGRIS_STORAGE_ACCESS_KEY_ID"),
		SecretAccessKey: os.Getenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY"),
	}
}

// Option is a functional option for configuring the Tigris client.
type Option func(o *Options)

// WithFlyEndpoint lets you connect to Tigris' fly.io optimized endpoint.
//
// If you are deployed to fly.io, this zero-rates your traffic to Tigris.
//
// If you are not deployed to fly.io, please use WithGlobalEndpoint instead.
func WithFlyEndpoint() Option {
	return func(o *Options) {
		o.BaseEndpoint = FlyEndpoint
	}
}

// WithGlobalEndpoint lets you connect to Tigris' globally available endpoint.
//
// If you are deployed to fly.io, please use WithFlyEndpoint instead.
func WithGlobalEndpoint() Option {
	return func(o *Options) {
		o.BaseEndpoint = GlobalEndpoint
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

// New returns a new S3 client optimized for interactions with Tigris.
func New(ctx context.Context, options ...Option) (*Client, error) {
	o := new(Options).defaults()

	for _, doer := range options {
		doer(&o)
	}

	var creds aws.CredentialsProvider

	if o.AccessKeyID != "" && o.SecretAccessKey != "" {
		creds = credentials.NewStaticCredentialsProvider(o.AccessKeyID, o.SecretAccessKey, "")
	}

	cfg, err := awsConfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load Tigris config: %w", err)
	}

	cli := s3.NewFromConfig(cfg, func(opts *s3.Options) {
		opts.BaseEndpoint = aws.String(o.BaseEndpoint)
		opts.Region = o.Region
		opts.UsePathStyle = o.UsePathStyle
		if creds != nil {
			opts.Credentials = creds
		}
	})

	return &Client{
		Client: cli,
	}, nil
}
