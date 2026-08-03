#!/usr/bin/env node

// `tigris` is an unscoped alias for `@tigrisdata/cli`, so `npx tigris init`
// works without anyone having to remember the scope. Importing the CLI's entry
// point runs it in this process — argv, stdio, signals and the exit code all
// pass through unchanged, and `--version`/help still report the real CLI
// (Commander takes its program name from the specs, not from this file).
import '@tigrisdata/cli';
