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

| **Parameter**        | **Required** | **Values**                                                                       |
| -------------------- | ------------ | -------------------------------------------------------------------------------- |
| enableSnapshot       | No           | Enable snapshot versioning for the bucket. Default is `false`.                   |
| sourceBucketName     | No           | The name of the source bucket to fork from.                                      |
| sourceBucketSnapshot | No           | The snapshot version of the source bucket to fork from.                          |
| config               | No           | A configuration object to override the [default configuration](#authentication). |

In case of successful `createBucket`, the `data` property will be set and contains the following properties:

- `isSnapshotEnabled`: Whether snapshot versioning is enabled for the bucket
- `hasForks`: Whether the bucket has forks
- `sourceBucketName`: The name of the source bucket (if created from a fork)
- `sourceBucketSnapshot`: The snapshot version of the source bucket (if created from a fork)

### Examples

#### Create a simple bucket

```ts
const result = await createBucket('my-new-bucket');

if (result.error) {
  console.error('Error creating bucket:', result.error);
} else {
  console.log('Bucket created successfully:', result.data);
}
```

#### Create a bucket with snapshot versioning enabled

```ts
const result = await createBucket('my-versioned-bucket', {
  enableSnapshot: true,
});

if (result.error) {
  console.error('Error creating bucket:', result.error);
} else {
  console.log('Bucket created with snapshots enabled:', result.data);
}
```

#### Create a bucket as a fork of another bucket

```ts
const result = await createBucket('my-forked-bucket', {
  sourceBucketName: 'original-bucket',
  sourceBucketSnapshot: 'snapshot-version-123',
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

- `isSnapshotEnabled`: Whether snapshot versioning is enabled for the bucket
- `hasForks`: Whether the bucket has forks
- `sourceBucketName`: The name of the source bucket (if the bucket is a fork)
- `sourceBucketSnapshot`: The snapshot version of the source bucket (if the bucket is a fork)

### Examples

#### Get bucket information

```ts
const result = await getBucketInfo('my-bucket');

if (result.error) {
  console.error('Error getting bucket info:', result.error);
} else {
  console.log('Bucket info:', result.data);
  // output: {
  //   isSnapshotEnabled: true,
  //   hasForks: false,
  //   sourceBucketName: undefined,
  //   sourceBucketSnapshot: undefined
  // }
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
  // output: { snapshotVersion: "v1234567890" }
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
  //     version: "v1234567890",
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

- `path`: (Required) A string specifying the path to the object
- `body`: (Required) A blob object as File or Blob
- `options`: (Optional) A JSON object with the following optional parameters:

#### `options`

| **Parameter**    | **Required** | **Values**                                                                                                                        |
| ---------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| url              | No           | The URL to upload the file to.                                                                                                    |
| access           | No           | The access level for the object. Possible values are `public` and `private`.                                                      |
| onUploadProgress | No           | Callback to track upload progress: `onUploadProgress({loaded: number, total: number, percentage: number})`.                       |
| config           | No           | A configuration object to override the [default configuration](https://tigrisdata.com/docs/sdks/tigris/using-sdk#authentication). |

In case of successful upload, the `data` property will be set to the upload and contains the following properties:

- `contentDisposition`: content disposition of the object
- `contentType`: content type of the object
- `modified`: Last modified date of the object
- `path`: Path to the object
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
