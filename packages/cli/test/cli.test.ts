import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getTestPrefix, shouldSkipIntegrationTests } from './setup.js';

const skipTests = shouldSkipIntegrationTests();

// Helper to run CLI commands with env vars for auth
function runCli(args: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const stdout = execSync(`node dist/cli.js ${args}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin to prevent hanging on prompts
      timeout: 60000, // 60 second timeout per command
      env: {
        ...process.env,
        // Pass through auth env vars
        TIGRIS_STORAGE_ACCESS_KEY_ID: process.env.TIGRIS_STORAGE_ACCESS_KEY_ID,
        TIGRIS_STORAGE_SECRET_ACCESS_KEY:
          process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY,
        TIGRIS_STORAGE_ENDPOINT: process.env.TIGRIS_STORAGE_ENDPOINT,
      },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
      signal?: string;
    };
    // Check if it was a timeout
    if (execError.signal === 'SIGTERM') {
      return {
        stdout: execError.stdout || '',
        stderr: 'Command timed out after 30 seconds',
        exitCode: 124,
      };
    }
    return {
      stdout: execError.stdout || '',
      stderr: execError.stderr || '',
      exitCode: execError.status || 1,
    };
  }
}

// Configure CLI credentials from env vars before tests
function setupCredentials(): boolean {
  const accessKey = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID;
  const secretKey = process.env.TIGRIS_STORAGE_SECRET_ACCESS_KEY;

  if (!accessKey || !secretKey) {
    return false;
  }

  // Use login credentials command to set up auth
  const result = runCli(
    `login credentials --access-key ${accessKey} --access-secret ${secretKey}`
  );
  return result.exitCode === 0;
}

describe('CLI Help Commands', () => {
  it('should show main help', () => {
    const result = runCli('help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Tigris CLI');
    expect(result.stdout).toContain('Commands:');
  });

  it('should show ls help', () => {
    const result = runCli('ls help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ls');
    expect(result.stdout).toContain('List all buckets');
  });

  it('should show cp help', () => {
    const result = runCli('cp help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('cp');
    expect(result.stdout).toContain('src');
    expect(result.stdout).toContain('dest');
  });

  it('should show mv help', () => {
    const result = runCli('mv help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('mv');
    expect(result.stdout).toContain('--force');
  });

  it('should show rm help', () => {
    const result = runCli('rm help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('rm');
    expect(result.stdout).toContain('--force');
  });

  it('should show mk help', () => {
    const result = runCli('mk help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('mk');
    expect(result.stdout).toContain('path');
  });

  it('should show touch help', () => {
    const result = runCli('touch help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('touch');
    expect(result.stdout).toContain('path');
  });

  it('should show stat help', () => {
    const result = runCli('stat help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('stat');
    expect(result.stdout).toContain('path');
  });

  it('should show configure help', () => {
    const result = runCli('configure help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('configure');
    expect(result.stdout).toContain('--access-key');
  });

  it('should show login help', () => {
    const result = runCli('login help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('login');
    expect(result.stdout).toContain('Commands:');
  });

  it('should show whoami help', () => {
    const result = runCli('whoami help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('whoami');
  });

  it('should show buckets help', () => {
    const result = runCli('buckets help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('create');
  });

  it('should show objects help', () => {
    const result = runCli('objects help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('get');
    expect(result.stdout).toContain('put');
  });

  it('should show organizations help', () => {
    const result = runCli('organizations help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('create');
  });

  it('should show orgs alias help', () => {
    const result = runCli('orgs help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
  });

  it('should show forks help', () => {
    const result = runCli('forks help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('create');
  });

  it('should show snapshots help', () => {
    const result = runCli('snapshots help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('take');
  });

  it('should show access-keys help', () => {
    const result = runCli('access-keys help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('create');
    expect(result.stdout).toContain('delete');
  });

  // Nested command tests (iam policies)
  it('should show iam help', () => {
    const result = runCli('iam help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('policies');
  });

  it('should show iam policies help', () => {
    const result = runCli('iam policies help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('get');
    expect(result.stdout).toContain('create');
    expect(result.stdout).toContain('edit');
    expect(result.stdout).toContain('delete');
  });

  it('should show iam policies list help', () => {
    const result = runCli('iam policies list help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('--format');
  });

  it('should support iam alias', () => {
    const result = runCli('iam p help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Commands:');
    expect(result.stdout).toContain('list');
  });
});

describe('Destructive commands require --yes in non-TTY', () => {
  // These tests verify that destructive commands refuse to run without --yes/-y
  // when stdin is not a TTY (piped/scripted mode). Since runCli uses
  // stdio: ['ignore', ...], stdin is not a TTY.

  it('objects delete should require confirmation in non-TTY', () => {
    const result = runCli('objects delete fake-bucket fake-key');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Use --yes to skip confirmation');
  });

  it('buckets delete should require confirmation in non-TTY', () => {
    const result = runCli('buckets delete fake-bucket');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Use --yes to skip confirmation');
  });
});

describe.skipIf(skipTests)('CLI Integration Tests', () => {
  // Generate unique prefix for all test resources
  const testPrefix = getTestPrefix();
  const testBucket = testPrefix;
  const testContent = 'Hello from CLI test';

  /** Prefix a bucket/path with t3:// for commands that require remote paths (cp, mv, rm) */
  const t3 = (path: string) => `t3://${path}`;

  beforeAll(async () => {
    // Setup credentials from .env
    console.log('Setting up credentials from .env...');
    if (!setupCredentials()) {
      console.warn('Failed to setup credentials, tests may fail');
    }

    // Sweep stale test buckets from previous failed runs
    const staleThresholdMs = 30 * 60 * 1000; // 30 minutes
    const listResult = runCli('buckets list --format json');
    if (listResult.exitCode === 0 && listResult.stdout.trim()) {
      try {
        const parsed = JSON.parse(listResult.stdout.trim()) as {
          items: Array<{ name: string; created: string }>;
        };
        const now = Date.now();
        for (const bucket of parsed.items) {
          if (!bucket.name.startsWith('tigris-cli-test-')) continue;
          const age = now - new Date(bucket.created).getTime();
          if (age > staleThresholdMs) {
            console.log(`Sweeping stale test bucket: ${bucket.name}`);
            runCli(`rm ${t3(bucket.name)}/* -r -f`);
            runCli(`rm ${t3(bucket.name)} -f`);
          }
        }
      } catch {
        // Best-effort cleanup — don't block tests
      }
    }

    console.log(`Test prefix: ${testPrefix}`);
    console.log(`Creating test bucket: ${testBucket}`);
    // Use mk command instead of buckets create to avoid interactive prompts
    const result = runCli(`mk ${testBucket} --enable-snapshots`);
    if (result.exitCode !== 0) {
      console.error('Failed to create test bucket:', result.stderr);
      throw new Error('Failed to create test bucket');
    }
  });

  afterAll(async () => {
    console.log(`Cleaning up test bucket: ${testBucket}`);
    // Force remove all objects and the bucket
    runCli(`rm ${t3(testBucket)}/* -f`);
    runCli(`rm ${t3(testBucket)} -f`);
  });

  describe('ls command', () => {
    it('should list buckets', () => {
      const result = runCli('ls');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testBucket);
    });

    it('should list empty bucket', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Key');
    });
  });

  describe('mk command', () => {
    const folderName = 'folder';

    it('should create a folder', () => {
      const result = runCli(`mk ${testBucket}/${folderName}/`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Folder');
      expect(result.stdout).toContain('created');
    });

    it('should show folder in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`${folderName}/`);
    });
  });

  describe('touch command', () => {
    const fileName = 'empty-file.txt';

    it('should create empty object', () => {
      const result = runCli(`touch ${testBucket}/${fileName}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toContain('created');
    });

    it('should show touched file in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(fileName);
    });
  });

  describe('objects put/get commands', () => {
    const putTestFile = 'put-test.txt';

    it('should upload a file', () => {
      // Create a temp file with unique name
      const tempFile = `/tmp/${testPrefix}-${putTestFile}`;
      execSync(`echo "${testContent}" > ${tempFile}`);
      const result = runCli(
        `objects put ${testBucket} ${putTestFile} ${tempFile}`
      );
      expect(result.exitCode).toBe(0);
      // Output shows a table with the file info
      expect(result.stdout).toContain(putTestFile);
    });

    it('should get an object', () => {
      const result = runCli(`objects get ${testBucket} ${putTestFile}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testContent);
    });

    it('should list objects', () => {
      const result = runCli(`objects list ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(putTestFile);
    });
  });

  describe('cp command', () => {
    const srcFile = 'cp-source.txt';
    const destFile = 'cp-dest.txt';

    beforeAll(() => {
      runCli(`touch ${testBucket}/${srcFile}`);
    });

    it('should copy an object within same bucket', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${srcFile} ${t3(testBucket)}/${destFile}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
    });

    it('should show copied object in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(destFile);
    });
  });

  describe('mv command', () => {
    const srcFile = 'mv-source.txt';
    const destFile = 'mv-dest.txt';

    beforeAll(() => {
      runCli(`touch ${testBucket}/${srcFile}`);
    });

    it('should move an object with force flag', () => {
      const result = runCli(
        `mv ${t3(testBucket)}/${srcFile} ${t3(testBucket)}/${destFile} -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
    });

    it('should not show source after move', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(srcFile);
      expect(result.stdout).toContain(destFile);
    });
  });

  describe('rm command', () => {
    const fileName = 'rm-test.txt';

    beforeAll(() => {
      runCli(`touch ${testBucket}/${fileName}`);
    });

    it('should remove an object with force flag', () => {
      const result = runCli(`rm ${t3(testBucket)}/${fileName} -f`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed');
    });

    it('should not show removed object in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(fileName);
    });
  });

  describe('folder auto-detection', () => {
    const autoFolder = 'autodetect';
    const copiedFolder = 'copied';
    const movedFolder = 'moved';

    beforeAll(() => {
      // Create a folder structure
      runCli(`mk ${testBucket}/${autoFolder}/`);
      runCli(`touch ${testBucket}/${autoFolder}/file1.txt`);
      runCli(`touch ${testBucket}/${autoFolder}/file2.txt`);
    });

    it('should auto-detect folder for cp without trailing slash', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${autoFolder} ${t3(testBucket)}/${copiedFolder} -r`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain('2 object(s)');
    });

    it('should auto-detect folder for mv without trailing slash', () => {
      const result = runCli(
        `mv ${t3(testBucket)}/${copiedFolder} ${t3(testBucket)}/${movedFolder} -r -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      // cp nests: autodetect → copied/autodetect/ (marker + 2 files = 3)
      expect(result.stdout).toContain('3 object(s)');
    });

    it('should auto-detect folder for rm without trailing slash', () => {
      const result = runCli(`rm ${t3(testBucket)}/${movedFolder} -r -f`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed');
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/${autoFolder} -r -f`);
    });
  });

  describe('empty folder operations', () => {
    const emptyFolder = 'empty-folder';
    const copiedEmptyFolder = 'copied-empty';
    const movedEmptyFolder = 'moved-empty';

    beforeAll(() => {
      // Create an empty folder (just the folder marker, no contents)
      runCli(`mk ${testBucket}/${emptyFolder}/`);
    });

    it('should copy an empty folder', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${emptyFolder}/ ${t3(testBucket)}/${copiedEmptyFolder}/ -r`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain('1 object(s)');
    });

    it('should show copied empty folder in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`${copiedEmptyFolder}/`);
    });

    it('should move an empty folder', () => {
      const result = runCli(
        `mv ${t3(testBucket)}/${copiedEmptyFolder}/ ${t3(testBucket)}/${movedEmptyFolder}/ -r -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain('1 object(s)');
    });

    it('should not show source after moving empty folder', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(`${copiedEmptyFolder}/`);
      expect(result.stdout).toContain(`${movedEmptyFolder}/`);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/${emptyFolder}/ -r -f`);
      runCli(`rm ${t3(testBucket)}/${movedEmptyFolder}/ -r -f`);
    });
  });

  describe('file to folder operations', () => {
    const targetFolder = 'target-folder';
    const srcFile = 'src-file-to-folder.txt';
    const srcFile2 = 'src-file-to-folder2.txt';
    const srcFile3 = 'src-file-to-folder3.txt';

    beforeAll(() => {
      // Create target folder and source files
      runCli(`mk ${testBucket}/${targetFolder}/`);
      runCli(`touch ${testBucket}/${srcFile}`);
      runCli(`touch ${testBucket}/${srcFile2}`);
      runCli(`touch ${testBucket}/${srcFile3}`);
    });

    it('should copy file to existing folder (auto-detect)', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${srcFile} ${t3(testBucket)}/${targetFolder}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain(`${targetFolder}/${srcFile}`);
    });

    it('should copy file to explicit folder path (trailing slash)', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${srcFile2} ${t3(testBucket)}/${targetFolder}/`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain(`${targetFolder}/${srcFile2}`);
    });

    it('should move file to existing folder with force flag', () => {
      const result = runCli(
        `mv ${t3(testBucket)}/${srcFile3} ${t3(testBucket)}/${targetFolder} -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain(`${targetFolder}/${srcFile3}`);
    });

    it('should show all files inside target folder', () => {
      const result = runCli(`ls ${testBucket}/${targetFolder}/`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(srcFile);
      expect(result.stdout).toContain(srcFile2);
      expect(result.stdout).toContain(srcFile3);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/${targetFolder}/ -r -f`);
      runCli(`rm ${t3(testBucket)}/${srcFile} -f`);
      runCli(`rm ${t3(testBucket)}/${srcFile2} -f`);
    });
  });

  describe('error cases', () => {
    it('should error on cp without arguments', () => {
      const result = runCli('cp');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should error on mv without arguments', () => {
      const result = runCli('mv');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should error on rm without arguments', () => {
      const result = runCli('rm');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should error on cp with bucket-only source', () => {
      const result = runCli(`cp ${t3(testBucket)} ${t3(testBucket)}-other/`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot copy a bucket');
    });

    it('should error on mv with bucket-only source', () => {
      const result = runCli(`mv ${t3(testBucket)} ${t3(testBucket)}-other/`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot move a bucket');
    });
  });

  describe('wildcard operations', () => {
    const wildcardPrefix = 'wc';

    beforeAll(() => {
      runCli(`touch ${testBucket}/${wildcardPrefix}-a.txt`);
      runCli(`touch ${testBucket}/${wildcardPrefix}-b.txt`);
      runCli(`touch ${testBucket}/${wildcardPrefix}-c.txt`);
    });

    it('should remove files matching wildcard pattern', () => {
      const result = runCli(`rm ${t3(testBucket)}/${wildcardPrefix}-* -f`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed');
      expect(result.stdout).toContain('3 object(s)');
    });

    it('should not show wildcard files after removal', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(`${wildcardPrefix}-`);
    });
  });

  describe('wildcard folder marker operations', () => {
    const wcFolder = 'wc-folder';
    const wcCopied = 'wc-copied';
    const wcMoved = 'wc-moved';

    beforeAll(() => {
      // Create a folder with files
      runCli(`mk ${testBucket}/${wcFolder}/`);
      runCli(`touch ${testBucket}/${wcFolder}/file1.txt`);
      runCli(`touch ${testBucket}/${wcFolder}/file2.txt`);
    });

    it('should copy folder contents and marker using wildcard', () => {
      const result = runCli(
        `cp ${t3(testBucket)}/${wcFolder}/* ${t3(testBucket)}/${wcCopied}/`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain('2 object(s)');
    });

    it('should show copied folder marker in ls', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`${wcCopied}/`);
    });

    it('should move folder contents and marker using wildcard', () => {
      const result = runCli(
        `mv ${t3(testBucket)}/${wcCopied}/* ${t3(testBucket)}/${wcMoved}/ -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain('2 object(s)');
    });

    it('should not show source folder after wildcard move', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(`${wcCopied}/`);
      expect(result.stdout).toContain(`${wcMoved}/`);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/${wcFolder}/ -r -f`);
      runCli(`rm ${t3(testBucket)}/${wcMoved}/ -r -f`);
    });
  });

  // ─── Section A: Missing branches in already-tested commands ───

  describe('mk command - bucket creation variants', () => {
    const mkBuckets: string[] = [];

    afterAll(() => {
      for (const b of mkBuckets) {
        runCli(`rm ${t3(b)} -f`);
      }
    });

    it('should create a public bucket with --public', () => {
      const name = `${testPrefix}-mk-pub`;
      mkBuckets.push(name);
      const result = runCli(`mk ${name} --public`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('created');
    });

    it('should create a bucket with --enable-snapshots', () => {
      const name = `${testPrefix}-mk-snap`;
      mkBuckets.push(name);
      const result = runCli(`mk ${name} --enable-snapshots`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('created');

      // Verify snapshots enabled via buckets get (table format)
      const info = runCli(`buckets get ${name}`);
      expect(info.exitCode).toBe(0);
      expect(info.stdout).toContain('Snapshots Enabled');
      expect(info.stdout).toContain('Yes');
    });

    it('should create a bucket with --default-tier STANDARD_IA', () => {
      const name = `${testPrefix}-mk-tier`;
      mkBuckets.push(name);
      const result = runCli(`mk ${name} --default-tier STANDARD_IA`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('created');
    });

    it('should create a bucket with --locations usa', () => {
      const name = `${testPrefix}-mk-loc`;
      mkBuckets.push(name);
      const result = runCli(`mk ${name} --locations usa`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('created');
    });

    it('should create a bucket with --fork-of', () => {
      const name = `${testPrefix}-mk-fork`;
      mkBuckets.push(name);
      const result = runCli(`mk ${name} --fork-of ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('created');
    });

    it('should error on --source-snapshot without --fork-of', () => {
      const result = runCli(
        `mk ${testPrefix}-mk-nofork --source-snapshot snap1`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--source-snapshot requires --fork-of');
    });

    it('should error on no path argument', () => {
      const result = runCli('mk');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });
  });

  describe('touch command - validation', () => {
    it('should error on bucket-only path', () => {
      const result = runCli(`touch ${testBucket}`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Object key is required');
    });
  });

  describe('cp command - local/remote operations', () => {
    const tmpBase = join(tmpdir(), `cli-test-cp-${testPrefix}`);

    beforeAll(() => {
      mkdirSync(tmpBase, { recursive: true });
      // Create test content remotely for download tests
      const tmpUp = join(tmpBase, 'upload-src.txt');
      writeFileSync(tmpUp, testContent);
      runCli(`objects put ${testBucket} cp-dl-test.txt ${tmpUp}`);
    });

    afterAll(() => {
      rmSync(tmpBase, { recursive: true, force: true });
      runCli(`rm ${t3(testBucket)}/cp-dl-test.txt -f`);
      runCli(`rm ${t3(testBucket)}/cp-ul-test.txt -f`);
      runCli(`rm ${t3(testBucket)}/cp-ul-dir/ -r -f`);
      runCli(`rm ${t3(testBucket)}/cp-wc-dest/ -r -f`);
      runCli(`rm ${t3(testBucket)}/cp-dl-dir/ -r -f`);
    });

    it('should download a remote file to local path', () => {
      const localDest = join(tmpBase, 'downloaded.txt');
      const result = runCli(`cp ${t3(testBucket)}/cp-dl-test.txt ${localDest}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Downloaded');
      expect(existsSync(localDest)).toBe(true);
    });

    it('should upload a local file to remote', () => {
      const localSrc = join(tmpBase, 'to-upload.txt');
      writeFileSync(localSrc, 'upload test content');
      const result = runCli(`cp ${localSrc} ${t3(testBucket)}/cp-ul-test.txt`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Uploaded');

      // Verify it exists
      const ls = runCli(`ls ${testBucket}`);
      expect(ls.stdout).toContain('cp-ul-test.txt');
    });

    it('should upload a local directory recursively with -r', () => {
      const localDir = join(tmpBase, 'upload-dir');
      mkdirSync(localDir, { recursive: true });
      writeFileSync(join(localDir, 'a.txt'), 'file-a');
      writeFileSync(join(localDir, 'b.txt'), 'file-b');
      const result = runCli(`cp ${localDir}/ ${t3(testBucket)}/cp-ul-dir/ -r`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Uploaded');
      expect(result.stdout).toContain('2 file(s)');
    });

    it('should download a remote directory recursively with -r', () => {
      // Create remote files
      runCli(`touch ${testBucket}/cp-dl-dir/x.txt`);
      runCli(`touch ${testBucket}/cp-dl-dir/y.txt`);
      const localDest = join(tmpBase, 'dl-dir');
      mkdirSync(localDest, { recursive: true });
      const result = runCli(`cp ${t3(testBucket)}/cp-dl-dir/ ${localDest} -r`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Downloaded');
      expect(result.stdout).toContain('2 file(s)');
    });

    it('should copy objects matching wildcard pattern', () => {
      runCli(`touch ${testBucket}/cp-wc-a.txt`);
      runCli(`touch ${testBucket}/cp-wc-b.txt`);
      const result = runCli(
        `cp ${t3(testBucket)}/cp-wc-* ${t3(testBucket)}/cp-wc-dest/`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain('2 object(s)');

      // Cleanup source wildcard files
      runCli(`rm ${t3(testBucket)}/cp-wc-a.txt -f`);
      runCli(`rm ${t3(testBucket)}/cp-wc-b.txt -f`);
    });
  });

  describe('mv command - additional branches', () => {
    it('should move objects matching wildcard with -f', () => {
      runCli(`touch ${testBucket}/mv-wc-a.txt`);
      runCli(`touch ${testBucket}/mv-wc-b.txt`);
      const result = runCli(
        `mv ${t3(testBucket)}/mv-wc-* ${t3(testBucket)}/mv-wc-dest/ -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain('2 object(s)');

      // Cleanup
      runCli(`rm ${t3(testBucket)}/mv-wc-dest/ -r -f`);
    });

    it('should error on folder move without -r', () => {
      runCli(`mk ${testBucket}/mv-no-r/`);
      runCli(`touch ${testBucket}/mv-no-r/file.txt`);
      const result = runCli(
        `mv ${t3(testBucket)}/mv-no-r ${t3(testBucket)}/mv-no-r-dest -f`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Use -r to move recursively');

      // Cleanup
      runCli(`rm ${t3(testBucket)}/mv-no-r/ -r -f`);
    });
  });

  describe('rm command - additional branches', () => {
    it('should delete a bucket with -f', () => {
      const name = `${testPrefix}-rm-bkt`;
      runCli(`mk ${name}`);
      const result = runCli(`rm ${t3(name)} -f`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Removed bucket '${name}'`);
    });

    it('should error on folder removal without -r', () => {
      runCli(`mk ${testBucket}/rm-no-r/`);
      runCli(`touch ${testBucket}/rm-no-r/file.txt`);
      const result = runCli(`rm ${t3(testBucket)}/rm-no-r -f`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Use -r to remove recursively');

      // Cleanup
      runCli(`rm ${t3(testBucket)}/rm-no-r/ -r -f`);
    });
  });

  describe('objects get - additional branches', () => {
    const tmpBase = join(tmpdir(), `cli-test-objget-${testPrefix}`);

    beforeAll(() => {
      mkdirSync(tmpBase, { recursive: true });
      // Upload a text file for get tests
      const tmpFile = join(tmpBase, 'src.txt');
      writeFileSync(tmpFile, testContent);
      runCli(`objects put ${testBucket} objget-test.txt ${tmpFile}`);
    });

    afterAll(() => {
      rmSync(tmpBase, { recursive: true, force: true });
      runCli(`rm ${t3(testBucket)}/objget-test.txt -f`);
    });

    it('should get object with --output to file', () => {
      const outPath = join(tmpBase, 'output.txt');
      const result = runCli(
        `objects get ${testBucket} objget-test.txt --output ${outPath}`
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      const content = readFileSync(outPath, 'utf-8');
      expect(content).toContain(testContent);
    });

    it('should get object with --mode string', () => {
      const result = runCli(
        `objects get ${testBucket} objget-test.txt --mode string`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testContent);
    });
  });

  describe('objects put - additional branches', () => {
    const tmpBase = join(tmpdir(), `cli-test-objput-${testPrefix}`);

    beforeAll(() => {
      mkdirSync(tmpBase, { recursive: true });
    });

    afterAll(() => {
      rmSync(tmpBase, { recursive: true, force: true });
      runCli(`rm ${t3(testBucket)}/objput-pub.txt -f`);
      runCli(`rm ${t3(testBucket)}/objput-ct.json -f`);
      runCli(`rm ${t3(testBucket)}/objput-fmt.txt -f`);
    });

    it('should upload with --access public', () => {
      const tmpFile = join(tmpBase, 'pub.txt');
      writeFileSync(tmpFile, 'public content');
      const result = runCli(
        `objects put ${testBucket} objput-pub.txt ${tmpFile} --access public`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should upload with --content-type application/json', () => {
      const tmpFile = join(tmpBase, 'ct.json');
      writeFileSync(tmpFile, '{"key":"value"}');
      const result = runCli(
        `objects put ${testBucket} objput-ct.json ${tmpFile} --content-type application/json`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should upload with --format json', () => {
      const tmpFile = join(tmpBase, 'fmt.txt');
      writeFileSync(tmpFile, 'format test');
      const result = runCli(
        `objects put ${testBucket} objput-fmt.txt ${tmpFile} --format json`
      );
      expect(result.exitCode).toBe(0);
      // stdout contains progress line then JSON; extract just the JSON portion
      const jsonStart = result.stdout.indexOf('[');
      expect(jsonStart).toBeGreaterThanOrEqual(0);
      expect(() => JSON.parse(result.stdout.slice(jsonStart))).not.toThrow();
    });
  });

  describe('objects list - additional branches', () => {
    beforeAll(() => {
      runCli(`touch ${testBucket}/objlist-a.txt`);
      runCli(`touch ${testBucket}/objlist-b.txt`);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/objlist-a.txt -f`);
      runCli(`rm ${t3(testBucket)}/objlist-b.txt -f`);
    });

    it('should list with --prefix filter', () => {
      const result = runCli(`objects list ${testBucket} --prefix objlist-a`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('objlist-a.txt');
      expect(result.stdout).not.toContain('objlist-b.txt');
    });

    it('should list with --format json', () => {
      const result = runCli(`objects list ${testBucket} --format json`);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    });

    it('should handle empty results gracefully', () => {
      const result = runCli(
        `objects list ${testBucket} --prefix nonexistent-prefix-xyz`
      );
      expect(result.exitCode).toBe(0);
    });
  });

  // ─── Section B: Completely untested commands ───

  describe('stat command', () => {
    beforeAll(() => {
      runCli(`touch ${testBucket}/stat-test.txt`);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/stat-test.txt -f`);
    });

    it('should show overall stats (no path)', () => {
      const result = runCli('stat');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Active Buckets');
      expect(result.stdout).toContain('Total Objects');
    });

    it('should show bucket info', () => {
      const result = runCli(`stat ${testBucket}`);
      expect(result.exitCode).toBe(0);
      // Bucket stat shows a table with metrics
      expect(result.stdout).toContain('Metric');
    });

    it('should show object metadata', () => {
      const result = runCli(`stat ${testBucket}/stat-test.txt`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Size');
      expect(result.stdout).toContain('Content-Type');
    });

    it('should output --format json for overall stats', () => {
      const result = runCli('stat --format json');
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    });

    it('should output --format json for bucket info', () => {
      const result = runCli(`stat ${testBucket} --format json`);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    });

    it('should output --format json for object info', () => {
      const result = runCli(`stat ${testBucket}/stat-test.txt --format json`);
      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    });
  });

  describe('presign command', () => {
    const accessKey = process.env.TIGRIS_STORAGE_ACCESS_KEY_ID!;

    beforeAll(() => {
      runCli(`touch ${testBucket}/presign-test.txt`);
    });

    afterAll(() => {
      runCli(`rm ${t3(testBucket)}/presign-test.txt -f`);
    });

    it('should generate presigned GET URL', () => {
      const result = runCli(
        `presign ${testBucket}/presign-test.txt --access-key ${accessKey}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^https:\/\//);
    });

    it('should generate presigned PUT URL with --method put', () => {
      const result = runCli(
        `presign ${testBucket}/presign-test.txt --method put --access-key ${accessKey}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(/^https:\/\//);
    });

    it('should accept --expires-in 600', () => {
      const result = runCli(
        `presign ${testBucket}/presign-test.txt --expires-in 600 --access-key ${accessKey}`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should output --format json', () => {
      const result = runCli(
        `presign ${testBucket}/presign-test.txt --format json --access-key ${accessKey}`
      );
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toHaveProperty('url');
      expect(parsed).toHaveProperty('method');
      expect(parsed).toHaveProperty('bucket');
      expect(parsed).toHaveProperty('key');
    });

    it('should output URL-only with default format', () => {
      const result = runCli(
        `presign ${testBucket}/presign-test.txt --access-key ${accessKey}`
      );
      expect(result.exitCode).toBe(0);
      // Should not be JSON, just a URL
      expect(() => JSON.parse(result.stdout.trim())).toThrow();
      expect(result.stdout.trim()).toMatch(/^https:\/\//);
    });

    it('should error without path', () => {
      const result = runCli('presign');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('required');
    });

    it('should error on bucket-only path', () => {
      const result = runCli(`presign ${testBucket} --access-key ${accessKey}`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Object key is required');
    });
  });

  describe('buckets list command', () => {
    it('should list buckets', () => {
      const result = runCli('buckets list');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(testBucket);
    });

    it('should list buckets with --format json', () => {
      const result = runCli('buckets list --format json');
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(
        parsed.items.some((b: { name: string }) => b.name === testBucket)
      ).toBe(true);
    });
  });

  describe('buckets get command', () => {
    it('should get bucket info', () => {
      const result = runCli(`buckets get ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Property');
    });

    it('should error without bucket name', () => {
      const result = runCli('buckets get');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("missing required argument 'name'");
    });
  });

  describe('buckets delete command', () => {
    it('should delete a single bucket with --yes', () => {
      const name = `${testPrefix}-bd-1`;
      runCli(`mk ${name}`);
      const result = runCli(`buckets delete ${name} --yes`);
      expect(result.exitCode).toBe(0);
    });

    it('should delete multiple buckets with --yes', () => {
      const name1 = `${testPrefix}-bd-2`;
      const name2 = `${testPrefix}-bd-3`;
      runCli(`mk ${name1}`);
      runCli(`mk ${name2}`);
      const result = runCli(`buckets delete ${name1},${name2} --yes`);
      expect(result.exitCode).toBe(0);
    });

    it('should delete a bucket with --force (backwards compat)', () => {
      const name = `${testPrefix}-bd-force`;
      runCli(`mk ${name}`);
      const result = runCli(`buckets delete ${name} --force`);
      expect(result.exitCode).toBe(0);
    });

    it('should fail without --yes in non-TTY', () => {
      const name = `${testPrefix}-bd-nf`;
      runCli(`mk ${name}`);
      const result = runCli(`buckets delete ${name}`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--yes');
      // Cleanup
      runCli(`buckets delete ${name} --yes`);
    });
  });

  describe('buckets create command (non-interactive)', () => {
    const bcBuckets: string[] = [];

    afterAll(() => {
      for (const b of bcBuckets) {
        runCli(`rm ${t3(b)} -f`);
      }
    });

    it('should create with positional name', () => {
      const name = `${testPrefix}-bc-1`;
      bcBuckets.push(name);
      const result = runCli(`buckets create ${name}`);
      expect(result.exitCode).toBe(0);
    });

    it('should create with all flags', () => {
      const name = `${testPrefix}-bc-all`;
      bcBuckets.push(name);
      const result = runCli(
        `buckets create ${name} --access private --default-tier STANDARD --enable-snapshots --locations global`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should error on --source-snapshot without --fork-of', () => {
      const result = runCli(
        `buckets create ${testPrefix}-bc-err --source-snapshot snap1`
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--source-snapshot requires --fork-of');
    });
  });

  describe('bucket settings commands', () => {
    const setBucket = `${testPrefix}-set`;

    beforeAll(() => {
      runCli(`mk ${setBucket}`);
    });

    afterAll(() => {
      // Disable delete protection before cleanup
      runCli(`buckets set ${setBucket} --enable-delete-protection false`);
      runCli(`rm ${t3(setBucket)} -f`);
    });

    describe('buckets set', () => {
      it('should set --access public', () => {
        const result = runCli(`buckets set ${setBucket} --access public`);
        expect(result.exitCode).toBe(0);
        // Reset back
        runCli(`buckets set ${setBucket} --access private`);
      });

      it('should set --cache-control "max-age=3600"', () => {
        const result = runCli(
          `buckets set ${setBucket} --cache-control "max-age=3600"`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should set --enable-delete-protection true', () => {
        const result = runCli(
          `buckets set ${setBucket} --enable-delete-protection true`
        );
        expect(result.exitCode).toBe(0);
        // Disable for cleanup
        runCli(`buckets set ${setBucket} --enable-delete-protection false`);
      });

      it('should set --locations usa', () => {
        const result = runCli(`buckets set ${setBucket} --locations usa`);
        expect(result.exitCode).toBe(0);
      });

      it('should error when no settings provided', () => {
        const result = runCli(`buckets set ${setBucket}`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('At least one setting is required');
      });

      it('should error without bucket name', () => {
        const result = runCli('buckets set --access public');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("missing required argument 'name'");
      });
    });

    describe('buckets set-ttl', () => {
      it('should set TTL with --days 30', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --days 30`);
        expect(result.exitCode).toBe(0);
      });

      it('should set TTL with --date 2027-01-01', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --date 2027-01-01`);
        expect(result.exitCode).toBe(0);
      });

      it('should enable with --enable', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --enable`);
        expect(result.exitCode).toBe(0);
      });

      it('should disable with --disable', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --disable`);
        expect(result.exitCode).toBe(0);
      });

      it('should error when using both --enable and --disable', () => {
        const result = runCli(
          `buckets set-ttl ${setBucket} --enable --disable`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use both --enable and --disable'
        );
      });

      it('should error when using --disable with --days', () => {
        const result = runCli(
          `buckets set-ttl ${setBucket} --disable --days 30`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --disable with --days or --date'
        );
      });

      it('should error on invalid --days', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --days -5`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('--days must be a positive number');
      });

      it('should error on invalid --date', () => {
        const result = runCli(`buckets set-ttl ${setBucket} --date not-a-date`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('--date must be a valid ISO-8601 date');
      });

      it('should error when no action provided', () => {
        const result = runCli(`buckets set-ttl ${setBucket}`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Provide --days, --date, --enable, or --disable'
        );
      });
    });

    describe('buckets set-locations', () => {
      it('should set locations with --locations usa', () => {
        const result = runCli(
          `buckets set-locations ${setBucket} --locations usa`
        );
        expect(result.exitCode).toBe(0);
      });
    });

    describe('buckets set-migration', () => {
      it('should disable migration', () => {
        const result = runCli(`buckets set-migration ${setBucket} --disable`);
        expect(result.exitCode).toBe(0);
      });

      it('should error on --disable with other options', () => {
        const result = runCli(
          `buckets set-migration ${setBucket} --disable --bucket other`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --disable with other migration options'
        );
      });

      it('should error when missing required params', () => {
        const result = runCli(
          `buckets set-migration ${setBucket} --bucket other`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Required:');
      });
    });

    describe('buckets set-transition', () => {
      it('should set with --days 30 --storage-class GLACIER', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --days 30 --storage-class GLACIER`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should set with --date 2027-01-01 --storage-class GLACIER_IR', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --date 2027-01-01 --storage-class GLACIER_IR`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should enable with --enable', () => {
        const result = runCli(`buckets set-transition ${setBucket} --enable`);
        expect(result.exitCode).toBe(0);
      });

      it('should disable with --disable', () => {
        const result = runCli(`buckets set-transition ${setBucket} --disable`);
        expect(result.exitCode).toBe(0);
      });

      it('should error on invalid storage class STANDARD', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --days 30 --storage-class STANDARD`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'STANDARD is not a valid transition target'
        );
      });

      it('should error on --days without --storage-class', () => {
        const result = runCli(`buckets set-transition ${setBucket} --days 30`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          '--storage-class is required when setting --days or --date'
        );
      });

      it('should error when using both --enable and --disable', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --enable --disable`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use both --enable and --disable'
        );
      });

      it('should error on --disable with --days', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --disable --days 30`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --disable with --days, --date, or --storage-class'
        );
      });

      it('should error when no action provided', () => {
        const result = runCli(`buckets set-transition ${setBucket}`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Provide --days, --date, --enable, or --disable'
        );
      });

      it('should error on invalid --days', () => {
        const result = runCli(
          `buckets set-transition ${setBucket} --days -1 --storage-class GLACIER`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('--days must be a positive number');
      });
    });

    describe('buckets set-notifications', () => {
      it('should enable with --url', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --url https://example.com/webhook`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should disable', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --disable`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should reset', () => {
        const result = runCli(`buckets set-notifications ${setBucket} --reset`);
        expect(result.exitCode).toBe(0);
      });

      it('should accept --token auth', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --url https://example.com/webhook --token my-secret-token`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should accept --username/--password auth', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --url https://example.com/webhook --username user1 --password pass1`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should error on multiple action flags', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --enable --disable`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Only one of --enable, --disable, or --reset can be used'
        );
      });

      it('should error on --reset with other options', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --reset --url https://example.com`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --reset with other options'
        );
      });

      it('should error on --token with --username', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --url https://example.com --token tok --username user`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --token with --username/--password'
        );
      });

      it('should error on --username without --password', () => {
        const result = runCli(
          `buckets set-notifications ${setBucket} --url https://example.com --username user`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Both --username and --password are required'
        );
      });

      it('should error when no options provided', () => {
        const result = runCli(`buckets set-notifications ${setBucket}`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Provide at least one option');
      });
    });

    describe('buckets set-cors', () => {
      it('should set with --origins and --methods', () => {
        const result = runCli(
          `buckets set-cors ${setBucket} --origins "*" --methods "GET,POST"`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should reset with --reset', () => {
        const result = runCli(`buckets set-cors ${setBucket} --reset`);
        expect(result.exitCode).toBe(0);
      });

      it('should set with --override', () => {
        const result = runCli(
          `buckets set-cors ${setBucket} --origins "*" --override`
        );
        expect(result.exitCode).toBe(0);
      });

      it('should error on --reset with other options', () => {
        const result = runCli(
          `buckets set-cors ${setBucket} --reset --origins "*"`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain(
          'Cannot use --reset with other options'
        );
      });

      it('should error without --origins or --reset', () => {
        const result = runCli(`buckets set-cors ${setBucket} --methods "GET"`);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Provide --origins or --reset');
      });

      it('should error on invalid --max-age', () => {
        const result = runCli(
          `buckets set-cors ${setBucket} --origins "*" --max-age -1`
        );
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('--max-age must be a positive number');
      });
    });
  });

  describe('objects delete command', () => {
    it('should delete a single object with --yes', () => {
      runCli(`touch ${testBucket}/objdel-1.txt`);
      const result = runCli(`objects delete ${testBucket} objdel-1.txt --yes`);
      expect(result.exitCode).toBe(0);
    });

    it('should delete multiple objects with --yes', () => {
      runCli(`touch ${testBucket}/objdel-2.txt`);
      runCli(`touch ${testBucket}/objdel-3.txt`);
      const result = runCli(
        `objects delete ${testBucket} objdel-2.txt,objdel-3.txt --yes`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should delete an object with --force (backwards compat)', () => {
      runCli(`touch ${testBucket}/objdel-force.txt`);
      const result = runCli(
        `objects delete ${testBucket} objdel-force.txt --force`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should fail without --yes in non-TTY', () => {
      runCli(`touch ${testBucket}/objdel-noforce.txt`);
      const result = runCli(`objects delete ${testBucket} objdel-noforce.txt`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('--yes');
      // Cleanup
      runCli(`objects delete ${testBucket} objdel-noforce.txt --yes`);
    });
  });

  describe('objects set command', () => {
    beforeAll(() => {
      runCli(`touch ${testBucket}/objset-test.txt`);
    });

    afterAll(() => {
      // The object may have been renamed
      runCli(`rm ${t3(testBucket)}/objset-test.txt -f`);
      runCli(`rm ${t3(testBucket)}/objset-renamed.txt -f`);
    });

    it('should set --access public', () => {
      const result = runCli(
        `objects set ${testBucket} objset-test.txt --access public`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should set --access private', () => {
      const result = runCli(
        `objects set ${testBucket} objset-test.txt --access private`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should rename with --new-key', () => {
      const result = runCli(
        `objects set ${testBucket} objset-test.txt --access private --new-key objset-renamed.txt`
      );
      expect(result.exitCode).toBe(0);

      // Verify rename
      const ls = runCli(`ls ${testBucket}`);
      expect(ls.stdout).toContain('objset-renamed.txt');
    });
  });

  describe('objects commands with t3:// paths', () => {
    const tmpBase = join(tmpdir(), `cli-test-t3path-${testPrefix}`);

    beforeAll(() => {
      mkdirSync(tmpBase, { recursive: true });
    });

    afterAll(() => {
      rmSync(tmpBase, { recursive: true, force: true });
      runCli(`rm ${t3(testBucket)}/t3path-put.txt -f`);
      runCli(`rm ${t3(testBucket)}/t3path-put2.txt -f`);
      runCli(`rm ${t3(testBucket)}/t3path-get.txt -f`);
      runCli(`rm ${t3(testBucket)}/t3path-info.txt -f`);
      runCli(`rm ${t3(testBucket)}/t3path-set.txt -f`);
      runCli(`rm ${t3(testBucket)}/t3path-del.txt -f`);
    });

    it('should put with t3://bucket/key file', () => {
      const tmpFile = join(tmpBase, 'put.txt');
      writeFileSync(tmpFile, 't3 path put test');
      const result = runCli(
        `objects put t3://${testBucket}/t3path-put.txt ${tmpFile}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('t3path-put.txt');
    });

    it('should put with bare bucket/key file', () => {
      const tmpFile = join(tmpBase, 'put2.txt');
      writeFileSync(tmpFile, 't3 path put test 2');
      const result = runCli(
        `objects put ${testBucket}/t3path-put2.txt ${tmpFile}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('t3path-put2.txt');
    });

    it('should get with t3://bucket/key', () => {
      // Setup: create the object first
      const tmpFile = join(tmpBase, 'get-src.txt');
      writeFileSync(tmpFile, 't3 path get test');
      runCli(`objects put ${testBucket} t3path-get.txt ${tmpFile}`);

      const result = runCli(`objects get t3://${testBucket}/t3path-get.txt`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('t3 path get test');
    });

    it('should list with t3://bucket', () => {
      const result = runCli(`objects list t3://${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('t3path-put.txt');
    });

    it('should list with t3://bucket/prefix', () => {
      const result = runCli(`objects list t3://${testBucket}/t3path-put`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('t3path-put');
    });

    it('should info with t3://bucket/key', () => {
      const result = runCli(`objects info t3://${testBucket}/t3path-put.txt`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Size');
      expect(result.stdout).toContain('Content-Type');
    });

    it('should info with bare bucket/key', () => {
      const result = runCli(`objects info ${testBucket}/t3path-put.txt`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Size');
    });

    it('should set with t3://bucket/key', () => {
      // Setup: create the object
      runCli(`touch ${testBucket}/t3path-set.txt`);
      const result = runCli(
        `objects set t3://${testBucket}/t3path-set.txt --access public`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should delete with t3://bucket/key', () => {
      runCli(`touch ${testBucket}/t3path-del.txt`);
      const result = runCli(
        `objects delete t3://${testBucket}/t3path-del.txt --yes`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should delete with bare bucket/key', () => {
      runCli(`touch ${testBucket}/t3path-del.txt`);
      const result = runCli(
        `objects delete ${testBucket}/t3path-del.txt --yes`
      );
      expect(result.exitCode).toBe(0);
    });
  });

  describe('snapshot and fork lifecycle', () => {
    const snapBucket = `${testPrefix}-snap`;
    const forkBucket = `${testPrefix}-fork`;
    let snapshotVersion: string;

    beforeAll(() => {
      runCli(`mk ${snapBucket} --enable-snapshots`);
      runCli(`touch ${snapBucket}/snap-file.txt`);
    });

    afterAll(() => {
      runCli(`rm ${t3(forkBucket)} -f`);
      runCli(`rm ${t3(snapBucket)}/snap-file.txt -f`);
      runCli(`rm ${t3(snapBucket)} -f`);
    });

    it('should take a snapshot', () => {
      const result = runCli(`snapshots take ${snapBucket}`);
      expect(result.exitCode).toBe(0);
    });

    it('should take a named snapshot with --snapshot-name', () => {
      const result = runCli(`snapshots take ${snapBucket} test-snap`);
      expect(result.exitCode).toBe(0);
    });

    it('should list snapshots', () => {
      const result = runCli(`snapshots list ${snapBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Version');
    });

    it('should list snapshots with --format json', () => {
      const result = runCli(`snapshots list ${snapBucket} --format json`);
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(Array.isArray(parsed.items)).toBe(true);
      expect(parsed.items.length).toBeGreaterThan(0);
      // Save version for later tests
      snapshotVersion = parsed.items[0].version;
      expect(snapshotVersion).toBeTruthy();
    });

    it('should ls with --snapshot-version', () => {
      const result = runCli(
        `ls ${snapBucket} --snapshot-version ${snapshotVersion}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('snap-file.txt');
    });

    it('should objects list with --snapshot-version', () => {
      const result = runCli(
        `objects list ${snapBucket} --snapshot-version ${snapshotVersion}`
      );
      expect(result.exitCode).toBe(0);
    });

    it('should stat object with --snapshot-version', () => {
      const result = runCli(
        `stat ${snapBucket}/snap-file.txt --snapshot-version ${snapshotVersion}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Size');
    });

    it('should create a fork via forks create', () => {
      const result = runCli(`forks create ${snapBucket} ${forkBucket}`);
      expect(result.exitCode).toBe(0);
    });

    it('should list forks', () => {
      // Retry — fork visibility is eventually consistent
      let result = { stdout: '', stderr: '', exitCode: 1 };
      for (let i = 0; i < 3; i++) {
        result = runCli(`forks list ${snapBucket}`);
        if (result.exitCode === 0 && result.stdout.includes(forkBucket)) break;
        if (i < 2) execSync('sleep 5');
      }
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(forkBucket);
    }, 120_000);

    it('should list forks with --format json', () => {
      const result = runCli(`forks list ${snapBucket} --format json`);
      expect(result.exitCode).toBe(0);
      // May return JSON array or empty (printEmpty is TTY-gated)
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
      }
    }, 120_000);

    it('should list forks via buckets list --forks-of', () => {
      // Retry — fork visibility is eventually consistent
      let result = { stdout: '', stderr: '', exitCode: 1 };
      for (let i = 0; i < 3; i++) {
        result = runCli(`buckets list --forks-of ${snapBucket}`);
        if (result.exitCode === 0 && result.stdout.includes(forkBucket)) break;
        if (i < 2) execSync('sleep 5');
      }
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(forkBucket);
    }, 120_000);
  });

  describe('credentials test command', () => {
    it('should verify credentials (no bucket)', () => {
      const result = runCli('credentials test');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Access verified');
    });

    it('should verify credentials for specific bucket', () => {
      const result = runCli(`credentials test --bucket ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Access verified');
    });
  });
});
