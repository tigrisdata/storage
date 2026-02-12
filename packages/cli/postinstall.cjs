const { openSync, writeSync, closeSync } = require('fs');

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
