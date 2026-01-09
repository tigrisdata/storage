package storage

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func TestOptions_defaults(t *testing.T) {
	tests := []struct {
		name          string
		input         Options
		wantEndpoint  string
		wantRegion    string
		wantPathStyle bool
	}{
		{
			name:          "default values",
			input:         Options{},
			wantEndpoint:  "https://t3.storage.dev",
			wantRegion:    "auto",
			wantPathStyle: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.input.defaults()
			if got.BaseEndpoint != tt.wantEndpoint {
				t.Errorf("BaseEndpoint = %v, want %v", got.BaseEndpoint, tt.wantEndpoint)
			}
			if got.Region != tt.wantRegion {
				t.Errorf("Region = %v, want %v", got.Region, tt.wantRegion)
			}
			if got.UsePathStyle != tt.wantPathStyle {
				t.Errorf("UsePathStyle = %v, want %v", got.UsePathStyle, tt.wantPathStyle)
			}
		})
	}
}

func TestWithFlyEndpoint(t *testing.T) {
	o := &Options{}
	WithFlyEndpoint()(o)

	if o.BaseEndpoint != "https://fly.storage.tigris.dev" {
		t.Errorf("BaseEndpoint = %v, want https://fly.storage.tigris.dev", o.BaseEndpoint)
	}
}

func TestWithGlobalEndpoint(t *testing.T) {
	o := &Options{}
	WithGlobalEndpoint()(o)

	if o.BaseEndpoint != "https://t3.storage.dev" {
		t.Errorf("BaseEndpoint = %v, want https://t3.storage.dev", o.BaseEndpoint)
	}
}

func TestWithRegion(t *testing.T) {
	tests := []struct {
		name  string
		region string
	}{
		{"auto region", "auto"},
		{"us-west-2", "us-west-2"},
		{"eu-central-1", "eu-central-1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			o := &Options{}
			WithRegion(tt.region)(o)

			if o.Region != tt.region {
				t.Errorf("Region = %v, want %v", o.Region, tt.region)
			}
		})
	}
}

func TestWithAccessKeypair(t *testing.T) {
	o := &Options{}
	accessKeyID := "test-access-key"
	secretAccessKey := "test-secret-key"

	WithAccessKeypair(accessKeyID, secretAccessKey)(o)

	if o.AccessKeyID != accessKeyID {
		t.Errorf("AccessKeyID = %v, want %v", o.AccessKeyID, accessKeyID)
	}
	if o.SecretAccessKey != secretAccessKey {
		t.Errorf("SecretAccessKey = %v, want %v", o.SecretAccessKey, secretAccessKey)
	}
}

func TestWithAccessKeypair_overrides(t *testing.T) {
	o := &Options{
		AccessKeyID:     "old-key",
		SecretAccessKey: "old-secret",
	}

	WithAccessKeypair("new-key", "new-secret")(o)

	if o.AccessKeyID != "new-key" {
		t.Errorf("AccessKeyID = %v, want new-key", o.AccessKeyID)
	}
	if o.SecretAccessKey != "new-secret" {
		t.Errorf("SecretAccessKey = %v, want new-secret", o.SecretAccessKey)
	}
}

