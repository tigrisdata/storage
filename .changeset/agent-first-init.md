---
'@tigrisdata/cli': minor
---

`tigris init` learns to set up an agent without asking questions, and the `--agent` recipe now covers an existing project end to end.

- `tigris init --yes` installs the defaults (MCP server globally, all skills project-level) for the editors it detects from the environment, so an agent following the recipe can configure itself; `--editor <id>[,<id>]` chooses explicitly.
- `tigris init --agent --bucket <name>` writes a recipe that uses an existing bucket (the one storage.new created at signup) instead of inferring and creating one.
- The recipe gains steps for the agent's own MCP/skills setup, for wiring the project's code (keep an existing S3 client and point it at Tigris, or add the SDK with one small example), and for proving the result with an upload and a read before reporting back.
- `buildAgentPrompt()` is the one line a person pastes into any agent; the interactive wizard's hand-off now prints it. `AGENT-SETUP.md` is the same recipe as a file, for agents that cannot run commands, kept in sync by a test (`npm run generate:agent-setup`).
