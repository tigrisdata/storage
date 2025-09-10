import { list, type Item } from '@tigrisdata/storage';

// List first 100 objects
const result = await list({ limit: 2 });

if (result.error) {
  console.error('Error listing files:', result.error);
}

// Pagination example
const allFiles: Item[] = [];
let currentPage = await list({ limit: 2 });

if (currentPage.data) {
  allFiles.push(...currentPage.data.items);

  while (currentPage.data?.hasMore && currentPage.data?.paginationToken) {
    currentPage = await list({
      limit: 2,
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
