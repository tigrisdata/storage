const { openSync, writeSync, closeSync, mkdirSync, copyFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

// --- Install Claude Code SKILL.md ---
try {
  const claudeDir = join(homedir(), '.claude');
  const skillDir = join(claudeDir, 'skills', 'tigris');
  const source = join(__dirname, 'SKILL.md');

  if (existsSync(claudeDir) && existsSync(source)) {
    mkdirSync(skillDir, { recursive: true });
    copyFileSync(source, join(skillDir, 'SKILL.md'));
  }
} catch (e) {
  // Fail silently — permission issues, CI, etc.
}

// --- Show banner ---
try {
  const tty = openSync('/dev/tty', 'w');

  const banner = `
  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │   _____ ___ ___ ___ ___ ___    ___ _    ___                       │
  │  |_   _|_ _/ __| _ \\_ _/ __|  / __| |  |_ _|                      │
  │    | |  | | (_ |   /| |\\__ \\ | (__| |__ | |                       │
  │    |_| |___\\___|_|_\\___|___/  \\___|____|___|                      │
  │                                                                   │
  │  To get started:                                                  │
  │    $ tigris login                                                 │
  │                                                                   │
  │  For help:                                                        │
  │    $ tigris help                                                  │
  │                                                                   │
  │  Tip - You can use 't3' as a shorthand for 'tigris':              │
  │    $ t3 login                                                     │
  │                                                                   │
  │  Docs: https://www.tigrisdata.com/docs/cli/                       │
  │                                                                   │
  └───────────────────────────────────────────────────────────────────┘
`;

  writeSync(tty, banner);
  closeSync(tty);
} catch (e) {
  // No TTY available (CI, Docker, non-interactive) — skip silently
}
