/**
 * Write AGENT-SETUP.md: the `tigris init --agent` recipe as a file the website
 * can serve at the URL the paste-in prompt points to, for agents that cannot
 * run commands (chat clients, browser-only agents) and for people who would
 * rather read it first.
 *
 * Rendered for a machine without the CLI, since that is the state a reader
 * following the URL is most likely in; the recipe's first step then installs
 * it. A test asserts the file matches, so it is regenerated in the same PR as
 * any change to plan.ts:
 *
 *     npm run generate:agent-setup
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentPrompt, buildAgentSetup } from '../src/lib/init/plan.js';

export function renderAgentSetupMarkdown(): string {
  return [
    '# Set up Tigris in this project',
    '',
    'Instructions for an AI coding agent. If you are a person, paste this line into your agent:',
    '',
    `> ${buildAgentPrompt()}`,
    '',
    'If the agent can run commands, `npx tigris init --agent` prints the current version of the steps below. If not, follow the steps from here.',
    '',
    '---',
    '',
    buildAgentSetup(false).trimEnd(),
    '',
  ].join('\n');
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'AGENT-SETUP.md'
  );
  writeFileSync(out, renderAgentSetupMarkdown());
  console.log(`Wrote ${out}`);
}
