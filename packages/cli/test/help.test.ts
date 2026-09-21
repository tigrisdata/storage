import { Command, Option } from 'commander';
import { describe, expect, it } from 'vitest';

import { addArgumentsToCommand } from '../src/cli-core.js';
import {
  argumentHelpText,
  helpConfiguration,
  setHelpDetails,
} from '../src/help.js';
import type { Argument } from '../src/types.js';

const globalArgs: Argument[] = [
  { name: 'format', description: 'Output format', options: ['json', 'table'] },
  { name: 'json', description: 'Output as JSON', type: 'flag' },
  {
    name: 'yes',
    alias: 'y',
    description: 'Skip confirmation prompts',
    type: 'flag',
    hidden: true,
  },
];

function buildProgram(columns: number, colors = false): Command {
  const program = new Command()
    .name('tigris')
    .description('Command line interface for Tigris')
    .helpOption('-h, --help', 'Show help')
    .configureHelp(helpConfiguration)
    .configureOutput({
      getOutHelpWidth: () => columns,
      getErrHelpWidth: () => columns,
      getOutHasColors: () => colors,
    });
  setHelpDetails(program, { groups: ['Files', 'CLI'] });

  const cp = program
    .command('cp')
    .alias('copy')
    .description(
      'Copy files between local filesystem and Tigris, or between paths within Tigris. At least one side must be a remote t3:// path'
    )
    .summary('Copy files to, from, or within Tigris')
    .helpGroup('Files:');
  setHelpDetails(cp, {
    examples: ['tigris cp ./file.txt t3://my-bucket/file.txt'],
  });
  addArgumentsToCommand(
    cp,
    [
      {
        name: 'src',
        type: 'positional',
        required: true,
        description: 'Source path',
      },
      {
        name: 'recursive',
        alias: 'r',
        type: 'flag',
        description: 'Copy directories recursively',
      },
      {
        name: 'source-snapshot',
        alias: 'source-snap',
        description:
          'Fork from a specific snapshot of the source bucket. Accepts a snapshot version string or any UNIX nanosecond-precision timestamp',
      },
      ...globalArgs,
    ],
    globalArgs
  );
  cp.command('help', { hidden: true });

  // Registered before the file commands' second entry and redeclaring two
  // global arguments, to show neither registration order decides the layout.
  program.command('help').description('Show general help').helpGroup('CLI:');
  const rm = program
    .command('remove-everything')
    .summary('Remove objects')
    .helpGroup('Files:');
  addArgumentsToCommand(
    rm,
    [
      { name: 'yes', alias: 'y', description: 'Skip prompts', type: 'flag' },
      { name: 'force', description: 'Force', type: 'flag' },
      {
        name: 'format',
        description: 'Output format',
        options: ['json', 'table', 'xml'],
      },
      globalArgs[1],
    ],
    globalArgs
  );

  return program;
}

function helpFor(columns: number, ...path: string[]): string {
  return helpWith({ columns }, ...path);
}

function helpWith(
  { columns, colors = false }: { columns: number; colors?: boolean },
  ...path: string[]
): string {
  let cmd = buildProgram(columns, colors);
  for (const name of path) {
    cmd = cmd.commands.find((sub) => sub.name() === name) as Command;
  }
  return cmd.helpInformation();
}

describe('argumentHelpText', () => {
  it('prefers help_text over description', () => {
    expect(
      argumentHelpText({
        name: 'path',
        description: 'A long explanation of every path form',
        help_text: 'Bucket or path',
      })
    ).toBe('Bucket or path');
  });

  it('falls back to description', () => {
    expect(argumentHelpText({ name: 'path', description: 'Path' })).toBe(
      'Path'
    );
  });

  it('appends allowed values and the default', () => {
    expect(
      argumentHelpText({
        name: 'format',
        description: 'Output format',
        options: ['json', 'table'],
        default: 'table',
      })
    ).toBe('Output format [options: json, table; default: table]');
  });

  it('lists the value of object options', () => {
    expect(
      argumentHelpText({
        name: 'tier',
        description: 'Tier',
        options: [{ name: 'Standard', value: 'STANDARD', description: '' }],
      })
    ).toBe('Tier [options: STANDARD]');
  });

  it('marks required flags but not required positionals', () => {
    expect(
      argumentHelpText({ name: 'name', description: 'Name', required: true })
    ).toBe('Name [required]');
    expect(
      argumentHelpText({
        name: 'name',
        description: 'Name',
        required: true,
        type: 'positional',
      })
    ).toBe('Name');
  });

  it('omits the default of an off-by-default flag', () => {
    expect(
      argumentHelpText({
        name: 'force',
        description: 'Force',
        type: 'flag',
        default: false as unknown as string,
      })
    ).toBe('Force');
  });

  it('flags deprecated arguments with their replacement', () => {
    expect(
      argumentHelpText({
        name: 'region',
        description: 'Region',
        deprecated: true,
        replaced_by: '--locations',
      })
    ).toBe('(deprecated) Region Use --locations instead.');
  });
});

