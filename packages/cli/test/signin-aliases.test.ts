import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as YAML from 'yaml';

// Dispatch records usage analytics; keep that off the network in tests.
vi.mock('@utils/analytics.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/analytics.js')>()),
  trackCommand: vi.fn(),
}));

import { createProgram, type ImplementationChecker } from '../src/cli-core.js';
import type { Specs } from '../src/types.js';

// `signin` and `signout` are aliases: `login` and `logout` stay the canonical
// commands, and every alias must reach exactly the same handler with exactly
// the same options.

const specs = YAML.parse(
  readFileSync(join(process.cwd(), 'src', 'specs.yaml'), 'utf8'),
  { schema: 'core' }
) as Specs;

const libRoot = join(process.cwd(), 'src', 'lib');
const hasImplementation: ImplementationChecker = (pathParts) =>
  pathParts.length > 0 &&
  (existsSync(`${join(libRoot, ...pathParts)}.ts`) ||
    existsSync(join(libRoot, ...pathParts, 'index.ts')));

interface Dispatch {
  path: string[];
  options: Record<string, unknown>;
}

/** Parse `argv` and return the handler path and options it dispatched to. */
async function dispatch(argv: string[]): Promise<Dispatch> {
  const calls: Dispatch[] = [];
  const program = createProgram({
    specs,
    version: '0.0.0',
    hasImplementation,
    loadModule: async (path) => ({
      module: {
        default: (options: Record<string, unknown>) => {
          calls.push({ path, options });
        },
      },
      error: null,
    }),
  });
  await program.parseAsync(argv, { from: 'user' });
  expect(calls).toHaveLength(1);
  return calls[0];
}

function helpFor(...names: string[]): string {
  const program = createProgram({
    specs,
    version: '0.0.0',
    hasImplementation,
    loadModule: async () => ({ module: null, error: 'not loaded' }),
  });
  let cmd = program;
  for (const name of names) {
    const next = cmd.commands.find((sub) => sub.name() === name);
    if (!next) throw new Error(`no command ${names.join(' ')}`);
    cmd = next;
  }
  return cmd.helpInformation();
}

describe('signin is an alias of login', () => {
  // [subcommand argv after the group name, handler it must reach]
  it.each([
    [[], ['login', 'select']],
    [['select'], ['login', 'select']],
    [['oauth'], ['login', 'oauth']],
    [['o'], ['login', 'oauth']],
    [['credentials'], ['login', 'credentials']],
    [['c'], ['login', 'credentials']],
  ])('login/signin %j both run %j', async (sub, handler) => {
    const viaLogin = await dispatch(['login', ...sub]);
    const viaSignin = await dispatch(['signin', ...sub]);
    expect(viaLogin.path).toEqual(handler);
    expect(viaSignin).toEqual(viaLogin);
  });

  it('passes the same flags through, on the group and on a subcommand', async () => {
    const flags = ['--access-key', 'tid_AaBb', '--access-secret', 'tsec_XxYy'];

    const group = await dispatch(['signin', ...flags]);
    expect(group).toEqual(await dispatch(['login', ...flags]));
    expect(group.path).toEqual(['login', 'select']);
    expect(group.options).toMatchObject({
      accessKey: 'tid_AaBb',
      accessSecret: 'tsec_XxYy',
    });

    const sub = await dispatch(['signin', 'credentials', ...flags, '--json']);
    expect(sub).toEqual(
      await dispatch(['login', 'credentials', ...flags, '--json'])
    );
    expect(sub.path).toEqual(['login', 'credentials']);
    expect(sub.options).toMatchObject({
      accessKey: 'tid_AaBb',
      accessSecret: 'tsec_XxYy',
      json: true,
    });
  });

  it('keeps the existing l alias', async () => {
    expect(await dispatch(['l', 'oauth'])).toEqual(
      await dispatch(['login', 'oauth'])
    );
  });
});

describe('signout is an alias of logout', () => {
  it('runs the logout handler', async () => {
    const viaLogout = await dispatch(['logout']);
    expect(viaLogout.path).toEqual(['logout']);
    expect(await dispatch(['signout'])).toEqual(viaLogout);
  });

  it('passes the same flags through', async () => {
    expect(await dispatch(['signout', '--json'])).toEqual(
      await dispatch(['logout', '--json'])
    );
  });
});

describe('help', () => {
  it('lists login and logout, not the aliases, on the root page', () => {
    const help = helpFor();
    expect(help).toMatch(/\n {2}login {2,}/);
    expect(help).toMatch(/\n {2}logout {2,}/);
    expect(help).not.toContain('signin');
    expect(help).not.toContain('signout');
  });

  it('names the aliases on the login and logout pages', () => {
    expect(helpFor('login')).toContain('Aliases:\n  login, l, signin\n');
    expect(helpFor('logout')).toContain('Aliases:\n  logout, signout\n');
  });
});
