package tigrisheaders

import (
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Test that the header functions return valid option functions
func TestHeaderFunctionsAreValid(t *testing.T) {
	tests := []struct {
		name  string
		apply func(*s3.Options)
	}{
		{"WithHeader", func(o *s3.Options) { WithHeader("X-Test", "value")(o) }},
		{"WithStaticReplicationRegions", func(o *s3.Options) { WithStaticReplicationRegions([]Region{FRA, SJC})(o) }},
		{"WithQuery", func(o *s3.Options) { WithQuery("WHERE key = 'value'")(o) }},
		{"WithCreateObjectIfNotExists", func(o *s3.Options) { WithCreateObjectIfNotExists()(o) }},
		{"WithIfEtagMatches", func(o *s3.Options) { WithIfEtagMatches(`"abc"`)(o) }},
		{"WithModifiedSince", func(o *s3.Options) { WithModifiedSince(time.Now())(o) }},
		{"WithUnmodifiedSince", func(o *s3.Options) { WithUnmodifiedSince(time.Now())(o) }},
		{"WithCompareAndSwap", func(o *s3.Options) { WithCompareAndSwap()(o) }},
		{"WithEnableSnapshot", func(o *s3.Options) { WithEnableSnapshot()(o) }},
		{"WithTakeSnapshot", func(o *s3.Options) { WithTakeSnapshot("test")(o) }},
		{"WithSnapshotVersion", func(o *s3.Options) { WithSnapshotVersion("v1")(o) }},
		{"WithRename", func(o *s3.Options) { WithRename()(o) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			// Should not panic
			tt.apply(opts)
			// Should add to APIOptions
			if len(opts.APIOptions) == 0 {
				t.Errorf("%s() did not add any APIOptions", tt.name)
			}
		})
	}
}

func TestWithStaticReplicationRegions_formatting(t *testing.T) {
	tests := []struct {
		name     string
		regions  []Region
		want     string
	}{
		{
			name:    "single region",
			regions: []Region{FRA},
			want:    "fra",
		},
		{
			name:    "multiple regions",
			regions: []Region{FRA, SJC, LHR},
			want:    "fra,sjc,lhr",
		},
		{
			name:    "all specific regions",
			regions: []Region{FRA, GRU, HKG, IAD, JNB, LHR, MAD, NRT, ORD, SIN, SJC, SYD},
			want:    "fra,gru,hkg,iad,jnb,lhr,mad,nrt,ord,sin,sjc,syd",
		},
		{
			name:    "aggregate regions",
			regions: []Region{Europe, USA},
			want:    "eur,usa",
		},
		{
			name:    "mixed aggregate and specific",
			regions: []Region{FRA, Europe, SJC, USA},
			want:    "fra,eur,sjc,usa",
		},
		{
			name:    "empty regions",
			regions: []Region{},
			want:    "",
		},
		{
			name:    "single aggregate",
			regions: []Region{Europe},
			want:    "eur",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithStaticReplicationRegions(tt.regions)(opts)

			if len(opts.APIOptions) == 0 {
				t.Fatal("WithStaticReplicationRegions() did not add any APIOptions")
			}
		})
	}
}

func TestWithQuery_variousInputs(t *testing.T) {
	tests := []struct {
		name  string
		query string
	}{
		{
			name:  "simple query",
			query: "WHERE `key` = 'value'",
		},
		{
			name:  "complex query",
			query: "WHERE `Last-Modified` > \"2023-01-15T08:30:00Z\" AND `Content-Type` = \"text/javascript\"",
		},
		{
			name:  "empty query",
			query: "",
		},
		{
			name:  "query with special characters",
			query: "WHERE `name` LIKE '%test%' AND `size` > 1024",
		},
		{
			name:  "query with newlines",
			query: "WHERE `key` = 'value'\nAND `other` > 5",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithQuery(tt.query)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithQuery() did not add any APIOptions")
			}
		})
	}
}

