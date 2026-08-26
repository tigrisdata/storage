# @tigrisdata/iam

## 2.4.0

### Minor Changes

- [#270](https://github.com/tigrisdata/storage/pull/270) [`bf9b848`](https://github.com/tigrisdata/storage/commit/bf9b84802dfcd8e9aedaac516b7d6b6e6678689c) Thanks [@designcode](https://github.com/designcode)! - Add opt-in request retry and injectable error hooks to the HTTP client.

  `retry` can be set on any `config` option, or per request. It is opt-in —
  omitted or `false` performs a single attempt, matching existing behavior. When
  enabled it defaults to 3 attempts with exponential backoff and full jitter,
  honors `Retry-After`, and retries only `408`, `429`, and `5xx`; `400` and `403`
  are deliberately excluded because they are deterministic for this client.
  `shouldRetry` overrides the decision entirely.

  Transport failures — where the request never produced a response — are treated
  separately from status codes, because the outcome is unknown and a write may
  already have landed. They are retried only when the request method is safe to
  re-send (`GET` and `HEAD`); enabling `retry` on a `POST`, `PUT`, `PATCH`, or
  `DELETE` retries retryable statuses but not transport failures. Set
  `retryNetworkErrors: true` to opt a known-safe operation back in. Status-code
  retries are unaffected by the method.

  ```ts
  await updateBucket("my-bucket", {
    access: "public",
    config: { retry: { attempts: 5 } },
  });
  ```

  `setTigrisHttpHooks({ onError, onRetry })` registers process-wide observability
  callbacks so telemetry (Sentry, logging, metrics) can be wired in without this
  SDK taking on the dependency. Hooks are observational: a throwing or rejecting
  hook can never fail a request, and none are awaited. A single registration
  covers every Tigris SDK package in the process, so registering through
  `@tigrisdata/storage` also reports `@tigrisdata/iam` failures.

  The hook context reports `origin` and `path` separately, so a consumer can use
  the host-independent `path` as an identifier or recompose the absolute URL as
  `${origin}${path}` to match what another HTTP client would report for the same
  endpoint. The `shouldRetry` predicate receives the same pair.

  Both `retry` and the hooks cover requests made through the Tigris HTTP client —
  the bucket, fork, and IAM operations. Object data-plane calls (`put`, `get`,
  `list`, multipart) go through the AWS SDK's S3 client, which applies its own
  retry policy and is not covered by the hooks.

  Also fixes a latent crash where a 2xx response carrying a JSON content-type but
  an empty body — as `POST ?restore` returns — threw a parse error out of
  `request()` instead of resolving.

## 2.3.0

### Minor Changes

- [#257](https://github.com/tigrisdata/storage/pull/257) [`6b090d4`](https://github.com/tigrisdata/storage/commit/6b090d4a6ec16908db636ae1a5a30232a77f5fb4) Thanks [@designcode](https://github.com/designcode)! - Introduces deleteTeam method in iam package

## 2.2.2

### Patch Changes

- [#206](https://github.com/tigrisdata/storage/pull/206) [`e44ef8a`](https://github.com/tigrisdata/storage/commit/e44ef8a784d32d9733196ae754b2fdd519552698) Thanks [@designcode](https://github.com/designcode)! - Fix `listPolicies` never returning a `paginationToken`. The `IsTruncated` and `Marker` fields are nested inside `ListPoliciesResult` in the API response, but were being read from the top level, so the next-page token was always `undefined`.

## 2.2.1

### Patch Changes

- [#183](https://github.com/tigrisdata/storage/pull/183) [`a06a2bb`](https://github.com/tigrisdata/storage/commit/a06a2bb0234f6e0ddeb0c699d3e559ea94e94cb3) Thanks [@designcode](https://github.com/designcode)! - Stop mutating the global `process.env` when loading configuration. Previously, importing the server entry ran `dotenv.config()` as an import-time side effect, loading the consuming app's entire `.env` (including unrelated keys) into `process.env`.

  Configuration is now resolved on demand, per operation, directly from the environment: the SDK parses `.env` into a private object (never touching `process.env`), keeps only `TIGRIS_`-prefixed keys, and prefers explicitly-set `process.env` values. Importing the SDK no longer has side effects, and apps that manage their own environment are no longer overridden.

## 2.2.0

### Minor Changes

- [#166](https://github.com/tigrisdata/storage/pull/166) [`263e952`](https://github.com/tigrisdata/storage/commit/263e952183228ba1612e9dcfcc1f29ba2410bee3) Thanks [@designcode](https://github.com/designcode)! - Add `createTeam`, `editTeam`, and `listTeams` for managing teams within an organization.

  - `createTeam(team, options?)` creates a team from a `CreateTeamInput` (`name` required, optional `description` and `members`) and returns the new `teamId`.
  - `editTeam(teamId, team, options?)` applies a partial update (`Partial<CreateTeamInput>`); it errors with `No fields to update` when no fields are provided.
  - `listTeams(options?)` returns the organization's teams, each mapped to a `Team` (`id`, `name`, `description`, `members`, `createdAt`, `updatedAt`).

  Also exports the `CreateTeamInput`, `CreateTeamOptions`, `CreateTeamResponse`, `EditTeamOptions`, `EditTeamResponse`, `ListTeamsOptions`, `ListTeamsResponse`, and `Team` types.

  ```ts
  import { createTeam, editTeam, listTeams } from "@tigrisdata/iam";

  const { data } = await createTeam({
    name: "engineering",
    description: "Engineering team",
    members: ["user@example.com"],
  });

  await editTeam(data.teamId, { name: "engineering-renamed" });

  const { data: teams } = await listTeams();
  ```
