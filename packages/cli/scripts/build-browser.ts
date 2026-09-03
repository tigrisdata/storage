#!/usr/bin/env tsx

/**
 * Browser bundle for the Tigris CLI.
 *
 * Driven by esbuild directly rather than tsup: tsup registers its own plugin
 * that marks Node builtins external before any alias is applied, which is the
 * one behaviour this build must override. tsup still generates the .d.ts —
 * see `tsup.browser.config.ts`.
 *
 * Run: npm run build:browser
 */

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shim = (name: string) => join(ROOT, 'src/browser/shims', name);

/**
 * Node-only modules the CLI reaches that must be swapped for the browser.
 *
 * Pure polyfills come from established packages (`memfs`, `path-browserify`,
 * `events`, `util`). Only modules whose *behaviour* has to change are
 * hand-written: `process` throws on exit and reports a TTY, `console` is
 * captured, and the prompt/login modules are re-pointed at the host terminal.
 */
const moduleAliases: Record<string, string> = {
  'node:fs': shim('node-fs.ts'),
  fs: shim('node-fs.ts'),
  'node:fs/promises': shim('node-fs-promises.ts'),
  'fs/promises': shim('node-fs-promises.ts'),
  'node:path': 'path-browserify',
  path: 'path-browserify',
  'node:os': shim('node-os.ts'),
  os: shim('node-os.ts'),
  'node:url': shim('node-url.ts'),
  url: shim('node-url.ts'),
  // Only the `node:` form is aliased: bare `util` must keep resolving to the
  // npm package, which the shim itself imports. Aliasing both would make the
  // shim resolve to itself (esbuild aliases subpaths too).
  'node:util': shim('node-util.ts'),
  'node:events': 'events',
  events: 'events',
  'node:crypto': shim('node-crypto.ts'),
  // `@tigrisdata/iam`'s bundle reaches for bare `crypto` (getRandomValues)
  // through a transitive dependency; Web Crypto covers it.
  crypto: shim('node-crypto.ts'),
  'node:readline': shim('node-readline.ts'),
  readline: shim('node-readline.ts'),
  'node:child_process': shim('node-child_process.ts'),
  'node:buffer': 'buffer',
  buffer: 'buffer',
  'node:stream': shim('node-stream.ts'),
  stream: shim('node-stream.ts'),
  'node:stream/promises': shim('node-stream-promises.ts'),
  'stream/promises': shim('node-stream-promises.ts'),
  child_process: shim('node-child_process.ts'),
  'node:process': shim('process-global.ts'),
  process: shim('process-global.ts'),

  // Interactive + platform packages, re-pointed at the host terminal.
  enquirer: shim('enquirer.ts'),
  open: shim('open.ts'),

  // Node-only dependencies that stay in the module graph but never run.
  '@clack/prompts': shim('empty.ts'),
  '@sentry/node': shim('empty.ts'),
  '@aws-sdk/credential-providers': shim('empty.ts'),
  '@smithy/shared-ini-file-loader': shim('empty.ts'),
  dotenv: shim('empty.ts'),
};

/**
 * Substitutions matched on the *resolved* file rather than the specifier,
 * because the CLI imports these by varying forms — `./telemetry.js` from a
 * sibling, `./utils/update-check.js` from the root, `@utils/analytics.js` via
 * the tsconfig alias. Matching the resolved path also keeps `src/lib/telemetry/*`
 * (real commands) distinct from `src/utils/telemetry.ts` (the stubbed module).
 */
const pathSubstitutions: Array<[RegExp, string]> = [
  [
    /src[\\/]utils[\\/](telemetry|telemetry-config|analytics)\.ts$/,
    shim('noop-telemetry.ts'),
  ],
  [
    /src[\\/]utils[\\/](update-check|install-method)\.ts$/,
    shim('noop-update.ts'),
  ],
  [/src[\\/]lib[\\/]login[\\/]oauth\.ts$/, shim('login-oauth.ts')],
  [/src[\\/]lib[\\/]logout\.ts$/, shim('logout.ts')],
];

const substitutions: esbuild.Plugin = {
  name: 'tigris-browser-substitutions',
  setup(build) {
    build.onResolve(
      {
        // Matches the import *specifier*, so it has to be loose:
        // `lib/login/select.ts` imports its sibling as `./oauth.js`, with no
        // "login" anywhere in it. The resolved-path check below is what
        // actually decides whether to substitute.
        filter:
          /(telemetry|telemetry-config|analytics|update-check|install-method|oauth|logout)/,
      },
      async (args) => {
        // Guard against recursing through our own resolve() call.
        if (args.pluginData?.tigrisResolved) return null;

        const resolved = await build.resolve(args.path, {
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: { tigrisResolved: true },
        });

        if (resolved.errors.length > 0) return null;

        for (const [pattern, replacement] of pathSubstitutions) {
          if (pattern.test(resolved.path)) return { path: replacement };
        }

        return resolved;
      }
    );
  },
};

const result = await esbuild.build({
  entryPoints: [join(ROOT, 'src/browser/index.ts')],
  outfile: join(ROOT, 'dist/browser/index.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  // 'external' writes the map but omits the sourceMappingURL comment, so the
  // map is available locally for debugging without being referenced by — or
  // published with — the bundle. `files` in package.json excludes it: at ~4 MB
  // it would otherwise land in every `npm install @tigrisdata/cli`, for a
  // bundle CLI users never load. The Node build ships no maps either.
  sourcemap: 'external',
  metafile: true,
  // Self-contained: consumers should not have to configure node polyfills.
  packages: 'bundle',
  alias: {
    ...moduleAliases,
    '@auth': join(ROOT, 'src/auth'),
    '@utils': join(ROOT, 'src/utils'),
  },
  // specs.yaml is embedded as a string, mirroring the bun binary build.
  loader: { '.yaml': 'text' },
  // Replace the free `process` and `console` identifiers throughout the bundle
  // — including dependencies — without mutating the page's globals.
  inject: [
    join(ROOT, 'src/browser/shims/process-global.ts'),
    join(ROOT, 'src/browser/shims/buffer-global.ts'),
    join(ROOT, 'src/browser/output.ts'),
  ],
  plugins: [substitutions],
});

// Opt-in: the metafile is ~1.5 MB and would otherwise ship in the package.
if (process.argv.includes('--metafile')) {
  writeFileSync(
    join(ROOT, 'dist/browser/metafile.json'),
    JSON.stringify(result.metafile, null, 2)
  );
}

// The invariant that matters: the bundle must be self-contained, so consumers
// never have to configure Node polyfills. Anything left as an import here is a
// shim we forgot. (Browser-field disables, e.g. readable-stream dropping `util`,
// are deliberate and do not appear as output imports.)
const leaked = Object.values(result.metafile.outputs).flatMap((output) =>
  (output.imports ?? [])
    .filter((entry) => entry.external)
    .map((entry) => entry.path)
);

if (leaked.length > 0) {
  console.error('Browser bundle is not self-contained; unshimmed imports:', [
    ...new Set(leaked),
  ]);
  process.exit(1);
}

const bytes =
  Object.values(result.metafile.outputs).find((output) => output.entryPoint)
    ?.bytes ?? 0;
console.log(
  `Browser bundle: ${(bytes / 1024).toFixed(0)} KB -> dist/browser/index.js`
);
