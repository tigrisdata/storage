import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { shouldSkipIntegrationTests, getTestPrefix } from './setup.js';

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
    };
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
    expect(result.stdout).toContain('List buckets or objects');
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

  it('should show buckets help', () => {
    const result = runCli('buckets help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Operations:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('create');
  });

  it('should show objects help', () => {
    const result = runCli('objects help');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Operations:');
    expect(result.stdout).toContain('list');
    expect(result.stdout).toContain('get');
    expect(result.stdout).toContain('put');
  });
});

describe.skipIf(skipTests)('CLI Integration Tests', () => {
  // Generate unique prefix for all test resources
  const testPrefix = getTestPrefix();
  const testBucket = testPrefix;
  const testContent = 'Hello from CLI test';

  beforeAll(async () => {
    // Setup credentials from .env
    console.log('Setting up credentials from .env...');
    if (!setupCredentials()) {
      console.warn('Failed to setup credentials, tests may fail');
    }

    console.log(`Test prefix: ${testPrefix}`);
    console.log(`Creating test bucket: ${testBucket}`);
    // Use mk command instead of buckets create to avoid interactive prompts
    const result = runCli(`mk ${testBucket}`);
    if (result.exitCode !== 0) {
      console.error('Failed to create test bucket:', result.stderr);
      throw new Error('Failed to create test bucket');
    }
  });

  afterAll(async () => {
    console.log(`Cleaning up test bucket: ${testBucket}`);
    // Force remove all objects and the bucket
    runCli(`rm ${testBucket}/* -f`);
    runCli(`rm ${testBucket} -f`);
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
        `cp ${testBucket}/${srcFile} ${testBucket}/${destFile}`
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
        `mv ${testBucket}/${srcFile} ${testBucket}/${destFile} -f`
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
      const result = runCli(`rm ${testBucket}/${fileName} -f`);
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
        `cp ${testBucket}/${autoFolder} ${testBucket}/${copiedFolder}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain('2 object(s)');
    });

    it('should auto-detect folder for mv without trailing slash', () => {
      const result = runCli(
        `mv ${testBucket}/${copiedFolder} ${testBucket}/${movedFolder} -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain('2 object(s)');
    });

    it('should auto-detect folder for rm without trailing slash', () => {
      const result = runCli(`rm ${testBucket}/${movedFolder} -f`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Removed');
    });

    afterAll(() => {
      runCli(`rm ${testBucket}/${autoFolder} -f`);
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
        `cp ${testBucket}/${emptyFolder}/ ${testBucket}/${copiedEmptyFolder}/`
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
        `mv ${testBucket}/${copiedEmptyFolder}/ ${testBucket}/${movedEmptyFolder}/ -f`
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
      runCli(`rm ${testBucket}/${emptyFolder}/ -f`);
      runCli(`rm ${testBucket}/${movedEmptyFolder}/ -f`);
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
        `cp ${testBucket}/${srcFile} ${testBucket}/${targetFolder}`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain(`${targetFolder}/${srcFile}`);
    });

    it('should copy file to explicit folder path (trailing slash)', () => {
      const result = runCli(
        `cp ${testBucket}/${srcFile2} ${testBucket}/${targetFolder}/`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Copied');
      expect(result.stdout).toContain(`${targetFolder}/${srcFile2}`);
    });

    it('should move file to existing folder with force flag', () => {
      const result = runCli(
        `mv ${testBucket}/${srcFile3} ${testBucket}/${targetFolder} -f`
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
      runCli(`rm ${testBucket}/${targetFolder}/ -f`);
      runCli(`rm ${testBucket}/${srcFile} -f`);
      runCli(`rm ${testBucket}/${srcFile2} -f`);
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
      const result = runCli(`cp ${testBucket} ${testBucket}-other/`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Cannot copy a bucket');
    });

    it('should error on mv with bucket-only source', () => {
      const result = runCli(`mv ${testBucket} ${testBucket}-other/`);
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
      const result = runCli(`rm ${testBucket}/${wildcardPrefix}-* -f`);
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
        `cp ${testBucket}/${wcFolder}/* ${testBucket}/${wcCopied}/`
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
        `mv ${testBucket}/${wcCopied}/* ${testBucket}/${wcMoved}/ -f`
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Moved');
      expect(result.stdout).toContain('3 object(s)');
    });

    it('should not show source folder after wildcard move', () => {
      const result = runCli(`ls ${testBucket}`);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain(`${wcCopied}/`);
      expect(result.stdout).toContain(`${wcMoved}/`);
    });

    afterAll(() => {
      runCli(`rm ${testBucket}/${wcFolder}/ -f`);
      runCli(`rm ${testBucket}/${wcMoved}/ -f`);
    });
  });
});
