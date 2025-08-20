#!/usr/bin/env node

import { Command } from 'commander';
import { get, put, list, remove } from '../../storage/dist/index.js';

const program = new Command();

program
  .name('tigris')
  .description('Command line interface for Tigris object storage')
  .version('0.0.1');

program
  .command('put')
  .description('Upload a file to Tigris storage')
  .argument('<key>', 'Object key')
  .argument('<file>', 'Local file path')
  .option('-b, --bucket <bucket>', 'Bucket name')
  .action(async (key, file, options) => {
    try {
      const result = await put(key, file, options);
      console.log('Upload successful:', result);
    } catch (error) {
      console.error('Upload failed:', error);
      process.exit(1);
    }
  });

program
  .command('get')
  .description('Download a file from Tigris storage')
  .argument('<key>', 'Object key')
  .option('-b, --bucket <bucket>', 'Bucket name')
  .option('-o, --output <file>', 'Output file path')
  .action(async (key, options) => {
    try {
      const result = await get(key, options);
      console.log('Download successful:', result);
    } catch (error) {
      console.error('Download failed:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List objects in Tigris storage')
  .option('-b, --bucket <bucket>', 'Bucket name')
  .option('-p, --prefix <prefix>', 'Object key prefix')
  .action(async (options) => {
    try {
      const result = await list(options);
      console.log('Objects:', result);
    } catch (error) {
      console.error('List failed:', error);
      process.exit(1);
    }
  });

program
  .command('remove')
  .description('Delete an object from Tigris storage')
  .argument('<key>', 'Object key')
  .option('-b, --bucket <bucket>', 'Bucket name')
  .action(async (key, options) => {
    try {
      await remove(key, options);
      console.log('Delete successful');
    } catch (error) {
      console.error('Delete failed:', error);
      process.exit(1);
    }
  });

program.parse();