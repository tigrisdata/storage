import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as YAML from 'yaml';

import type { CommandSpec, Specs } from '../src/types.js';
import { loadSpecs, setSpecs } from '../src/utils/specs.js';

interface LeafCommand {
  spec: CommandSpec;
  path: string[];
}

/**
 * Recursively walk the spec tree and collect all leaf commands.
 * A leaf is a command with no children, OR whose only role is as a
 * default target of its parent (in which case the parent routes to it).
 */
function collectLeaves(
  commands: CommandSpec[],
  parentPath: string[] = []
): LeafCommand[] {
  const leaves: LeafCommand[] = [];

  for (const cmd of commands) {
    // Removed commands are tombstones — no handler, no messages block.
    if (cmd.removed) continue;

    const currentPath = [...parentPath, cmd.name];

    if (!cmd.commands || cmd.commands.length === 0) {
      // No children → leaf
      leaves.push({ spec: cmd, path: currentPath });
    } else {
      // Has children → recurse into them
      leaves.push(...collectLeaves(cmd.commands, currentPath));
    }
  }

  return leaves;
}

/**
 * Recursively collect ALL commands (not just leaves) for structural checks.
 */
function collectAllCommands(
  commands: CommandSpec[],
  parentPath: string[] = []
): LeafCommand[] {
  const all: LeafCommand[] = [];

  for (const cmd of commands) {
    const currentPath = [...parentPath, cmd.name];
    all.push({ spec: cmd, path: currentPath });

    if (cmd.commands && cmd.commands.length > 0) {
      all.push(...collectAllCommands(cmd.commands, currentPath));
    }
  }

  return all;
}

const srcRoot = join(process.cwd(), 'src', 'lib');

// Pre-populate specs cache from source YAML so we don't need dist/
const specsYaml = readFileSync(
  join(process.cwd(), 'src', 'specs.yaml'),
  'utf8'
);
setSpecs(YAML.parse(specsYaml, { schema: 'core' }) as Specs);

