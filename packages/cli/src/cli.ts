#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('tigris')
  .description('Command line interface for Tigris object storage')
  .version('0.0.1');

program.parse();
