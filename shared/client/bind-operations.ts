import type { TigrisResponse } from '../types';

// biome-ignore lint/suspicious/noExplicitAny: generic binder over an arbitrary function namespace
type AnyFn = (...args: any[]) => any;

export type BindOperationsOptions<BareConfigKeys extends string> = {
  /**
   * Names of exports whose last parameter is a bare config value, not
   * an options object with a `config` field — e.g.
   * `handleClientUpload(request, config?)`. Everything else in the
   * public barrel follows the options-object convention and needs no
   * entry here.
   */
  bareConfigParams?: readonly BareConfigKeys[];
};

/**
 * Attaches every function export in `ns` (skipping non-function
 * exports like enums and type-only exports, which don't exist at
 * runtime) as a bound method: the trailing options object gets
 * `config` injected from `buildConfig`, and a `bucket` field — when
 * present on that options object — is pulled off and passed to
 * `buildConfig` as a per-call override.
 *
 * This is what makes attachment automatic: `ns` is meant to be a
 * package's own public barrel (`import * as ops from '../server'`),
 * so a new bare function exported there becomes a bound method with
 * zero changes here, both at runtime (this loop) and in the type
 * ({@link BoundOperations}, a mapped type over `typeof ns`).
 *
 * Uses each function's declared arity (`fn.length`), not how many
 * arguments the caller actually passed, to find the options
 * parameter. That distinction matters: it correctly handles both an
 * omitted trailing options arg (`head(path)`) and a positional data
 * argument that happens to be a plain object with options omitted
 * (`createTeam(input)`) — `fn.length` reflects the function's
 * declared shape either way, not what a particular call happened to
 * include.
 */
export function bindOperations<
  NS extends Record<string, unknown>,
  const BareConfigKeys extends string = never,
>(
  ns: NS,
  buildConfig: (bucket?: string) => Promise<TigrisResponse<unknown>>,
  options?: BindOperationsOptions<BareConfigKeys>
): BoundOperations<NS, BareConfigKeys> {
  const bareConfigParams = new Set<string>(options?.bareConfigParams ?? []);
  const bound: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ns)) {
    if (typeof value !== 'function') continue;
    const fn = value as AnyFn;
    const arity = fn.length;

    bound[key] = async (...args: unknown[]) => {
      // Padded to exactly `arity - 1` slots (not `args.slice`) so an
      // omitted leading positional arg passes through as an explicit
      // `undefined` in its own slot rather than letting the trailing
      // options object slide left into it. That distinction matters
      // for functions with a polymorphic first parameter (e.g.
      // `listForks(sourceBucketName?: string | Options, options?)`):
      // a bare-function caller who passes one bare options object
      // relies on that function's own `typeof x === 'object'` runtime
      // check to re-route it — sliding it into the first slot would
      // trigger that same re-routing here and strand the *second*
      // argument (where `config` lives) off the end, unread.
      const positionalCount = Math.max(arity - 1, 0);
      const positional = Array.from(
        { length: positionalCount },
        (_, i) => args[i]
      );

      if (bareConfigParams.has(key)) {
        const { data: config, error } = await buildConfig();
        if (error) return { error };
        return fn(...positional, config);
      }

      const { bucket, ...rest } = (args[arity - 1] ?? {}) as {
        bucket?: string;
      };
      const { data: config, error } = await buildConfig(bucket);
      if (error) return { error };
      return fn(...positional, { ...rest, config });
    };
  }

  return bound as BoundOperations<NS, BareConfigKeys>;
}

type WithBucketOverride<Opts> = Omit<Opts, 'config'> & { bucket?: string };

type BoundFn<
  K extends PropertyKey,
  F,
  BareConfigKeys extends string,
> = F extends (...args: [...infer Head, infer Opts]) => infer R
  ? K extends BareConfigKeys
    ? F
    : undefined extends Opts
      ? (...args: [...Head, WithBucketOverride<NonNullable<Opts>>?]) => R
      : (...args: [...Head, WithBucketOverride<Opts>]) => R
  : F;

/**
 * Structural type of what {@link bindOperations} produces at runtime:
 * every function export of `NS`, with its trailing options parameter
 * stripped of `config` (injected internally) and given a `bucket?`
 * override, minus any keys in `BareConfigKeys` (kept unchanged).
 * Non-function exports (enums, re-exported types) are dropped, same
 * as the runtime loop.
 */
export type BoundOperations<NS, BareConfigKeys extends string = never> = {
  [K in keyof NS as NS[K] extends AnyFn ? K : never]: K extends keyof NS
    ? BoundFn<K, NS[K], BareConfigKeys>
    : never;
};