describe('helpConfiguration', () => {
  it('lists subcommands by bare name with their summary', () => {
    const help = helpFor(80);
    expect(help).toContain(
      '  cp                 Copy files to, from, or within Tigris'
    );
    expect(help).not.toContain('cp|copy');
    expect(help).not.toContain('At least one side must be');
  });

  it('shows the full description on the command page', () => {
    expect(helpFor(80, 'cp')).toContain('At least one side must be');
  });

  it('keeps aliases and hidden subcommands out of the usage line', () => {
    const help = helpFor(80, 'cp');
    expect(help).toContain('Usage: tigris cp [options] <src>\n');
    expect(help).toContain('Aliases:\n  cp, copy\n');
    expect(help).not.toContain('Commands:');
  });

  it('lines long flags up with or without a short form', () => {
    const help = helpFor(80, 'cp');
    expect(help).toContain('\n  -r, --recursive ');
    expect(help).toContain('\n  -h, --help ');
    expect(help).toContain('\n      --json            Output as JSON');
  });

  it('puts a term wider than the column on its own line', () => {
    expect(helpFor(80, 'cp')).toContain(
      '\n      --source-snap, --source-snapshot [value]\n' +
        `${' '.repeat(34)}Fork from a specific snapshot`
    );
  });

  it('groups global options under their own heading', () => {
    expect(helpFor(80, 'cp')).toContain(
      'Global Options:\n' +
        '      --format <value>  Output format [options: json, table]\n' +
        '      --json            Output as JSON\n'
    );
  });

  it('parses a hidden argument without listing it', () => {
    const cp = buildProgram(80).commands.find((sub) => sub.name() === 'cp');
    expect(cp?.helpInformation()).not.toContain('--yes');
    expect(cp?.options.some((option) => option.long === '--yes')).toBe(true);
  });

  it('lists a redeclared global argument with the other global options', () => {
    // Declared first and third by the command, yet shown after its own
    // options and in the order the global arguments are declared.
    expect(helpFor(80, 'remove-everything')).toContain(
      'Options:\n' +
        '      --force  Force\n' +
        '  -h, --help   Show help\n' +
        '\n' +
        'Global Options:\n' +
        '      --format <value>  Output format [options: json, table, xml]\n' +
        '      --json            Output as JSON\n' +
        '  -y, --yes             Skip prompts\n'
    );
  });

  it('orders command groups as declared and shares one column', () => {
    expect(helpFor(80)).toContain(
      'Files:\n' +
        '  cp                 Copy files to, from, or within Tigris\n' +
        '  remove-everything  Remove objects\n' +
        '\n' +
        'CLI:\n' +
        '  help               Show general help\n'
    );
  });

  it('lists the global options a page is told about', () => {
    const program = buildProgram(80);
    setHelpDetails(program, {
      globalOptions: [new Option('--json', 'Output as JSON')],
    });
    expect(program.helpInformation()).toContain(
      'Global Options:\n      --json  Output as JSON\n'
    );
  });

  it('styles headings, terms and notes on a colour terminal only', () => {
    const bold = (text: string) => `\x1b[1m${text}\x1b[22m`;
    const styled = helpWith({ columns: 80, colors: true }, 'cp');
    expect(styled).toContain(`${bold('Options:')}\n`);
    expect(styled).toContain(`  ${bold('-r, --recursive')}`);
    expect(styled).toContain(
      `Output format\x1b[2m [options: json, table]\x1b[22m`
    );
    expect(helpWith({ columns: 80, colors: true })).toContain(
      `  ${bold('cp')}                 Copy files`
    );
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI
    expect(helpFor(80, 'cp')).not.toMatch(/\x1b/);
  });

  it('prints examples unwrapped', () => {
    expect(helpFor(30, 'cp')).toContain(
      'Examples:\n  tigris cp ./file.txt t3://my-bucket/file.txt\n'
    );
  });

  it('points at subcommand help from a command group only', () => {
    expect(helpFor(80)).toContain(
      'Use "tigris [command] --help" for more information about a command.'
    );
    expect(helpFor(80, 'cp')).not.toContain('for more information');
  });

  it('stacks descriptions under their term on a narrow terminal', () => {
    expect(helpFor(40, 'cp')).toContain(
      `\n  -r, --recursive\n${' '.repeat(10)}Copy directories recursively\n`
    );
  });

  it.each([30, 40, 50, 60, 80, 120])(
    'keeps every line within %i columns',
    (columns) => {
      for (const path of [[], ['cp'], ['remove-everything']]) {
        const lines = helpFor(columns, ...path).split('\n');
        const examples = lines.indexOf('Examples:');
        const wrapped = lines.filter(
          (line, index) =>
            // Examples are left unwrapped on purpose, and a single term can
            // be wider than a very narrow terminal.
            index !== examples + 1 && !/^ {2,6}-/.test(line)
        );
        for (const line of wrapped) {
          expect(line.length, line).toBeLessThanOrEqual(columns);
        }
      }
    }
  );
});
