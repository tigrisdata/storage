---
'@tigrisdata/iam': minor
---

Add `createTeam`, `editTeam`, and `listTeams` for managing teams within an organization.

- `createTeam(team, options?)` creates a team from a `CreateTeamInput` (`name` required, optional `description` and `members`) and returns the new `teamId`.
- `editTeam(teamId, team, options?)` applies a partial update (`Partial<CreateTeamInput>`); it errors with `No fields to update` when no fields are provided.
- `listTeams(options?)` returns the organization's teams, each mapped to a `Team` (`id`, `name`, `description`, `members`, `createdAt`, `updatedAt`).

Also exports the `CreateTeamInput`, `CreateTeamOptions`, `CreateTeamResponse`, `EditTeamOptions`, `EditTeamResponse`, `ListTeamsOptions`, `ListTeamsResponse`, and `Team` types.

```ts
import { createTeam, editTeam, listTeams } from '@tigrisdata/iam';

const { data } = await createTeam({
  name: 'engineering',
  description: 'Engineering team',
  members: ['user@example.com'],
});

await editTeam(data.teamId, { name: 'engineering-renamed' });

const { data: teams } = await listTeams();
```
