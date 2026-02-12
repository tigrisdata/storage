const { openSync, writeSync, closeSync } = require('fs');

try {
  const tty = openSync('/dev/tty', 'w');

  const banner = `
  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │  .___________. __    _______ .______       __       _______.      │
  │  |           ||  |  /  _____||   _  \\     |  |     /       |      │
  │  \`---|  |----\`|  | |  |  __  |  |_)  |    |  |    |   (----\`      │
  │      |  |     |  | |  | |_ | |      /     |  |     \\   \\          │
  │      |  |     |  | |  |__| | |  |\\  \\----.|  | .----)   |         │
  │      |__|     |__|  \\______| | _| \`._____||__| |_______/          │
  │                                                                   │
  │  Welcome to Tigris CLI!                                           │
  │                                                                   │
  │  For help:                                                        │
  │    $ tigris help                                                  │
  │                                                                   │
  │  To get started:                                                  │
  │    $ tigris login                                                 │
  │                                                                   │
  │  Tip: You can use t3 as a shorthand:                              │
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