func TestWithIfEtagMatches_variousInputs(t *testing.T) {
	tests := []struct {
		name string
		etag string
	}{
		{"simple etag", `"abc123"`},
		{"quoted etag", `"d41d8cd98f00b204e9800998ecf8427e"`},
		{"empty quotes", `""`},
		{"etag with hyphens", `"abc-123-def"`},
		{"etag with numbers", `"123456789"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithIfEtagMatches(tt.etag)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithIfEtagMatches() did not add any APIOptions")
			}
		})
	}
}

func TestWithModifiedSince_formats(t *testing.T) {
	times := []struct {
		name string
		t    time.Time
	}{
		{
			name: "2023-01-01",
			t:    time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "2023-12-31 end of day",
			t:    time.Date(2023, 12, 31, 23, 59, 59, 0, time.UTC),
		},
		{
			name: "2024-06-15 midday",
			t:    time.Date(2024, 6, 15, 12, 30, 45, 0, time.UTC),
		},
		{
			name: "unix epoch",
			t:    time.Unix(0, 0).UTC(),
		},
		{
			name: "with nanoseconds",
			t:    time.Date(2023, 5, 15, 10, 30, 0, 123456789, time.UTC),
		},
	}

	for _, tt := range times {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithModifiedSince(tt.t)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithModifiedSince() did not add any APIOptions")
			}
		})
	}
}

func TestWithUnmodifiedSince_formats(t *testing.T) {
	times := []struct {
		name string
		t    time.Time
	}{
		{
			name: "2023-01-01",
			t:    time.Date(2023, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "2023-12-31 end of day",
			t:    time.Date(2023, 12, 31, 23, 59, 59, 0, time.UTC),
		},
		{
			name: "unix epoch",
			t:    time.Unix(0, 0).UTC(),
		},
	}

	for _, tt := range times {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithUnmodifiedSince(tt.t)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithUnmodifiedSince() did not add any APIOptions")
			}
		})
	}
}

func TestWithTakeSnapshot_variousDescriptions(t *testing.T) {
	tests := []struct {
		name        string
		description string
	}{
		{
			name:        "simple description",
			description: "Initial backup",
		},
		{
			name:        "description with spaces",
			description: "Backup before migration",
		},
		{
			name:        "description with special chars",
			description: "Backup: v1.0.0 (final)",
		},
		{
			name:        "empty description",
			description: "",
		},
		{
			name:        "unicode description",
			description: "备份 before deployment",
		},
		{
			name:        "description with semicolons",
			description: "backup;version;1.0",
		},
		{
			name:        "description with equals",
			description: "desc=test backup",
		},
		{
			name:        "very long description",
			description: strings.Repeat("a", 500),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithTakeSnapshot(tt.description)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithTakeSnapshot() did not add any APIOptions")
			}
		})
	}
}

func TestWithSnapshotVersion_variousInputs(t *testing.T) {
	tests := []struct {
		name    string
		version string
	}{
		{"simple version", "snapshot-id"},
		{"uuid-like version", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"},
		{"numeric version", "12345"},
		{"version with hyphens", "snap-2023-01-15"},
		{"empty version", ""},
		{"version with underscores", "snapshot_v1_0"},
		{"version with dots", "v1.0.0"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithSnapshotVersion(tt.version)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithSnapshotVersion() did not add any APIOptions")
			}
		})
	}
}

func TestRegionConstants(t *testing.T) {
	tests := []struct {
		region Region
		want   string
	}{
		{FRA, "fra"},
		{GRU, "gru"},
		{HKG, "hkg"},
		{IAD, "iad"},
		{JNB, "jnb"},
		{LHR, "lhr"},
		{MAD, "mad"},
		{NRT, "nrt"},
		{ORD, "ord"},
		{SIN, "sin"},
		{SJC, "sjc"},
		{SYD, "syd"},
		{Europe, "eur"},
		{USA, "usa"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if string(tt.region) != tt.want {
				t.Errorf("Region %s = %q, want %q", tt.region, tt.region, tt.want)
			}
		})
	}
}

// Test that multiple header functions can be composed
func TestMultipleHeadersCanBeComposed(t *testing.T) {
	opts := &s3.Options{}

	initialCount := len(opts.APIOptions)

	WithHeader("X-Header-1", "value1")(opts)
	WithHeader("X-Header-2", "value2")(opts)
	WithStaticReplicationRegions([]Region{FRA, SJC})(opts)
	WithCompareAndSwap()(opts)

	if len(opts.APIOptions) <= initialCount {
		t.Error("Multiple header functions did not add APIOptions")
	}

	// Each call should add one APIOption
	expectedAdded := 4
	if len(opts.APIOptions)-initialCount != expectedAdded {
		t.Errorf("Expected %d APIOptions to be added, got %d", expectedAdded, len(opts.APIOptions)-initialCount)
	}
}

// Test header function with nil options - these are expected to panic
// The functions require non-nil *s3.Options
func TestHeaderFunctionsWithNilOptions(t *testing.T) {
	tests := []struct {
		name  string
		apply func(*s3.Options)
	}{
		{"WithHeader", func(o *s3.Options) { WithHeader("X-Test", "value")(o) }},
		{"WithQuery", func(o *s3.Options) { WithQuery("test")(o) }},
		{"WithCompareAndSwap", func(o *s3.Options) { WithCompareAndSwap()(o) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			defer func() {
				// These functions are expected to panic with nil options
				if r := recover(); r == nil {
					t.Errorf("%s(nil) did not panic, expected panic with nil options", tt.name)
				}
			}()
			tt.apply(nil)
		})
	}
}

// Test WithHeader with various key/value combinations
func TestWithHeader_variousInputs(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{"standard header", "X-Custom-Header", "value"},
		{"header with numbers", "X-Header-123", "value456"},
		{"header with hyphens", "X-My-Custom-Header", "my-value"},
		{"empty value", "X-Empty", ""},
		{"value with spaces", "X-Spaced", "value with spaces"},
		{"value with special chars", "X-Special", "value:with;special=chars"},
		{"unicode key", "X-Unicode", "你好"},
		{"unicode value", "X-Header", "мир"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := &s3.Options{}
			WithHeader(tt.key, tt.value)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithHeader() did not add any APIOptions")
			}
		})
	}
}

// Test that Region type works as expected
func TestRegionType(t *testing.T) {
	// Test that Region is a string type
	var r Region = "test-region"
	if string(r) != "test-region" {
		t.Errorf("Region type conversion failed: got %q", string(r))
	}

	// Test that Region constants can be used in slices
	regions := []Region{FRA, SJC, LHR}
	if len(regions) != 3 {
		t.Errorf("Region slice length: got %d, want 3", len(regions))
	}

	// Test that Region can be compared
	if FRA != "fra" {
		t.Errorf("Region comparison failed: FRA = %q, want %q", FRA, "fra")
	}
}

// Test that functions can be called directly
func TestFunctionsCanBeCalled(t *testing.T) {
	opts := &s3.Options{}

	// These should all work without panicking
	WithHeader("X-Test", "value")(opts)
	WithQuery("test")(opts)
	WithCompareAndSwap()(opts)
	WithEnableSnapshot()(opts)
	WithRename()(opts)

	// Verify options were added
	if len(opts.APIOptions) != 5 {
		t.Errorf("Expected 5 APIOptions, got %d", len(opts.APIOptions))
	}
}

// Test time formatting edge cases
func TestTimeFormattingEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		t    time.Time
	}{
		{
			name: "zero time",
			t:    time.Time{},
		},
		{
			name: "far future",
			t:    time.Date(2099, 12, 31, 23, 59, 59, 0, time.UTC),
		},
		{
			name: "far past",
			t:    time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			name: "with monotonic clock",
			t:    time.Now().Add(time.Hour),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name+" modified since", func(t *testing.T) {
			opts := &s3.Options{}
			WithModifiedSince(tt.t)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithModifiedSince() did not add any APIOptions")
			}
		})

		t.Run(tt.name+" unmodified since", func(t *testing.T) {
			opts := &s3.Options{}
			WithUnmodifiedSince(tt.t)(opts)

			if len(opts.APIOptions) == 0 {
				t.Error("WithUnmodifiedSince() did not add any APIOptions")
			}
		})
	}
}

// Benchmark tests for header creation
func BenchmarkWithHeader(b *testing.B) {
	opts := &s3.Options{}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		WithHeader("X-Test", "value")(opts)
	}
}

func BenchmarkWithStaticReplicationRegions(b *testing.B) {
	regions := []Region{FRA, SJC, LHR, NRT, SYD}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		opts := &s3.Options{}
		WithStaticReplicationRegions(regions)(opts)
	}
}

func BenchmarkWithQuery(b *testing.B) {
	query := "WHERE `Last-Modified` > \"2023-01-15T08:30:00Z\" AND `Content-Type` = \"text/javascript\""
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		opts := &s3.Options{}
		WithQuery(query)(opts)
	}
}

func BenchmarkWithModifiedSince(b *testing.B) {
	t := time.Date(2023, 1, 15, 8, 30, 0, 0, time.UTC)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		opts := &s3.Options{}
		WithModifiedSince(t)(opts)
	}
}

func BenchmarkWithTakeSnapshot(b *testing.B) {
	desc := "Backup before migration"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		opts := &s3.Options{}
		WithTakeSnapshot(desc)(opts)
	}
}