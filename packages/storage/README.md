# @tigrisdata/storage

Tigris is a high-performance object storage system designed for multi-cloud environments. Tigris Storage SDK provides a simple interface and minimal configuration that lets you get started quickly and integrate Tigris into your application. It is built on top of Tigris Object Storage API and offers all the functionality of Tigris.

## Installation

```bash
# NPM
npm install @tigrisdata/storage
# YARN
yarn add @tigrisdata/storage
```

## Getting Started

Getting started with Tigris Storage SDK is easy. First, you need to create a Tigris account and create a bucket.

### Setting up your account and bucket

1. Create a Tigris account at [storage.new](https://storage.new)
2. Create a bucket at [console.tigris.dev/createbucket](https://console.tigris.dev/createbucket)
3. Create an access key at [console.tigris.dev/createaccesskey](https://console.tigris.dev/createaccesskey)

### Configure your Project

In your project root, create a `.env` file if it doesn't exist already and put the following content in it. Replace the values with actual values you obtained from above steps.

```bash
TIGRIS_STORAGE_ACCESS_KEY_ID=tid_access_key_id
TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_secret_access_key
TIGRIS_STORAGE_BUCKET=bucket_name
```

## Authentication

After you have created an access key, you can set the environment variables in your `.env` file:

```bash
TIGRIS_STORAGE_ACCESS_KEY_ID=tid_access_key_id
TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_secret_access_key
TIGRIS_STORAGE_BUCKET=bucket_name
```

Alternatively, all methods accept an optional config parameter that allows you to override the default environment configuration:

```ts
type TigrisStorageConfig = {
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
};
```

### Examples

#### Use environment variables (default)

```ts
const result = await list();
```

#### Override with custom config

```ts
const result = await list({
  config: {
    bucket: 'my-bucket-name',
    accessKeyId: 'tigris-access-key',
    secretAccessKey: 'tigris-secret-key',
  },
});
```

#### Override only specific values

```ts
const result = await get('object.txt', 'string', {
  config: {
    bucket: 'different-bucket',
  },
});
```

## Responses

All methods return a generic response of type `TigrisStorageResponse`. If there is an error, the `error` property will be set. If there is a successful response, the `data` property will be set. This allows for a better type safety and error handling.

```ts
type TigrisStorageResponse<T, E> = {
  data?: T;
  error?: E;
};
```

### Example

```ts
const objectResult = await get('photo.jpg', 'file');
if (objectResult.error) {
  console.error('Error downloading object:', objectResult.error);
} else {
  console.log('Object name:', objectResult.data?.name);
  console.log('Object size:', objectResult.data?.size);
  console.log('Object type:', objectResult.data?.type);
}
```

## Uploading an object

`put` function can be used to upload a object to a bucket.

### `put`

```ts
put(path: string, body: string | ReadableStream | Blob | Buffer, options?: PutOptions): Promise<TigrisStorageResponse<PutResponse, Error>>;
```

`put` accepts the following parameters:

- `path`: (Required) A string specifying the base value of the return URL
- `body`: (Required) A blob object as ReadableStream, String, ArrayBuffer or Blob based on these supported body types
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**      | **Required** | **Values**                                                                                                                                              |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| access             | No           | The access level for the object. Possible values are `public` and `private`.                                                                            |
| addRandomSuffix    | No           | Whether to add a random suffix to the object name. Default is `false`.                                                                                  |
| allowOverwrite     | No           | Whether to allow overwriting the object. Default is `true`.                                                                                             |
| contentType        | No           | Set the content type of the object. If not provided, the content type will be inferred from the extension of the path.                                  |
| contentDisposition | No           | Set the content disposition of the object. Possible values are `inline` and `attachment`. Default is `inline`. Use `attachment` for downloadable files. |
| multipart          | No           | Pass `multipart: true` when uploading large objects. It will split the object into multiple parts and upload them in parallel.                          |
| partSize           | No           | Part size in bytes for multipart uploads. Default is 5MB.                                                                                               |
| queueSize          | No           | Maximum number of concurrent part uploads for multipart uploads.                                                                                        |
| abortController    | No           | An AbortController instance to abort the upload.                                                                                                        |
| onUploadProgress   | No           | Callback to track upload progress: `onUploadProgress({loaded: number, total: number, percentage: number})`.                                             |
| config             | No           | A configuration object to override the [default configuration](#authentication).                                                                        |

In case of successful upload, the `data` property will be set to the upload and contains the following properties:

- `contentDisposition`: content disposition of the object
- `contentType`: content type of the object
- `modified`: Last modified date of the object
- `path`: Path to the object
- `size`: Size of the object
- `url`: A presigned URL to the object if the object is uploaded with `access` set to `private`, otherwise unsigned public URL for the object

### Examples

#### Simple upload

```ts
const result = await put('simple.txt', 'Hello, World!');
if (result.error) {
  console.error('Error uploading object:', result.error);
} else {
  console.log('Object uploaded successfully:', result.data);
}
```

#### Uploading a large object

```ts
const result = await put('large.mp4', fileStream, {
  multipart: true,
  onUploadProgress: ({ loaded, total, percentage }) => {
    console.log(`Uploaded ${loaded} of ${total} bytes (${percentage}%)`);
  },
});
```

#### Prevent overwriting

```ts
const result = await put('config.json', configuration, {
  allowOverwrite: false,
});
```

#### Cancel an upload

```ts
const abortController = new AbortController();

const result = await put('large.mp4', fileStream, {
  abortController: abortController,
});

function cancelUpload() {
  abortController.abort();
}

// <button onClick={cancelUpload}>Cancel Upload</button>
```

## Downloading an object

`get` function can be used to get/download a object from a bucket.

### `get`

```ts
get(path: string, format: "string" | "file" | "stream", options?: GetOptions): Promise<TigrisStorageResponse<GetResponse, Error>>;
```

`get` accepts the following parameters:

- `path`: (Required) A string specifying the path to the object
- `format`: (Required) A string specifying the format of the object. Possible values are `string`, `file`, and `stream`.
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**      | **Required** | **Values**                                                                                                                                              |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contentDisposition | No           | Set the content disposition of the object. Possible values are `inline` and `attachment`. Default is `inline`. Use `attachment` for downloadable files. |
| contentType        | No           | Set the content type of the object. If not provided, content type set when the object is uploaded will be used.                                         |
| encoding           | No           | Set the encoding of the object. Default is `utf-8`.                                                                                                     |
| snapshotVersion    | No           | Snapshot version of the bucket.                                                                                                                         |
| config             | No           | A configuration object to override the [default configuration](#authentication).                                                                        |

In case of successful `get`, the `data` contains the object in the format specified by the `format` parameter.

### Examples

#### Get an object as a string

```ts
const result = await get('object.txt', 'string');

if (result.error) {
  console.error('Error getting object:', result.error);
} else {
  console.log('Object:', result.data);
  // output: "Hello, World!"
}
```

#### Get an object as a file

```ts
const result = await get('object.pdf', 'file', {
  contentDisposition: 'attachment',
  contentType: 'application/pdf',
  encoding: 'utf-8',
});

if (result.error) {
  console.error('Error getting object:', result.error);
} else {
  console.log('Object:', result.data);
}
```

#### Get an object as a stream

```ts
const result = await get('video.mp4', 'stream', {
  contentDisposition: 'attachment',
  contentType: 'video/mp4',
  encoding: 'utf-8',
});

if (result.error) {
  console.error('Error getting object:', result.error);
} else {
  const reader = result.data?.getReader();
  // Process stream...
  reader?.read().then((result) => {
    console.log(result);
  });
}
```

## Object metadata

`head` function can be used to get the metadata of an object from a bucket.

### `head`

```ts
head(path: string, options?: HeadOptions): Promise<TigrisStorageResponse<HeadResponse, Error>>
```

`head` accepts the following parameters:

- `path`: (Required) A string specifying the path to the object
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**   | **Required** | **Values**                                                                       |
| --------------- | ------------ | -------------------------------------------------------------------------------- |
| snapshotVersion | No           | Snapshot version of the bucket.                                                  |
| config          | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `head`, the `data` property will be set to the metadata of the object and contains the following properties:

- `contentDisposition`: content disposition of the object
- `contentType`: content type of the object
- `modified`: Last modified date of the object
- `path`: Path to the object
- `size`: Size of the object
- `url`: A presigned URL to the object if the object is downloaded with `access` set to `private`, otherwise unsigned public URL for the object

### Examples

#### Get object metadata

```ts
const result = await head('object.txt');

if (result.error) {
  console.error('Error getting object metadata:', result.error);
} else {
  console.log('Object metadata:', result.data);
  // output: {
  //   contentDisposition: "inline",
  //   contentType: "text/plain",
  //   modified: "2023-01-15T08:30:00Z",
  //   path: "object.txt",
  //   size: 12,
  //   url: "https://tigris-example.t3.storage.dev/object.txt",
  // }
}
```

## Deleting an object

`remove` function can be used to delete an object from a bucket.

### `remove`

```ts
remove(path: string, options?: RemoveOptions): Promise<TigrisStorageResponse<void, Error>>;
```

`remove` accepts the following parameters:

- `path`: (Required) A string specifying the path to the object
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `remove`, the `data` property will be set to `undefined` and the object will be deleted.

### Examples

#### Delete an object

```ts
const result = await remove('object.txt');

if (result.error) {
  console.error('Error deleting object:', result.error);
} else {
  console.log('Object deleted successfully');
}
```

## Presigning an object

`getPresignedUrl` function can be used to presign an object from a bucket and retreive the presigned URL.

### `getPresignedUrl`

```ts
getPresignedUrl(path: string, options: GetPresignedUrlOptions): Promise<TigrisStorageResponse<GetPresignedUrlResponse, Error>>
```

`getPresignedUrl` accepts the following parameters:

- `path`: (Required) A string specifying the path to the object
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                               |
| ------------- | ------------ | ---------------------------------------------------------------------------------------- |
| operation     | No           | Specify the operation to use for the presigned URL. Possible values are `get` and `put`. |
| expiresIn     | No           | The expiration time of the presigned URL in seconds. Default is 3600 seconds (1 hour).   |
| contentType   | No           | The content type of the object.                                                          |
| config        | No           | A configuration object to override the [default configuration](#authentication).         |

In case of successful `getPresignedUrl`, the `data` property will be set to the presigned URL and contains the following properties:

- `url`: The presigned URL
- `method`: The method used to get the presigned URL
- `expiresIn`: The expiration time of the presigned URL

### Examples

#### Get a presigned URL for a GET operation

```ts
const result = await getPresignedUrl('object.txt', { operation: 'get' });

if (result.error) {
  console.error('Error getting presigned URL:', result.error);
} else {
  console.log('Presigned URL:', result.data.url);
}
```

#### Get a presigned URL for a PUT operation

```ts
const result = await getPresignedUrl('object.txt', { operation: 'put' });
```

## Listing objects

`list` function can be used to list objects from a bucket.

### `list`

```ts
list(options?: ListOptions): Promise<TigrisStorageResponse<ListResponse, Error>>;
```

`list` accepts the following parameters:

- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**   | **Required** | **Values**                                                                       |
| --------------- | ------------ | -------------------------------------------------------------------------------- |
| delimiter       | No           | A delimiter is a character that you use to group keys.                           |
| prefix          | No           | Limits the items to keys that begin with the specified prefix.                   |
| limit           | No           | The maximum number of objects to return. By default, returns up to 100 objects.  |
| paginationToken | No           | The pagination token to continue listing objects from the previous request.      |
| snapshotVersion | No           | Snapshot version of the bucket.                                                  |
| config          | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `list`, the `data` property will be set to the list of objects and contains the following properties:

- `items`: The list of objects
- `paginationToken`: The pagination token to continue listing objects for next page.
- `hasMore`: Whether there are more objects to list.

### Examples

#### List objects

```ts
const result = await list();

if (result.error) {
  console.error('Error listing objects:', result.error);
} else {
  console.log('Objects:', result.data);
}
```

#### List objects with pagination

```ts
const allFiles: Item[] = [];
let currentPage = await list({ limit: 10 });

if (currentPage.data) {
  allFiles.push(...currentPage.data.items);

  while (currentPage.data?.hasMore && currentPage.data?.paginationToken) {
    currentPage = await list({
      limit: 10,
      paginationToken: currentPage.data?.paginationToken,
    });

    if (currentPage.data) {
      allFiles.push(...currentPage.data.items);
    } else if (currentPage.error) {
      console.error('Error during pagination:', currentPage.error);
      break;
    }
  }
}

console.log(allFiles);
```

## Creating a bucket

`createBucket` function can be used to create a new bucket.

### `createBucket`

```ts
createBucket(bucketName: string, options?: CreateBucketOptions): Promise<TigrisStorageResponse<CreateBucketResponse, Error>>;
```

`createBucket` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket to create
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**        | **Required** | **Values**                                                                                                                                                               |
| -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| access               | No           | `public` or `private`. If set to public, objects in this bucket will be publicly readable. Default value is `private`                                                    |
| defaultTier          | No           | `STANDARD`, `STANDARD_IA`, `GLACIER` or `GLACIER_IR`. This is default object tier for all objects uploaded to it. Default is `STANDARD`                                  |
| enableSnapshot       | No           | Enable snapshot functionality for the bucket. Default is `false`. Please note only the Standard storage tier is supported for snapshot-enabled buckets                   |
| locations            | No           | Bucket location configuration. See [Locations](#bucket-locations) below. Default is **global**.                                                                          |
| sourceBucketName     | No           | The name of the source bucket to fork from.                                                                                                                              |
| sourceBucketSnapshot | No           | The snapshot version of the source bucket to fork from.                                                                                                                  |
| consistency          | No           | **Deprecated.** Use `locations` instead. `default` or `strict`.                                                                                                          |
| region               | No           | **Deprecated.** Use `locations` instead. By default, **Global**.                                                                                                         |
| config               | No           | A configuration object to override the [default configuration](#authentication).                                                                                         |

#### Bucket Locations

The `locations` option controls where your bucket data is stored. It accepts an object with a `type` and optional `values`:

| **Type** | **Values**                                                                 | **Description**                                                                                                        |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `global` | _(none)_                                                                   | Data distributed globally. Strong consistency for requests in same region, eventual consistency globally.               |
| `multi`  | `'usa'` or `'eur'`                                                         | Highest availability with data residency across regions in the chosen geo. Strong consistency globally.                 |
| `dual`   | One or more of: `'ams'`, `'fra'`, `'gru'`, `'iad'`, `'jnb'`, `'lhr'`, `'nrt'`, `'ord'`, `'sin'`, `'sjc'`, `'syd'` | High availability with data residency across regions of choice. Strong consistency for requests in same region, eventual consistency globally. |
| `single` | One of: `'ams'`, `'fra'`, `'gru'`, `'iad'`, `'jnb'`, `'lhr'`, `'nrt'`, `'ord'`, `'sin'`, `'sjc'`, `'syd'`         | Data redundancy across availability zones in a single region. Strong consistency globally.                              |

In case of successful `createBucket`, the `data` property will be set and contains the following properties:

- `isSnapshotEnabled`: Whether snapshot functionality is enabled for the bucket
- `hasForks`: Whether the bucket has forks
- `sourceBucketName`: The name of the source bucket (if this is a fork bucket)
- `sourceBucketSnapshot`: The snapshot version of the source bucket (if this is a fork bucket)

### Examples

#### Create a regular bucket

```ts
const result = await createBucket('my-new-bucket');

if (result.error) {
  console.error('Error creating bucket:', result.error);
} else {
  console.log('Bucket created successfully:', result.data);
}
```

#### Create a bucket with snapshot enabled

```ts
const result = await createBucket('my-snapshot-bucket', {
  enableSnapshot: true,
});

if (result.error) {
  console.error('Error creating bucket:', result.error);
} else {
  console.log('Bucket created with snapshot enabled:', result.data);
}
```

#### Create a bucket with specific locations

```ts
const result = await createBucket('my-eu-bucket', {
  locations: { type: 'multi', values: 'eur' },
});
```

#### Create a bucket as a fork of another bucket

```ts
const result = await createBucket('my-forked-bucket', {
  sourceBucketName: 'parent-bucket',
  sourceBucketSnapshot: '1751631910169675092',
});

if (result.error) {
  console.error('Error creating forked bucket:', result.error);
} else {
  console.log('Forked bucket created:', result.data);
}
```

## Getting bucket information

`getBucketInfo` function can be used to retrieve information about a specific bucket.

### `getBucketInfo`

```ts
getBucketInfo(bucketName: string, options?: GetBucketInfoOptions): Promise<TigrisStorageResponse<BucketInfoResponse, Error>>;
```

`getBucketInfo` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `getBucketInfo`, the `data` property will be set and contains the following properties:

- `isSnapshotEnabled`: Whether snapshot is enabled for the bucket
- `hasForks`: (**Deprecated**, use `forkInfo.hasChildren`) Whether the bucket has forks
- `sourceBucketName`: (**Deprecated**, use `forkInfo.parents[0].bucketName`) The name of the source bucket
- `sourceBucketSnapshot`: (**Deprecated**, use `forkInfo.parents[0].snapshot`) The snapshot version of the source bucket
- `forkInfo`: Fork information for the bucket (or `undefined` if the bucket is not a fork)
  - `hasChildren`: Whether the bucket has child forks
  - `parents`: Array of parent bucket info (`bucketName`, `forkCreatedAt`, `snapshot`, `snapshotCreatedAt`)
- `settings`: Bucket settings
  - `allowObjectAcl`: Whether per-object ACL is enabled
  - `defaultTier`: Default storage class (`STANDARD`, `STANDARD_IA`, `GLACIER`, `GLACIER_IR`)
  - `corsRules`: Array of CORS rules
  - `notifications`: Notification configuration
  - `ttlConfig`: TTL/expiration configuration
  - `lifecycleRules`: Array of lifecycle transition rules
  - `dataMigration`: Data migration (shadow bucket) configuration
  - `customDomain`: Custom domain name
  - `deleteProtection`: Whether delete protection is enabled
  - `additionalHeaders`: Additional HTTP headers
- `sizeInfo`: Bucket size information
  - `numberOfObjects`: Number of objects
  - `size`: Total size in bytes
  - `numberOfObjectsAllVersions`: Number of objects including all versions

### Examples

#### Get bucket information

```ts
const result = await getBucketInfo('my-bucket');

if (result.error) {
  console.error('Error getting bucket info:', result.error);
} else {
  console.log('Snapshot enabled:', result.data?.isSnapshotEnabled);
  console.log('Settings:', result.data?.settings);
  console.log('Size info:', result.data?.sizeInfo);
  console.log('Fork info:', result.data?.forkInfo);
}
```

## Listing buckets

`listBuckets` function can be used to list all buckets that the user has access to.

### `listBuckets`

```ts
listBuckets(options?: ListBucketsOptions): Promise<TigrisStorageResponse<ListBucketsResponse, Error>>;
```

`listBuckets` accepts the following parameters

- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**   | **Required** | **Values**                                                                       |
| --------------- | ------------ | -------------------------------------------------------------------------------- |
| limit           | No           | The maximum number of buckets to return.                                         |
| paginationToken | No           | The pagination token to continue listing buckets from the previous request.      |
| config          | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `list`, the `data` property will be set to the list of buckets and contains the following properties:

- `buckets`: The list of buckets
- `owner`: The owner of the buckets
- `paginationToken`: The pagination token to continue listing objects for next page.

### Examples

#### List buckets

```ts
const result = await listBuckets();

if (result.error) {
  console.error('Error listing buckets:', result.error);
} else {
  console.log('Buckets:', result.data);
}
```

## Deleting a bucket

`removeBucket` function can be used to delete a bucket.

### `removeBucket`

```ts
removeBucket(bucketName: string, options?: RemoveBucketOptions): Promise<TigrisStorageResponse<void, Error>>;
```

`removeBucket` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| force         | No           | When provided, forcefully delete the bucket.                                     |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `removeBucket`, the `data` property will be set to `undefined` and the bucket will be deleted.

### Examples

#### Delete a bucket

```ts
const result = await removeBucket('my-bucket');

if (result.error) {
  console.error('Error deleting bucket:', result.error);
} else {
  console.log('Bucket deleted successfully');
}
```

## Creating a bucket snapshot

`createBucketSnapshot` function can be used to create a snapshot of a bucket at a specific point in time.

### `createBucketSnapshot`

```ts
createBucketSnapshot(options?: CreateBucketSnapshotOptions): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;
createBucketSnapshot(sourceBucketName?: string, options?: CreateBucketSnapshotOptions): Promise<TigrisStorageResponse<CreateBucketSnapshotResponse, Error>>;
```

`createBucketSnapshot` accepts the following parameters:

- `sourceBucketName`: (Optional) A string specifying the name of the bucket to snapshot. If not provided, uses the bucket from environment configuration.
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| name          | No           | A name for the snapshot.                                                         |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `createBucketSnapshot`, the `data` property will be set and contains the following properties:

- `snapshotVersion`: The version identifier of the created snapshot

### Examples

#### Create a snapshot

```ts
const result = await createBucketSnapshot();

if (result.error) {
  console.error('Error creating snapshot:', result.error);
} else {
  console.log('Snapshot created:', result.data);
  // output: { snapshotVersion: "1751631910169675092" }
}
```

#### Create a named snapshot for a specific bucket

```ts
const result = await createBucketSnapshot('my-bucket', {
  name: 'backup-before-migration',
});

if (result.error) {
  console.error('Error creating snapshot:', result.error);
} else {
  console.log('Named snapshot created:', result.data);
}
```

## Listing bucket snapshots

`listBucketSnapshots` function can be used to list all snapshots for a bucket.

### `listBucketSnapshots`

```ts
listBucketSnapshots(options?: ListBucketSnapshotsOptions): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
listBucketSnapshots(sourceBucketName?: string, options?: ListBucketSnapshotsOptions): Promise<TigrisStorageResponse<ListBucketSnapshotsResponse, Error>>;
```

`listBucketSnapshots` accepts the following parameters:

- `sourceBucketName`: (Optional) A string specifying the name of the bucket. If not provided, uses the bucket from environment configuration.
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `listBucketSnapshots`, the `data` property will be set to an array of snapshots, each containing:

- `name`: The name of the snapshot (if provided when created)
- `version`: The version identifier of the snapshot
- `creationDate`: The date when the snapshot was created

### Examples

#### List snapshots for the default bucket

```ts
const result = await listBucketSnapshots();

if (result.error) {
  console.error('Error listing snapshots:', result.error);
} else {
  console.log('Snapshots:', result.data);
  // output: [
  //   {
  //     name: "backup-before-migration",
  //     version: "1751631910169675092",
  //     creationDate: Date("2023-01-15T08:30:00Z")
  //   }
  // ]
}
```

#### List snapshots for a specific bucket

```ts
const result = await listBucketSnapshots('my-bucket');

if (result.error) {
  console.error('Error listing snapshots:', result.error);
} else {
  console.log('Snapshots for my-bucket:', result.data);
}
```

## Updating a bucket

`updateBucket` function can be used to update bucket-level settings such as access, locations, cache control, custom domain, and delete protection.

### `updateBucket`

```ts
updateBucket(bucketName: string, options?: UpdateBucketOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`updateBucket` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**            | **Required** | **Values**                                                                                                          |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| access                   | No           | `public` or `private`. Set the bucket access level.                                                                 |
| allowObjectAcl           | No           | Whether to allow per-object ACL settings.                                                                           |
| disableDirectoryListing  | No           | Whether to disable directory listing for the bucket.                                                                |
| locations                | No           | Bucket location configuration. See [Locations](#bucket-locations).                                                  |
| cacheControl             | No           | Set the Cache-Control header for the bucket.                                                                        |
| customDomain             | No           | Set a custom domain for the bucket.                                                                                 |
| enableAdditionalHeaders  | No           | Enable additional HTTP headers (e.g., `X-Content-Type-Options: nosniff`).                                           |
| enableDeleteProtection   | No           | Enable or disable delete protection for the bucket.                                                                 |
| regions                  | No           | **Deprecated.** Use `locations` instead.                                                                            |
| config                   | No           | A configuration object to override the [default configuration](#authentication).                                    |

In case of successful `updateBucket`, the `data` property will be set and contains:

- `bucket`: The name of the updated bucket
- `updated`: Whether the update was successful

### Examples

#### Make a bucket public

```ts
const result = await updateBucket('my-bucket', {
  access: 'public',
});

if (result.error) {
  console.error('Error updating bucket:', result.error);
} else {
  console.log('Bucket updated:', result.data);
}
```

#### Enable delete protection and set a custom domain

```ts
const result = await updateBucket('my-bucket', {
  enableDeleteProtection: true,
  customDomain: 'assets.example.com',
});
```

## Setting bucket CORS

`setBucketCors` function can be used to configure CORS rules on a bucket.

### `setBucketCors`

```ts
setBucketCors(bucketName: string, options?: SetBucketCorsOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`setBucketCors` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| rules         | Yes          | An array of CORS rules. See below.                                               |
| override      | No           | When `false` (default), new rules are appended to existing rules. When `true`, existing rules are replaced.  |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

Each CORS rule has the following properties:

| **Property**   | **Required** | **Values**                                                                                                               |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| allowedOrigins | Yes          | A string or array of allowed origins. Use `'*'` for all origins.                                                         |
| allowedMethods | No           | A string or array of HTTP methods (`GET`, `HEAD`, `PUT`, `POST`, `DELETE`, `OPTIONS`, `PATCH`, `TRACE`, `CONNECT`).      |
| allowedHeaders | No           | A string or array of allowed headers. Use `'*'` for all headers.                                                         |
| exposeHeaders  | No           | A string or array of headers to expose to the browser.                                                                   |
| maxAge         | No           | The max age in seconds for preflight request caching. Must be a positive integer.                                        |

### Examples

#### Set CORS rules

```ts
const result = await setBucketCors('my-bucket', {
  rules: [
    {
      allowedOrigins: ['https://example.com', 'https://app.example.com'],
      allowedMethods: ['GET', 'PUT', 'POST'],
      allowedHeaders: '*',
      maxAge: 3600,
    },
  ],
});
```

#### Clear all CORS rules

```ts
const result = await setBucketCors('my-bucket', { rules: [] });
```

## Setting bucket lifecycle

`setBucketLifecycle` function can be used to configure lifecycle transition rules on a bucket. Only one lifecycle transition rule is allowed per bucket.

### `setBucketLifecycle`

```ts
setBucketLifecycle(bucketName: string, options?: SetBucketLifecycleOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`setBucketLifecycle` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**  | **Required** | **Values**                                                                       |
| -------------- | ------------ | -------------------------------------------------------------------------------- |
| lifecycleRules | Yes          | An array with a single lifecycle rule. See below.                                |
| config         | No           | A configuration object to override the [default configuration](#authentication). |

Each lifecycle rule has the following properties:

| **Property** | **Required** | **Values**                                                                              |
| ------------ | ------------ | --------------------------------------------------------------------------------------- |
| storageClass | No           | Target storage class: `STANDARD_IA`, `GLACIER`, or `GLACIER_IR`.                        |
| days         | No           | Number of days after object creation to transition. Cannot be combined with `date`.     |
| date         | No           | A specific date to transition objects. Cannot be combined with `days`.                  |
| enabled      | No           | Whether the rule is enabled.                                                            |

### Examples

#### Transition objects to infrequent access after 30 days

```ts
const result = await setBucketLifecycle('my-bucket', {
  lifecycleRules: [
    {
      storageClass: 'STANDARD_IA',
      days: 30,
      enabled: true,
    },
  ],
});
```

## Setting bucket migration

`setBucketMigration` function can be used to configure data migration from an external S3-compatible storage provider.

### `setBucketMigration`

```ts
setBucketMigration(bucketName: string, options?: SetBucketMigrationOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`setBucketMigration` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| dataMigration | Yes          | Migration configuration object. See below.                                       |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

The migration configuration object:

| **Property** | **Required** | **Values**                                                      |
| ------------ | ------------ | --------------------------------------------------------------- |
| enabled      | Yes          | Whether migration is enabled.                                   |
| accessKey    | Yes*         | Access key for the source S3 bucket. Required when enabled.     |
| secretKey    | Yes*         | Secret key for the source S3 bucket. Required when enabled.     |
| region       | Yes*         | Region of the source S3 bucket. Required when enabled.          |
| name         | Yes*         | Name of the source S3 bucket. Required when enabled.            |
| endpoint     | Yes*         | Endpoint URL of the source S3 provider. Required when enabled.  |
| writeThrough | No           | Whether to write through to the source bucket. Default `false`. |

### Examples

#### Enable migration from AWS S3

```ts
const result = await setBucketMigration('my-bucket', {
  dataMigration: {
    enabled: true,
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    name: 'source-bucket',
    endpoint: 'https://s3.amazonaws.com',
  },
});
```

#### Disable migration

```ts
const result = await setBucketMigration('my-bucket', {
  dataMigration: { enabled: false },
});
```

## Setting bucket notifications

`setBucketNotifications` function can be used to configure webhook notifications for object events on a bucket.

### `setBucketNotifications`

```ts
setBucketNotifications(bucketName: string, options: SetBucketNotificationsOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`setBucketNotifications` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Required) A JSON object with the following parameters:

#### `options`

| **Parameter**      | **Required** | **Values**                                                                                                          |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| notificationConfig | Yes          | Notification configuration object. See below.                                                                       |
| override           | No           | When `true`, replaces existing config. When `false` (default), merges with existing config.                         |
| config             | No           | A configuration object to override the [default configuration](#authentication).                                    |

The notification configuration object:

| **Property** | **Required** | **Values**                                                                                                                 |
| ------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| enabled      | No           | Whether notifications are enabled.                                                                                         |
| url          | No           | The webhook URL (must use http or https). Required when creating a new configuration.                                      |
| filter       | No           | A filter string to match object keys.                                                                                      |
| auth         | No           | Authentication for the webhook. Either `{ token: string }` or `{ username: string, password: string }`. Cannot use both.  |

Pass an empty object `{}` as `notificationConfig` to clear all notifications. When only `enabled` is provided, the existing configuration is preserved with the new enabled state.

### Examples

#### Set up webhook notifications with token auth

```ts
const result = await setBucketNotifications('my-bucket', {
  notificationConfig: {
    enabled: true,
    url: 'https://api.example.com/webhook',
    filter: 'images/',
    auth: { token: 'my-secret-token' },
  },
});
```

#### Set up webhook notifications with basic auth

```ts
const result = await setBucketNotifications('my-bucket', {
  notificationConfig: {
    enabled: true,
    url: 'https://api.example.com/webhook',
    auth: { username: 'user', password: 'pass' },
  },
});
```

#### Disable notifications

```ts
const result = await setBucketNotifications('my-bucket', {
  notificationConfig: { enabled: false },
});
```

#### Clear notifications entirely

```ts
const result = await setBucketNotifications('my-bucket', {
  notificationConfig: {},
});
```

## Setting bucket TTL

`setBucketTtl` function can be used to configure object expiration (TTL) for a bucket.

### `setBucketTtl`

```ts
setBucketTtl(bucketName: string, options?: SetBucketTtlOptions): Promise<TigrisStorageResponse<UpdateBucketResponse, Error>>;
```

`setBucketTtl` accepts the following parameters:

- `bucketName`: (Required) A string specifying the name of the bucket
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| ttlConfig     | Yes          | TTL configuration object. See below.                                             |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

The TTL configuration object:

| **Property** | **Required** | **Values**                                                                       |
| ------------ | ------------ | -------------------------------------------------------------------------------- |
| enabled      | No           | Whether TTL is enabled.                                                          |
| days         | No           | Number of days after which objects expire. Cannot be combined with `date`.       |
| date         | No           | A specific date when objects expire. Cannot be combined with `days`.             |

### Examples

#### Expire objects after 90 days

```ts
const result = await setBucketTtl('my-bucket', {
  ttlConfig: {
    enabled: true,
    days: 90,
  },
});
```

#### Set a specific expiration date

```ts
const result = await setBucketTtl('my-bucket', {
  ttlConfig: {
    enabled: true,
    date: '2025-12-31',
  },
});
```

## Updating an object

`updateObject` function can be used to rename an object or change its access level.

### `updateObject`

```ts
updateObject(path: string, options?: UpdateObjectOptions): Promise<TigrisStorageResponse<UpdateObjectResponse, Error>>;
```

`updateObject` accepts the following parameters:

- `path`: (Required) A string specifying the current path to the object
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| key           | No           | The new key (path) for the object. Renames the object.                           |
| access        | No           | `public` or `private`. Change the access level of the object.                    |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

At least one of `key` or `access` must be provided.

In case of successful `updateObject`, the `data` property will be set and contains:

- `path`: The final path of the object (new path if renamed, original path otherwise)

### Examples

#### Rename an object

```ts
const result = await updateObject('old-name.txt', {
  key: 'new-name.txt',
});

if (result.error) {
  console.error('Error updating object:', result.error);
} else {
  console.log('Object renamed to:', result.data?.path);
}
```

#### Change an object's access level

```ts
const result = await updateObject('photo.jpg', {
  access: 'public',
});
```

#### Rename and change access level

```ts
const result = await updateObject('draft.pdf', {
  key: 'published/document.pdf',
  access: 'public',
});
```

## Getting storage statistics

`getStats` function can be used to retrieve storage statistics including bucket-level details.

### `getStats`

```ts
getStats(options?: GetStatsOptions): Promise<TigrisStorageResponse<StatsResponse, Error>>;
```

`getStats` accepts the following parameters:

- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter** | **Required** | **Values**                                                                       |
| ------------- | ------------ | -------------------------------------------------------------------------------- |
| config        | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `getStats`, the `data` property will be set and contains:

- `stats`: Overall storage statistics
  - `activeBuckets`: Number of active buckets
  - `totalObjects`: Total number of objects
  - `totalStorageBytes`: Total storage used in bytes
  - `totalUniqueObjects`: Total number of unique objects
- `buckets`: Array of bucket details, each containing:
  - `name`: Bucket name
  - `creationDate`: Bucket creation date
  - `type`: `'Regular'` or `'Snapshot'`
  - `regions`: Array of region strings
  - `visibility`: `'public'` or `'private'`
  - `forkInfo`: Fork information (or `undefined`)

### Examples

#### Get storage statistics

```ts
const result = await getStats();

if (result.error) {
  console.error('Error getting stats:', result.error);
} else {
  console.log('Active buckets:', result.data?.stats.activeBuckets);
  console.log('Total storage:', result.data?.stats.totalStorageBytes, 'bytes');
  console.log('Buckets:', result.data?.buckets);
}
```

## Low-level Multipart Uploads

For advanced use cases where you need full control over the multipart upload process, the SDK provides low-level multipart upload functions. For most use cases, use the `put` function with `multipart: true` instead.

### `initMultipartUpload`

Initializes a multipart upload and returns an upload ID.

```ts
initMultipartUpload(path: string, options?: InitMultipartUploadOptions): Promise<TigrisStorageResponse<InitMultipartUploadResponse, Error>>;
```

- `path`: (Required) The object key
- `options`: (Optional) `{ config }` to override the [default configuration](#authentication)

Returns `{ uploadId: string }` on success.

### `getPartsPresignedUrls`

Generates presigned URLs for uploading individual parts.

```ts
getPartsPresignedUrls(path: string, parts: number[], uploadId: string, options?: GetPartsPresignedUrlsOptions): Promise<TigrisStorageResponse<GetPartsPresignedUrlsResponse, Error>>;
```

- `path`: (Required) The object key (must match the key used in `initMultipartUpload`)
- `parts`: (Required) Array of part numbers (e.g., `[1, 2, 3]`)
- `uploadId`: (Required) The upload ID from `initMultipartUpload`
- `options`: (Optional) `{ config }` to override the [default configuration](#authentication)

Returns an array of `{ part: number, url: string }` on success.

### `completeMultipartUpload`

Completes a multipart upload after all parts have been uploaded.

```ts
completeMultipartUpload(path: string, uploadId: string, partIds: Array<{ [key: number]: string }>, options?: CompleteMultipartUploadOptions): Promise<TigrisStorageResponse<CompleteMultipartUploadResponse, Error>>;
```

- `path`: (Required) The object key
- `uploadId`: (Required) The upload ID from `initMultipartUpload`
- `partIds`: (Required) Array of objects mapping part numbers to their ETags (e.g., `[{ 1: 'etag1' }, { 2: 'etag2' }]`)
- `options`: (Optional) `{ config }` to override the [default configuration](#authentication)

Returns `{ path: string, url: string }` on success.

### Example

```ts
// 1. Initialize the multipart upload
const init = await initMultipartUpload('large-file.zip');
if (init.error) throw init.error;

const { uploadId } = init.data;

// 2. Get presigned URLs for each part
const urls = await getPartsPresignedUrls('large-file.zip', [1, 2, 3], uploadId);
if (urls.error) throw urls.error;

// 3. Upload each part using the presigned URLs
const partIds: Array<{ [key: number]: string }> = [];
for (const { part, url } of urls.data) {
  const response = await fetch(url, {
    method: 'PUT',
    body: getPartData(part), // your function to get the part data
  });
  partIds.push({ [part]: response.headers.get('etag')! });
}

// 4. Complete the multipart upload
const result = await completeMultipartUpload('large-file.zip', uploadId, partIds);
if (result.error) {
  console.error('Error completing upload:', result.error);
} else {
  console.log('Upload complete:', result.data?.url);
}
```

## Client Uploads

Amongst all the other great features of Tigris, free egress fees is another example of what makes us stand out from other providers. We care about the bandwidth costs and we want to make it as cheap as possible for you to use Tigris. That's why we've made it so that you can upload files directly to Tigris from the client side.

We leverage the [presigned URLs](https://tigrisdata.com/docs/sdks/tigris/using-sdk#presigning-an-object) features to allow you to upload files directly to Tigris from the client side.

Client side uploads are a great way to upload objects to a bucket directly from the browser as it allows you to upload objects to a bucket without having to proxy the objects through your server saving costs on bandwidth.

### Uploading an object

You can use the `upload` method from `client` package to upload objects directly to Tigris from the client side.

```ts
import { upload } from '@tigrisdata/storage/client';
```

`upload` accepts the following parameters:

- `name`: (Required) A string specifying the name of object
- `body`: (Required) A blob object as File or Blob
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**      | **Required** | **Values**                                                                                                    |
| ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| url                | Yes          | The URL of your upload endpoint that handles client uploads.                                                  |
| access             | No           | The access level for the object. Possible values are `public` and `private`.                                  |
| addRandomSuffix    | No           | Whether to add a random suffix to the object name. Default is `false`.                                        |
| allowOverwrite     | No           | Whether to allow overwriting the object. Default is `true`.                                                   |
| contentType        | No           | Set the content type of the object. If not provided, inferred from the file.                                  |
| contentDisposition | No           | Set the content disposition. Possible values are `inline` and `attachment`.                                   |
| multipart          | No           | Enable multipart upload for large files. Default is `false`.                                                  |
| partSize           | No           | Part size in bytes for multipart uploads. Default is 5MB.                                                     |
| concurrency        | No           | Maximum number of concurrent part uploads for multipart uploads. Default is `4`.                              |
| onUploadProgress   | No           | Callback to track upload progress: `onUploadProgress({loaded: number, total: number, percentage: number})`.   |

In case of successful upload, the `data` property will be set to the upload and contains the following properties:

- `contentDisposition`: content disposition of the object
- `contentType`: content type of the object
- `modified`: Last modified date of the object
- `name`: Name of the object
- `size`: Size of the object
- `url`: A presigned URL to the object

### Example

```html
<input type="file" onchange="handleFileChange(event)" />

<script>
  function handleFileChange(event) {
    const file = event.target.files[0];
    upload('file.txt', file, {
      url: '/api/upload',
      access: 'private',
      multipart: true,
      onUploadProgress: ({ loaded, total, percentage }) => {
        console.log(`Uploaded ${loaded} of ${total} bytes (${percentage}%)`);
      },
    });
  }
</script>
```

You can see a full example [here](https://tigrisdata.com/docs/sdks/tigris/examples#client-uploads).

## More Examples

If you want to see it the Storage SDK used with your tool of choice, we have some ready examples available at [our community repo](https://github.com/tigrisdata-community/storage-sdk-examples). Something missing there that you you'd like to see? Open an issue and we'll be more than happy to add in examples.
