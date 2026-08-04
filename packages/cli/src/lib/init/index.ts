import { getOption } from '@utils/options.js';

import { runInteractive } from './interactive.js';
import { buildAgentSetup } from './plan.js';
import { getInstalledCliVersion, withoutEphemeralBins } from './shared.js';

/**
 * `tigris init` — two modes:
 *  - bare (interactive): set up the local AI tooling (CLI, MCP config, skills),
 *    then hand the user a command to give their agent.
 *  - `--agent`: print a plain-text onboarding recipe for an AI coding agent to
 *    follow (it runs the `tigris` commands itself).
 */
export default async function init(options: Record<string, unknown>) {
  const agentMode = getOption<boolean>(options, ['agent']);

  // init manages CLI currency itself (updateCli here, step 1 in the recipe),
  // so suppress the CLI's post-command update-notifier — it's redundant and, on
  // a TTY, would print mid-wizard or pollute the --agent recipe on stdout.
  process.env.TIGRIS_NO_UPDATE_CHECK = '1';

  // Under `npx tigris init` this process *is* the CLI, reached through a bin
  // directory npx drops from PATH as soon as it exits. Strip those entries for
  // the whole command so no probe, update or handoff below can mistake that
  // throwaway copy for an installed CLI.
  process.env.PATH = withoutEphemeralBins(process.env.PATH);

  if (!agentMode) {
    await runInteractive();
    return;
  }

  // Reached through `npx` (no `tigris` on PATH) the recipe has to install the
  // CLI first; otherwise it just keeps the existing one current.
  console.log(buildAgentSetup(getInstalledCliVersion() !== null));
}
