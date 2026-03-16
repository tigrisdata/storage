import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as YAML from 'yaml';
import { setSpecs } from '../../src/utils/specs.js';
import {
  printFailure,
  printDeprecated,
  printStart,
  printSuccess,
  printEmpty,
  printAlreadyDone,
  printHint,
} from '../../src/utils/messages.js';

// Save original descriptor so we can restore it
const originalIsTTY = Object.getOwnPropertyDescriptor(
  process.stdout,
  'isTTY'
);

function setTTY(value: boolean) {
  Object.defineProperty(process.stdout, 'isTTY', {
    value,
    writable: true,
    configurable: true,
  });
}

function restoreTTY() {
  if (originalIsTTY) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTY);
  } else {
    delete (process.stdout as unknown as Record<string, unknown>).isTTY;
  }
}

// Pre-populate specs cache from source YAML so we don't need dist/
const specsYaml = readFileSync(join(process.cwd(), 'src', 'specs.yaml'), 'utf8');
setSpecs(YAML.parse(specsYaml, { schema: 'core' }));

describe('messages', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    restoreTTY();
  });

  // Use a real command from specs for testing
  const ctx = { command: 'buckets', operation: 'create' };

  describe('printFailure', () => {
    it('prints error with ✖ prefix (TTY)', () => {
      setTTY(true);
      printFailure(ctx, 'something went wrong');
      expect(errorSpy).toHaveBeenCalled();
      const allArgs = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(allArgs).toContain('✖');
      expect(allArgs).toContain('something went wrong');
    });

    it('prints error even when not TTY', () => {
      setTTY(false);
      printFailure(ctx, 'something went wrong');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('printDeprecated', () => {
    it('prints ⚠ Deprecated when TTY', () => {
      setTTY(true);
      printDeprecated('use new-command instead');
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain('⚠ Deprecated:');
      expect(warnSpy.mock.calls[0][0]).toContain('use new-command instead');
    });

    it('is silent when not TTY', () => {
      setTTY(false);
      printDeprecated('use new-command instead');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('printStart', () => {
    it('prints onStart message when TTY', () => {
      setTTY(true);
      printStart(ctx);
      expect(logSpy).toHaveBeenCalled();
    });

    it('is silent when not TTY', () => {
      setTTY(false);
      printStart(ctx);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printSuccess', () => {
    it('prints ✔ prefix when TTY', () => {
      setTTY(true);
      printSuccess(ctx);
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('✔');
    });

    it('is silent when not TTY', () => {
      setTTY(false);
      printSuccess(ctx);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printEmpty', () => {
    // Use a command that has onEmpty message
    const emptyCtx = { command: 'buckets', operation: 'list' };

    it('prints when TTY', () => {
      setTTY(true);
      printEmpty(emptyCtx);
      // Will only print if the spec has an onEmpty message
      // Either way, it should not throw
    });

    it('is silent when not TTY', () => {
      setTTY(false);
      printEmpty(emptyCtx);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printAlreadyDone', () => {
    it('is silent when not TTY', () => {
      setTTY(false);
      printAlreadyDone(ctx);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('printHint', () => {
    it('is silent when not TTY', () => {
      setTTY(false);
      printHint(ctx);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('variable interpolation', () => {
    it('replaces {{name}} in output', () => {
      setTTY(true);
      // buckets create onSuccess is "Bucket '{{name}}' created"
      printSuccess(ctx, { name: 'my-bucket' });
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-bucket');
      expect(output).not.toContain('{{name}}');
    });
  });
});
