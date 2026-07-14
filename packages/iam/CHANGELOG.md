# @tigrisdata/iam

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
