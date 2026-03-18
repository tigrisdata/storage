import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as YAML from 'yaml';
import { setSpecs } from '../../src/utils/specs.js';
import {
  exitWithError,
  getSuccessNextActions,
  printNextActions,
} from '../../src/utils/exit.js';
import { ExitCode } from '../../src/utils/errors.js';

// Pre-populate specs cache
const specsYaml = readFileSync(
  join(process.cwd(), 'src', 'specs.yaml'),
  'utf8'
);
setSpecs(YAML.parse(specsYaml, { schema: 'core' }));

// Save original TTY descriptors
const originalStdoutIsTTY = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY'
);
const originalStderrIsTTY = Object.getOwnPropertyDescriptor(
  process.stderr,
  'isTTY'
);

function setStdoutTTY(value: boolean) {
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    writable: true,
    configurable: true,
  });
}

function setStderrTTY(value: boolean) {
  Object.defineProperty(process.stderr, 'isTTY', {
    value,
    writable: true,
    configurable: true,
  });
}

function restoreTTY() {
  if (originalStdoutIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalStdoutIsTTY);
  } else {
    delete (process.stdout as unknown as Record<string, unknown>).isTTY;
  }
  if (originalStderrIsTTY) {
    Object.defineProperty(process.stderr, 'isTTY', originalStderrIsTTY);
  } else {
    delete (process.stderr as unknown as Record<string, unknown>).isTTY;
  }
}

function setJsonMode(value: boolean) {
  globalThis.__TIGRIS_JSON_MODE = value;
}

describe('exitWithError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    setJsonMode(false);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    restoreTTY();
    setJsonMode(false);
  });

  it('exits with classified code for auth errors', () => {
    exitWithError(new Error('access denied'));
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.AuthFailure);
  });

  it('exits with classified code for not-found errors', () => {
    exitWithError(new Error('NoSuchBucket'));
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.NotFound);
  });

  it('exits with classified code for rate limit errors', () => {
    exitWithError(new Error('rate limit exceeded'));
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.RateLimit);
  });

  it('exits with classified code for network errors', () => {
    exitWithError(new Error('ECONNREFUSED'));
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.NetworkError);
  });

  it('exits with code 1 for general errors', () => {
    exitWithError(new Error('something went wrong'));
    expect(exitSpy).toHaveBeenCalledWith(ExitCode.GeneralError);
  });

  it('outputs structured JSON to stderr in JSON mode', () => {
    setJsonMode(true);
    exitWithError(new Error('access denied'));

    const jsonCalls = errorSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBe(1);

    const output = JSON.parse(jsonCalls[0][0] as string);
    expect(output).toHaveProperty('error');
    expect(output.error).toHaveProperty('message', 'access denied');
    expect(output.error).toHaveProperty('code', ExitCode.AuthFailure);
    expect(output.error).toHaveProperty('category', 'permission');
    expect(output).toHaveProperty('nextActions');
    expect(output.nextActions.length).toBeGreaterThan(0);
  });

  it('omits nextActions from JSON when empty', () => {
    setJsonMode(true);
    exitWithError(new Error('something went wrong'));

    const jsonCalls = errorSpy.mock.calls.filter((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCalls.length).toBe(1);

    const output = JSON.parse(jsonCalls[0][0] as string);
    expect(output).not.toHaveProperty('nextActions');
  });

  it('prints next steps hints in TTY mode for classified errors', () => {
    setStderrTTY(true);
    exitWithError(new Error('access denied'));

    const allOutput = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Next steps:');
    expect(allOutput).toContain('access-keys list');
  });

  it('does not print next steps in non-TTY non-JSON mode', () => {
    setStderrTTY(false);
    setJsonMode(false);
    exitWithError(new Error('access denied'));

    const allOutput = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).not.toContain('Next steps:');
  });
});

describe('getSuccessNextActions', () => {
  it('returns nextActions for a command that has them', () => {
    const actions = getSuccessNextActions(
      { command: 'buckets', operation: 'create' },
      { name: 'my-bucket' }
    );
    expect(actions.length).toBeGreaterThan(0);
    // Should interpolate {{name}}
    expect(actions.some((a) => a.command.includes('my-bucket'))).toBe(true);
    expect(actions.every((a) => !a.command.includes('{{name}}'))).toBe(true);
  });

  it('returns empty array for commands without nextActions', () => {
    const actions = getSuccessNextActions({
      command: 'buckets',
      operation: 'list',
    });
    expect(actions).toEqual([]);
  });

  it('interpolates variables in command and description', () => {
    const actions = getSuccessNextActions(
      { command: 'organizations', operation: 'create' },
      { name: 'test-org' }
    );
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].command).toContain('test-org');
    expect(actions[0].command).not.toContain('{{name}}');
  });

  it('returns empty array for unknown command', () => {
    const actions = getSuccessNextActions({ command: 'nonexistent' });
    expect(actions).toEqual([]);
  });
});

describe('printNextActions', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    restoreTTY();
  });

  it('prints next steps in TTY mode', () => {
    setStdoutTTY(true);
    printNextActions(
      { command: 'buckets', operation: 'create' },
      { name: 'my-bucket' }
    );

    const allOutput = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(allOutput).toContain('Next steps:');
    expect(allOutput).toContain('my-bucket');
  });

  it('is silent when not TTY', () => {
    setStdoutTTY(false);
    printNextActions(
      { command: 'buckets', operation: 'create' },
      { name: 'my-bucket' }
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('is silent when no nextActions defined', () => {
    setStdoutTTY(true);
    printNextActions({ command: 'buckets', operation: 'list' });
    expect(logSpy).not.toHaveBeenCalled();
  });
});
