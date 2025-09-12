import { get } from '@tigrisdata/storage';

const fileName = '9037a9d4-26cc-4602-81e4-dda54e769c95-1.jpg';

// Download as string
const result = await get(fileName, 'string');
if (result.error) {
  console.error('Error downloading file:', result.error);
} else {
  console.log('Content:', result.data);
}

// Download as stream
const streamResult = await get(fileName, 'stream');
if (streamResult.error) {
  console.error('Error downloading stream:', streamResult.error);
} else {
  const reader = streamResult.data?.getReader();
  // Process stream...
  reader?.read().then((result) => {
    console.log(result);
  });
}

// Download as File object
const fileResult = await get(fileName, 'file');
if (fileResult.error) {
  console.error('Error downloading file:', fileResult.error);
} else {
  console.log('File name:', fileResult.data?.name);
  console.log('File size:', fileResult.data?.size);
  console.log('File type:', fileResult.data?.type);
}

const downloadResult = await get(fileName, 'string', {
  contentDisposition: 'attachment',
  contentType: 'application/pdf',
  encoding: 'utf-8',
});

console.log(downloadResult);
