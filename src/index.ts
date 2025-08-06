export * from './lib/get';
export * from './lib/list';
export * from './lib/head';
export * from './lib/remove';
export * from './lib/put';

import { get } from './lib/get';
import { list } from './lib/list';
import { head } from './lib/head';
import { remove } from './lib/remove';
import { put } from './lib/put';

import fs from 'fs';

const file = fs.readFileSync(
  '/Users/designcode/Downloads/services-2024.csv.gz'
);

put('test123.txt', file.toString(), {
  contentType: 'application/json',
  contentDisposition: 'attachment',
  multipart: true,
  allowOverwrite: true,
  onUploadProgress: ({ loaded, total, percentage }) => {
    console.log({ loaded, total, percentage });
  },
}).then((put) => {
  console.log({ put });
});

list;
get;
head;
remove;

/*
list({
  limit: 100,
}).then((res) => {
  console.log('list', res);
});

get('test.json', 'stream', {
  contentType: 'application/json',
}).then((res) => {
  res.pipeTo(
    new WritableStream({
      write(chunk) {
        console.log(chunk);
      },
    })
  );
});

get('test.json', 'string', {
  contentType: 'application/json',
}).then((res) => {
  console.log(res);
});

head('test.json').then((res) => {
  console.log('head', res);
});
*/