func TestOptions_functionalOptions(t *testing.T) {
	tests := []struct {
		name     string
		options  []Option
		want     Options
	}{
		{
			name:    "no options uses defaults",
			options: nil,
			want: Options{
				BaseEndpoint: "https://t3.storage.dev",
				Region:       "auto",
				UsePathStyle: false,
			},
		},
		{
			name: "fly endpoint",
			options: []Option{
				WithFlyEndpoint(),
			},
			want: Options{
				BaseEndpoint: "https://fly.storage.tigris.dev",
				Region:       "auto",
				UsePathStyle: false,
			},
		},
		{
			name: "global endpoint (explicit)",
			options: []Option{
				WithGlobalEndpoint(),
			},
			want: Options{
				BaseEndpoint: "https://t3.storage.dev",
				Region:       "auto",
				UsePathStyle: false,
			},
		},
		{
			name: "custom region",
			options: []Option{
				WithRegion("us-west-2"),
			},
			want: Options{
				BaseEndpoint: "https://t3.storage.dev",
				Region:       "us-west-2",
				UsePathStyle: false,
			},
		},
		{
			name: "with credentials",
			options: []Option{
				WithAccessKeypair("key-id", "secret"),
			},
			want: Options{
				BaseEndpoint:   "https://t3.storage.dev",
				Region:         "auto",
				UsePathStyle:   false,
				AccessKeyID:    "key-id",
				SecretAccessKey: "secret",
			},
		},
		{
			name: "multiple options",
			options: []Option{
				WithFlyEndpoint(),
				WithRegion("eu-central-1"),
				WithAccessKeypair("key", "secret"),
			},
			want: Options{
				BaseEndpoint:   "https://fly.storage.tigris.dev",
				Region:         "eu-central-1",
				UsePathStyle:   false,
				AccessKeyID:    "key",
				SecretAccessKey: "secret",
			},
		},
		{
			name: "last option wins for endpoint",
			options: []Option{
				WithFlyEndpoint(),
				WithGlobalEndpoint(),
			},
			want: Options{
				BaseEndpoint: "https://t3.storage.dev",
				Region:       "auto",
				UsePathStyle: false,
			},
		},
		{
			name: "last option wins for region",
			options: []Option{
				WithRegion("us-west-2"),
				WithRegion("eu-central-1"),
			},
			want: Options{
				BaseEndpoint: "https://t3.storage.dev",
				Region:       "eu-central-1",
				UsePathStyle: false,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			o := new(Options).defaults()

			for _, opt := range tt.options {
				opt(&o)
			}

			if o.BaseEndpoint != tt.want.BaseEndpoint {
				t.Errorf("BaseEndpoint = %v, want %v", o.BaseEndpoint, tt.want.BaseEndpoint)
			}
			if o.Region != tt.want.Region {
				t.Errorf("Region = %v, want %v", o.Region, tt.want.Region)
			}
			if o.UsePathStyle != tt.want.UsePathStyle {
				t.Errorf("UsePathStyle = %v, want %v", o.UsePathStyle, tt.want.UsePathStyle)
			}
			if o.AccessKeyID != tt.want.AccessKeyID {
				t.Errorf("AccessKeyID = %v, want %v", o.AccessKeyID, tt.want.AccessKeyID)
			}
			if o.SecretAccessKey != tt.want.SecretAccessKey {
				t.Errorf("SecretAccessKey = %v, want %v", o.SecretAccessKey, tt.want.SecretAccessKey)
			}
		})
	}
}

func TestNew_createsClient(t *testing.T) {
	// This test verifies that New() creates a valid client structure
	// It doesn't actually connect to Tigris, just checks initialization

	ctx := context.Background()

	t.Run("with default options", func(t *testing.T) {
		client, err := New(ctx)
		if err != nil {
			t.Fatalf("New() failed: %v", err)
		}
		if client == nil {
			t.Fatal("New() returned nil client")
		}
		if client.Client == nil {
			t.Fatal("New() returned client with nil S3 client")
		}
	})

	t.Run("with fly endpoint", func(t *testing.T) {
		client, err := New(ctx, WithFlyEndpoint())
		if err != nil {
			t.Fatalf("New() failed: %v", err)
		}
		if client == nil {
			t.Fatal("New() returned nil client")
		}
	})
}

func TestNew_withOptions(t *testing.T) {
	ctx := context.Background()

	t.Run("with custom region", func(t *testing.T) {
		client, err := New(ctx, WithRegion("us-west-2"))
		if err != nil {
			t.Fatalf("New() failed: %v", err)
		}
		if client == nil {
			t.Fatal("New() returned nil client")
		}
		if client.Client == nil {
			t.Fatal("New() returned client with nil S3 client")
		}
	})

	t.Run("with credentials", func(t *testing.T) {
		client, err := New(ctx, WithAccessKeypair("test-key", "test-secret"))
		if err != nil {
			t.Fatalf("New() failed: %v", err)
		}
		if client == nil {
			t.Fatal("New() returned nil client")
		}
		if client.Client == nil {
			t.Fatal("New() returned client with nil S3 client")
		}
	})
}

// MockS3Client is a mock implementation for testing
type MockS3Client struct {
	*s3.Client
}

func (m *MockS3Client) Close() error {
	return nil
}

// Test that Client wraps the S3 client correctly
func TestClient_wrapsS3Client(t *testing.T) {
	s3Client := &s3.Client{}
	client := &Client{Client: s3Client}

	if client.Client != s3Client {
		t.Error("Client.Client is not the provided S3 client")
	}
}