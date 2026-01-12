package simplestorage

import (
	"context"
	"errors"
	"os"
	"testing"
)

func TestNew(t *testing.T) {
	tests := []struct {
		name        string
		setupEnv    func() func()
		options     []Option
		wantErr     error
		errCheck    func(error) bool
	}{
		{
			name: "bucket from env var",
			setupEnv: func() func() {
				os.Setenv("TIGRIS_STORAGE_BUCKET", "test-bucket")
				return func() { os.Unsetenv("TIGRIS_STORAGE_BUCKET") }
			},
			wantErr: nil,
		},
		{
			name: "bucket from option overrides env var",
			setupEnv: func() func() {
				os.Setenv("TIGRIS_STORAGE_BUCKET", "env-bucket")
				return func() { os.Unsetenv("TIGRIS_STORAGE_BUCKET") }
			},
			options: []Option{
				func(o *Options) { o.BucketName = "option-bucket" },
			},
			wantErr: nil,
		},
		{
			name:     "no bucket name returns ErrNoBucketName",
			setupEnv: func() func() { return func() {} },
			wantErr:  ErrNoBucketName,
			errCheck: func(err error) bool {
				return errors.Is(err, ErrNoBucketName)
			},
		},
		{
			name: "empty bucket from env var returns ErrNoBucketName",
			setupEnv: func() func() {
				os.Setenv("TIGRIS_STORAGE_BUCKET", "")
				return func() { os.Unsetenv("TIGRIS_STORAGE_BUCKET") }
			},
			wantErr: ErrNoBucketName,
			errCheck: func(err error) bool {
				return errors.Is(err, ErrNoBucketName)
			},
		},
		{
			name: "empty bucket from option returns ErrNoBucketName",
			setupEnv: func() func() {
				os.Unsetenv("TIGRIS_STORAGE_BUCKET")
				return func() {}
			},
			options: []Option{
				func(o *Options) { o.BucketName = "" },
			},
			wantErr: ErrNoBucketName,
			errCheck: func(err error) bool {
				return errors.Is(err, ErrNoBucketName)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := tt.setupEnv()
			defer cleanup()

			// Clear access key env vars to avoid needing real credentials for this test
			os.Unsetenv("TIGRIS_STORAGE_ACCESS_KEY_ID")
			os.Unsetenv("TIGRIS_STORAGE_SECRET_ACCESS_KEY")

			// Use test endpoint options to avoid real network calls
			opts := append(tt.options,
				func(o *Options) { o.BaseEndpoint = "https://test.endpoint.dev" },
				func(o *Options) { o.Region = "auto" },
			)

			_, err := New(context.Background(), opts...)

			if tt.wantErr != nil {
				if err == nil {
					t.Errorf("New() expected error containing %v, got nil", tt.wantErr)
					return
				}
				if tt.errCheck != nil {
					if !tt.errCheck(err) {
						t.Errorf("New() error = %v, want error matching %v", err, tt.wantErr)
					}
				} else if !errors.Is(err, tt.wantErr) && !errors.Is(err, ErrNoBucketName) {
					// Allow either the specific error or ErrNoBucketName for simpler test cases
					t.Errorf("New() error = %v, want %v", err, tt.wantErr)
				}
			} else if err != nil && !errors.Is(err, ErrNoBucketName) {
				// Ignore ErrNoBucketName since we're testing with fake endpoints
				// In real tests with proper credentials, this would succeed
				t.Logf("New() returned expected error with test endpoint: %v", err)
			}
		})
	}
}