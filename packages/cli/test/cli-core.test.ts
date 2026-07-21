import type { Command as CommanderCommand } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addArgumentsToCommand,
  extractArgumentValues,
  formatArgumentHelp,
  isValidCommandName,
  validateRequiredWhen,
} from '../src/cli-core.js';
import type { Argument } from '../src/types.js';

describe('isValidCommandName', () => {
  it.each(['buckets', 'access-keys', 'set_ttl', 'ls', 'a1'])(
    'accepts valid name: %s',
    (name) => {
      expect(isValidCommandName(name)).toBe(true);
    }
  );

  it.each(['', '../etc', 'foo bar', 'rm;ls', 'a/b', 'cmd@1'])(
    'rejects invalid name: %s',
    (name) => {
      expect(isValidCommandName(name)).toBe(false);
    }
  );
});

describe('formatArgumentHelp', () => {
  it('formats positional argument', () => {
    const arg: Argument = {
      name: 'path',
      description: 'The file path',
      type: 'positional',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('  path');
    expect(result).toContain('[positional argument]');
  });

  it('formats flag', () => {
    const arg: Argument = {
      name: 'force',
      description: 'Force the operation',
      type: 'flag',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('--force');
  });

  it('formats short alias', () => {
    const arg: Argument = {
      name: 'format',
      description: 'Output format',
      alias: 'f',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('--format, -f');
  });

  it('formats long alias', () => {
    const arg: Argument = {
      name: 'fork-of',
      description: 'Fork source',
      alias: 'fork',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('--fork-of, --fork');
  });

  it('formats string[] options', () => {
    const arg: Argument = {
      name: 'format',
      description: 'Output format',
      options: ['json', 'table'],
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('(options: json, table)');
  });

  it('formats object options', () => {
    const arg: Argument = {
      name: 'tier',
      description: 'Storage tier',
      options: [
        { name: 'Standard', value: 'STANDARD', description: 'Default tier' },
      ],
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('(options: STANDARD)');
  });

  it('formats default value', () => {
    const arg: Argument = {
      name: 'format',
      description: 'Output format',
      default: 'table',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('[default: table]');
  });

  it('formats required', () => {
    const arg: Argument = {
      name: 'name',
      description: 'Bucket name',
      required: true,
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('[required]');
  });

  it('formats required-when', () => {
    const arg: Argument = {
      name: 'target',
      description: 'Target bucket',
      'required-when': 'type=bucket',
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('[required when: type=bucket]');
  });

  it('formats multiple', () => {
    const arg: Argument = {
      name: 'regions',
      description: 'Regions',
      multiple: true,
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('[multiple values: comma-separated]');
  });

  it('formats examples', () => {
    const arg: Argument = {
      name: 'path',
      description: 'Object path',
      examples: ['t3://bucket/key'],
    };
    const result = formatArgumentHelp(arg);
    expect(result).toContain('(examples: t3://bucket/key)');
  });

  it('pads short names to at least 26 chars', () => {
    const arg: Argument = { name: 'x', description: 'desc' };
    const result = formatArgumentHelp(arg);
    // "  --x" is 5 chars, should be padded to 26
    const descIndex = result.indexOf('desc');
    expect(descIndex).toBeGreaterThanOrEqual(26);
  });
});

describe('extractArgumentValues', () => {
  it('passes through plain object', () => {
    const args: Argument[] = [];
    const result = extractArgumentValues(args, [], { foo: 'bar' });
    expect(result).toEqual({ foo: 'bar' });
  });

  it('calls optsWithGlobals() when present', () => {
    const args: Argument[] = [];
    const commandObj = {
      optsWithGlobals: () => ({ fromGlobals: true }),
    };
    const result = extractArgumentValues(
      args,
      [],
      commandObj as unknown as Record<string, unknown>
    );
    expect(result).toEqual({ fromGlobals: true });
  });

  it('calls opts() when present (no optsWithGlobals)', () => {
    const args: Argument[] = [];
    const commandObj = {
      opts: () => ({ fromOpts: true }),
    };
    const result = extractArgumentValues(
      args,
      [],
      commandObj as unknown as Record<string, unknown>
    );
    expect(result).toEqual({ fromOpts: true });
  });

  it('maps positional args by index', () => {
    const args: Argument[] = [
      { name: 'source', description: 'Source', type: 'positional' },
      { name: 'dest', description: 'Destination', type: 'positional' },
    ];
    const result = extractArgumentValues(args, ['a.txt', 'b.txt'], {});
    expect(result.source).toBe('a.txt');
    expect(result.dest).toBe('b.txt');
  });

  it('comma-splits multiple positional args', () => {
    const args: Argument[] = [
      {
        name: 'regions',
        description: 'Regions',
        type: 'positional',
        multiple: true,
      },
    ];
    const result = extractArgumentValues(args, ['ams,fra,sjc'], {});
    expect(result.regions).toEqual(['ams', 'fra', 'sjc']);
  });

  it('comma-splits multiple non-positional string values', () => {
    const args: Argument[] = [
      { name: 'tags', description: 'Tags', multiple: true },
    ];
    const result = extractArgumentValues(args, [], { tags: 'a,b,c' });
    expect(result.tags).toEqual(['a', 'b', 'c']);
  });
});

describe('validateRequiredWhen', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns true when no required args', () => {
    const args: Argument[] = [{ name: 'format', description: 'Format' }];
    expect(validateRequiredWhen(args, {})).toBe(true);
  });

  it('returns true when required arg is present', () => {
    const args: Argument[] = [
      { name: 'name', description: 'Name', required: true },
    ];
    expect(validateRequiredWhen(args, { name: 'test' })).toBe(true);
  });

  it('returns false when required arg is missing', () => {
    const args: Argument[] = [
      { name: 'name', description: 'Name', required: true },
    ];
    expect(validateRequiredWhen(args, {})).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('--name is required');
  });

  it('returns false when required-when condition met but value missing', () => {
    const args: Argument[] = [
      { name: 'type', description: 'Type' },
      {
        name: 'target',
        description: 'Target',
        'required-when': 'type=bucket',
      },
    ];
    expect(validateRequiredWhen(args, { type: 'bucket' })).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(
      '--target is required when --type is bucket'
    );
  });

  it('returns true when required-when condition not met', () => {
    const args: Argument[] = [
      { name: 'type', description: 'Type' },
      {
        name: 'target',
        description: 'Target',
        'required-when': 'type=bucket',
      },
    ];
    expect(validateRequiredWhen(args, { type: 'object' })).toBe(true);
  });

  it('returns true when required-when condition met and value present', () => {
    const args: Argument[] = [
      { name: 'type', description: 'Type' },
      {
        name: 'target',
        description: 'Target',
        'required-when': 'type=bucket',
      },
    ];
    expect(
      validateRequiredWhen(args, { type: 'bucket', target: 'my-bucket' })
    ).toBe(true);
  });
});

describe('addArgumentsToCommand', () => {
  function createMockCmd() {
    const calls = {
      argument: [] as Array<[string, string]>,
      option: [] as Array<[string, string, string?]>,
    };
    const cmd = {
      argument(name: string, desc: string) {
        calls.argument.push([name, desc]);
        return cmd;
      },
      option(flags: string, desc: string, defaultVal?: string) {
        calls.option.push([flags, desc, defaultVal]);
        return cmd;
      },
    };
    return { cmd, calls };
  }

  it('adds required positional as <name>', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      { name: 'path', description: 'Path', type: 'positional', required: true },
    ]);
    expect(calls.argument[0][0]).toBe('<path>');
  });

  it('adds optional positional as [name]', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      { name: 'path', description: 'Path', type: 'positional' },
    ]);
    expect(calls.argument[0][0]).toBe('[path]');
  });

  it('adds flag without value placeholder', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      { name: 'force', description: 'Force', type: 'flag' },
    ]);
    expect(calls.option[0][0]).toBe('--force');
  });

  it('adds short alias', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      {
        name: 'format',
        description: 'Format',
        alias: 'f',
        options: ['json', 'table'],
      },
    ]);
    expect(calls.option[0][0]).toBe('-f, --format <value>');
  });

  it('adds long alias', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      { name: 'fork-of', description: 'Fork', alias: 'fork', required: true },
    ]);
    expect(calls.option[0][0]).toBe('--fork, --fork-of <value>');
  });

  it('passes default value as 3rd arg', () => {
    const { cmd, calls } = createMockCmd();
    addArgumentsToCommand(cmd as unknown as CommanderCommand, [
      { name: 'format', description: 'Format', default: 'table' },
    ]);
    expect(calls.option[0][2]).toBe('table');
  });
});
