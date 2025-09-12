import { put } from '@tigrisdata/storage';

// Upload a text file
const result = await put('documents/hello.txt', 'Hello, World!');
if (result.error) {
  console.error('Error uploading file:', result.error);
} else {
  console.log('Uploaded to:', result.data?.path);
  console.log('File size:', result.data?.size);
  console.log('Download URL:', result.data?.url);
}

// Upload with custom options
const imageBlob = new Blob(['Hello, World!'], { type: 'text/plain' });
const imageResult = await put('images/photo.jpg', imageBlob, {
  contentType: 'image/jpeg',
  access: 'public',
  allowOverwrite: true,
});

console.log(imageResult);

// Upload with progress tracking
const bigFiles = await fetch(
  'http://ipv4.download.thinkbroadband.com/200MB.zip'
).then(async (res) => await res.blob());
const uploadResult = await put('videos/large-file.zip', bigFiles, {
  multipart: true,
  addRandomSuffix: true,
  onUploadProgress: (data) => {
    console.log(
      `Upload progress: ${data.loaded}, ${data.total}, ${data.percentage}`
    );
  },
});

console.log(uploadResult);

// Upload with random suffix
const uniqueResult = await put('images/avatar.jpg', imageBlob, {
  addRandomSuffix: true,
  contentType: 'image/jpeg',
});

console.log(uniqueResult);

// Upload with abort controller
const controller = new AbortController();
const uploadPromise = await put('large-file.zip', imageBlob, {
  abortController: controller,
  multipart: true,
});

console.log(uploadPromise);

setTimeout(() => controller.abort(), 5000);
