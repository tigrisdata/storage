---
"@tigrisdata/cli": minor
---

Add `tigris init` to connect Tigris to AI coding agents. The interactive wizard
detects installed editors, installs/updates the CLI, writes the Tigris remote
MCP server config for 10 editors (Claude Code, Cursor, VS Code, Windsurf, Codex,
Antigravity CLI, Cline, Zed, Roo Code, opencode), and installs the Tigris agent
skills. `tigris init --agent` instead prints a plain-text setup recipe for a
coding agent to run itself.
