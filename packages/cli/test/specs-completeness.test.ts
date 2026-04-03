import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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
        const filePath = join(srcRoot, ...path) + '.ts';
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
