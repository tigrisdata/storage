import { head } from '@tigrisdata/storage';

// Get metadata for a specific file
const result = await head('5a9ff94f-8f17-4348-a304-a3f1592a5bf7-bg-2.jpg');

if (result?.error) {
  console.error('Error getting metadata:', result.error);
} else if (result?.data) {
  console.log('File size:', result.data.size);
  console.log('Content type:', result.data.contentType);
  console.log('Content disposition:', result.data.contentDisposition);
  console.log('Last modified:', result.data.modified);
  console.log('Download URL:', result.data.url);
} else {
  console.log('File not found');
}

// Check if file exists
const exists = await head('documents/report.pdf');
if (exists?.data) {
  console.log('File exists, size:', exists.data.size);
} else {
  console.log('File does not exist');
}
