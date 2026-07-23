import { getOption } from '@utils/options.js';

import { runInteractive } from './interactive.js';
import { AGENT_SETUP } from './plan.js';

/**
 * `tigris init` — two modes:
 *  - bare (interactive): set up the local AI tooling (CLI, MCP config, skills),
 *    then hand the user a command to give their agent.
 *  - `--agent`: print a plain-text onboarding recipe for an AI coding agent to
 *    follow (it runs the `tigris` commands itself).
 */
export default async function init(options: Record<string, unknown>) {
  const agentMode = getOption<boolean>(options, ['agent']);

  // init manages CLI currency itself (ensureCli here, steps 1–2 in the recipe),
  // so suppress the CLI's post-command update-notifier — it's redundant and, on
  // a TTY, would print mid-wizard or pollute the --agent recipe on stdout.
  process.env.TIGRIS_NO_UPDATE_CHECK = '1';

  if (!agentMode) {
    await runInteractive();
    return;
  }

  console.log(AGENT_SETUP);
}
