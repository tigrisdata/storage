// Package tigrisheaders contains Tigris-specific header helpers for the AWS S3 SDK and helpers for interacting with Tigris.
//
// Tigris is a cloud storage service that provides a simple, scalable, and secure object storage solution. It is based on the S3 API, but has additional features that need these helpers.
package tigrisheaders

import (
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go/transport/http"
)

// WithHeader sets an arbitrary HTTP header on the request.
func WithHeader(key, value string) func(*s3.Options) {
	return func(options *s3.Options) {
		options.APIOptions = append(options.APIOptions, http.AddHeaderValue(key, value))
	}
}

// Region is a Tigris region from the documentation.
//
// https://www.tigrisdata.com/docs/concepts/regions/
type Region string

// Possible Tigris regions.
const (
	FRA Region = "fra" // Frankfurt, Germany
	GRU Region = "gru" // São Paulo, Brazil
	HKG Region = "hkg" // Hong Kong, China
	IAD Region = "iad" // Ashburn, Virginia, USA
	JNB Region = "jnb" // Johannesburg, South Africa
	LHR Region = "lhr" // London, UK
	MAD Region = "mad" // Madrid, Spain
	NRT Region = "nrt" // Tokyo (Narita), Japan
	ORD Region = "ord" // Chicago, Illinois, USA
	SIN Region = "sin" // Singapore
	SJC Region = "sjc" // San Jose, California, USA
	SYD Region = "syd" // Sydney, Australia

	Europe Region = "eur" // European datacenters
	USA    Region = "usa" // American datacenters
)

// WithStaticReplicationRegions sets the regions where the object will be replicated.
//
// Note that this will cause you to be charged multiple times for the same object, once per region.
func WithStaticReplicationRegions(regions []Region) func(*s3.Options) {
	regionsString := make([]string, 0, len(regions))
	for _, r := range regions {
		regionsString = append(regionsString, string(r))
	}

	return WithHeader("X-Tigris-Regions", strings.Join(regionsString, ","))
}

// WithQuery lets you filter objects in a ListObjectsV2 request.
//
// This functions like the WHERE clause in SQL, but for S3 objects. For more information, see the Tigris documentation[1].
//
// [1]: https://www.tigrisdata.com/docs/objects/query-metadata/
func WithQuery(query string) func(*s3.Options) {
	return WithHeader("X-Tigris-Query", query)
}

// WithCreateIfNotExists will create the object if it doesn't exist.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/conditionals/
func WithCreateObjectIfNotExists() func(*s3.Options) {
	return WithHeader("If-Match", `""`)
}

// WithIfEtagMatches sets the ETag that the object must match.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/conditionals/
func WithIfEtagMatches(etag string) func(*s3.Options) {
	return WithHeader("If-Match", etag)
}

// WithModifiedSince lets you proceed with operation if object was modified after provided date (RFC1123).
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/conditionals/
func WithModifiedSince(modifiedSince time.Time) func(*s3.Options) {
	return WithHeader("If-Modified-Since", modifiedSince.Format(time.RFC1123))
}

// WithUnmodifiedSince lets you proceed with operation if object was not modified after provided date (RFC1123).
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/conditionals/
func WithUnmodifiedSince(unmodifiedSince time.Time) func(*s3.Options) {
	return WithHeader("If-Unmodified-Since", unmodifiedSince.Format(time.RFC1123))
}

// WithCompareAndSwap tells Tigris to skip the cache and read the object from its designated region.
//
// This is only used on GET requests.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/conditionals/
func WithCompareAndSwap() func(*s3.Options) {
	return WithHeader("X-Tigris-CAS", "true")
}

// WithEnableSnapshot tells Tigris to enable bucket snapshotting when creating buckets.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/#enabling-snapshots-and-forks
func WithEnableSnapshot() func(*s3.Options) {
	return WithHeader("X-Tigris-Enable-Snapshot", "true")
}

// WithTakeSnapshot tells Tigris to create a snapshot with the given description on a forkable bucket.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/#creating-a-snapshot
func WithTakeSnapshot(desc string) func(*s3.Options) {
	return WithHeader("X-Tigris-Snapshot", fmt.Sprintf("true; desc=%s", desc))
}

// WithSnapshotVersion tells Tigris to use a given snapshot when doing ListObjectsV2, GetObject, or HeadObject calls.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/buckets/snapshots-and-forks/#listing-and-retrieving-objects-from-a-snapshot
func WithSnapshotVersion(snapshotVersion string) func(*s3.Options) {
	return WithHeader("X-Tigris-Snapshot-Version", snapshotVersion)
}

// WithRename tells Tigris to do an in-place rename of objects instead of copying them when using a CopyObject call.
//
// See the Tigris documentation[1] for more information.
//
// [1]: https://www.tigrisdata.com/docs/objects/object-rename/#renaming-objects-using-aws-sdks
func WithRename() func(*s3.Options) {
	return func(options *s3.Options) {
		options.APIOptions = append(options.APIOptions, http.AddHeaderValue("X-Tigris-Rename", "true"))
	}
}