describe('specs completeness', () => {
  const specs = loadSpecs();
  const leaves = collectLeaves(specs.commands);
  const allCommands = collectAllCommands(specs.commands);

  it('found leaf commands to validate', () => {
    expect(leaves.length).toBeGreaterThan(0);
  });

  describe('every leaf command has a handler file', () => {
    for (const { path } of leaves) {
      const label = path.join(' ');
      it(`${label}`, () => {
        const filePath = `${join(srcRoot, ...path)}.ts`;
        const indexPath = join(srcRoot, ...path, 'index.ts');
        const exists = existsSync(filePath) || existsSync(indexPath);
        expect(exists, `Missing handler: ${filePath} or ${indexPath}`).toBe(
          true
        );
      });
    }
  });

  describe('every leaf command has a messages block', () => {
    for (const { spec, path } of leaves) {
      const label = path.join(' ');
      it(`${label}`, () => {
        expect(
          spec.messages,
          `${label} is missing a messages block`
        ).toBeDefined();
      });
    }
  });

  describe('no duplicate argument names within a command', () => {
    for (const { spec, path } of allCommands) {
      if (!spec.arguments || spec.arguments.length === 0) continue;
      const label = path.join(' ');
      it(`${label}`, () => {
        const names = spec.arguments!.map((a) => a.name);
        expect(names.length).toBe(new Set(names).size);
      });
    }
  });

  describe('no alias collisions within a command', () => {
    for (const { spec, path } of allCommands) {
      if (!spec.arguments || spec.arguments.length === 0) continue;
      const label = path.join(' ');
      it(`${label}`, () => {
        const names = spec.arguments!.map((a) => a.name);
        const aliases = spec
          .arguments!.filter((a) => a.alias)
          .map((a) => a.alias as string);

        // No alias should match another arg's name
        for (const alias of aliases) {
          // An alias matching its own arg's name is fine (long alias pattern),
          // but it shouldn't match a *different* arg's name
          const argsWithThisAlias = spec.arguments!.filter(
            (a) => a.alias === alias
          );
          const otherNames = names.filter(
            (n) => !argsWithThisAlias.some((a) => a.name === n) && n === alias
          );
          expect(
            otherNames.length,
            `Alias "${alias}" collides with arg name in ${label}`
          ).toBe(0);
        }

        // No two aliases should be the same
        expect(aliases.length).toBe(new Set(aliases).size);
      });
    }
  });

  describe('nextActions entries have command and description', () => {
    const withNextActions = allCommands.filter(
      ({ spec }) =>
        spec.messages && (spec.messages as Record<string, unknown>).nextActions
    );

    if (withNextActions.length === 0) {
      it('no commands with nextActions found (skip)', () => {
        expect(true).toBe(true);
      });
    }

    for (const { spec, path } of withNextActions) {
      const label = path.join(' ');
      it(`${label}`, () => {
        const nextActions = (spec.messages as Record<string, unknown>)
          .nextActions as Array<Record<string, unknown>>;
        expect(Array.isArray(nextActions)).toBe(true);
        expect(nextActions.length).toBeGreaterThan(0);
        for (const action of nextActions) {
          expect(action).toHaveProperty('command');
          expect(action).toHaveProperty('description');
          expect(typeof action.command).toBe('string');
          expect(typeof action.description).toBe('string');
          expect((action.command as string).length).toBeGreaterThan(0);
          expect((action.description as string).length).toBeGreaterThan(0);
        }
      });
    }
  });

  // Help lists show `help_text ?? description` on one row per entry. Past
  // these lengths a row wraps to three or more lines on an 80-column terminal
  // and the list stops being scannable — add a shorter `help_text` instead of
  // trimming the `description`, which the command's own page and the docs use.
  describe('help text is precise', () => {
    const MAX_COMMAND_HELP = 60;
    const MAX_ARGUMENT_HELP = 80;
    const live = allCommands.filter(({ spec }) => !spec.removed);

    it(`command help text fits in ${MAX_COMMAND_HELP} characters`, () => {
      const tooLong = live
        .map(({ spec, path }) => ({
          label: path.join(' '),
          text: spec.help_text ?? spec.description ?? '',
        }))
        .filter(({ text }) => text.length > MAX_COMMAND_HELP)
        .map(({ label, text }) => `${label} (${text.length}): ${text}`);
      expect(tooLong).toEqual([]);
    });

    it(`argument help text fits in ${MAX_ARGUMENT_HELP} characters`, () => {
      const globalArgs = specs.definitions?.global_arguments ?? [];
      const tooLong = [
        ...globalArgs.map((arg) => ({ label: 'global', arg })),
        ...live.flatMap(({ spec, path }) =>
          (spec.arguments ?? []).map((arg) => ({ label: path.join(' '), arg }))
        ),
      ]
        .filter(({ arg }) => !arg.removed)
        .map(({ label, arg }) => ({
          label: `${label} --${arg.name}`,
          text: arg.help_text ?? arg.description ?? '',
        }))
        .filter(({ text }) => text.length > MAX_ARGUMENT_HELP)
        .map(({ label, text }) => `${label} (${text.length}): ${text}`);
      expect(tooLong).toEqual([]);
    });

    it('every command list row fits on one 80-column line', () => {
      // Mirrors the layout in src/help.ts: 2 indent + the widest sibling
      // name + 2 spacer, then the text.
      const lists = [
        { label: specs.name, commands: specs.commands },
        ...live
          .filter(({ spec }) => spec.commands && spec.commands.length > 0)
          .map(({ spec, path }) => ({
            label: path.join(' '),
            commands: spec.commands ?? [],
          })),
      ];
      const wrapped = lists.flatMap(({ label, commands }) => {
        const visible = commands.filter((cmd) => !cmd.removed);
        const column =
          2 + Math.max(...visible.map((cmd) => cmd.name.length)) + 2;
        return visible
          .filter(
            (cmd) =>
              column + (cmd.help_text ?? cmd.description ?? '').length > 80
          )
          .map((cmd) => `${label} ${cmd.name}`);
      });
      expect(wrapped).toEqual([]);
    });

    it('help_text is a single line without a trailing period', () => {
      const malformed = live
        .flatMap(({ spec, path }) => [
          { label: path.join(' '), text: spec.help_text },
          ...(spec.arguments ?? []).map((arg) => ({
            label: `${path.join(' ')} --${arg.name}`,
            text: arg.help_text,
          })),
        ])
        .filter(
          ({ text }) =>
            text !== undefined && (/\n/.test(text) || /\.$/.test(text.trim()))
        )
        .map(({ label, text }) => `${label}: ${text}`);
      expect(malformed).toEqual([]);
    });
  });

  describe('command groups', () => {
    const parents = [
      { label: specs.name, groups: specs.groups, commands: specs.commands },
      ...allCommands
        .filter(({ spec }) => spec.commands && spec.commands.length > 0)
        .map(({ spec, path }) => ({
          label: path.join(' '),
          groups: spec.groups,
          commands: spec.commands ?? [],
        })),
    ];

    it('every group is one its parent declares', () => {
      // A typo would otherwise render as a new heading of its own.
      const unknown = parents.flatMap(({ label, groups, commands }) =>
        commands
          .filter((cmd) => cmd.group && !(groups ?? []).includes(cmd.group))
          .map((cmd) => `${label} ${cmd.name}: ${cmd.group}`)
      );
      expect(unknown).toEqual([]);
    });

    it('a parent that declares groups leaves no command ungrouped', () => {
      const ungrouped = parents
        .filter(({ groups }) => groups && groups.length > 0)
        .flatMap(({ label, commands }) =>
          commands
            .filter((cmd) => !cmd.removed && !cmd.group)
            .map((cmd) => `${label} ${cmd.name}`)
        );
      expect(ungrouped).toEqual([]);
    });

    it('every declared group is used', () => {
      const unused = parents.flatMap(({ label, groups, commands }) =>
        (groups ?? [])
          .filter((group) => !commands.some((cmd) => cmd.group === group))
          .map((group) => `${label}: ${group}`)
      );
      expect(unused).toEqual([]);
    });
  });

  describe('--yes is listed exactly where a command confirms', () => {
    // The global --yes is hidden; a command lists it by declaring
    // *yes_argument. Handlers read it as getOption(options, ['yes', ...]).
    for (const { spec, path } of leaves) {
      const label = path.join(' ');
      it(`${label}`, () => {
        const filePath = `${join(srcRoot, ...path)}.ts`;
        const indexPath = join(srcRoot, ...path, 'index.ts');
        const source = readFileSync(
          existsSync(filePath) ? filePath : indexPath,
          'utf8'
        );
        const readsYes = /getOption[^;]*\[\s*'yes'/.test(source);
        const declaresYes = (spec.arguments ?? []).some(
          (arg) => arg.name === 'yes' && !arg.hidden
        );
        expect(declaresYes).toBe(readsYes);
      });
    }
  });

  describe('deprecated commands have onDeprecated message', () => {
    const deprecated = allCommands.filter(({ spec }) => spec.deprecated);

    if (deprecated.length === 0) {
      it('no deprecated commands found (skip)', () => {
        expect(true).toBe(true);
      });
    }

    for (const { spec, path } of deprecated) {
      const label = path.join(' ');
      it(`${label}`, () => {
        expect(
          spec.messages?.onDeprecated,
          `Deprecated command ${label} is missing onDeprecated message`
        ).toBeDefined();
      });
    }
  });
});
