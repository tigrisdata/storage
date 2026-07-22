import { getOption } from '@utils/options.js';

import { runInteractive } from './interactive.js';
import { emitGettingStarted } from './plan.js';

/**
 * `tigris init` — two modes:
 *  - bare (interactive): set up the local AI tooling (CLI, MCP config, skills),
 *    then hand the user a command to give their agent.
 *  - `--agent --getting-started`: emit a JSON onboarding plan (a list of
 *    `{ id, description, command }` steps) for an AI coding agent to execute.
 */
export default async function init(options: Record<string, unknown>) {
  const agentMode = getOption<boolean>(options, ['agent']);

  if (!agentMode) {
    await runInteractive();
    return;
  }

  // Only one step today; --getting-started is the default.
  emitGettingStarted();
}
