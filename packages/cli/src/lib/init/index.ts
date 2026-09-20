import { getOption } from '@utils/options.js';

import { NO_BANNER_ENV } from '../../constants.js';
import { runInteractive, runNonInteractive } from './interactive.js';
import { buildAgentSetup } from './plan.js';
import { getInstalledCliVersion, withoutEphemeralBins } from './shared.js';

/**
 * `tigris init` — three modes:
 *  - bare (interactive): set up the local AI tooling (CLI, MCP config, skills),
 *    then hand the user a prompt to give their agent.
 *  - `--yes` (non-interactive): the same with the defaults and no questions,
 *    for the editor(s) given with `--editor` or detected from the environment.
 *    This is how an agent sets *itself* up while following the recipe.
 *  - `--agent`: print a plain-text onboarding recipe for an AI coding agent to
 *    follow (it runs the `tigris` commands itself). `--bucket` names a bucket
 *    that already exists, so the recipe uses it instead of creating one.
 */
export default async function init(options: Record<string, unknown>) {
  const agentMode = getOption<boolean>(options, ['agent']);
  const yes = getOption<boolean>(options, ['yes', 'y']);
  const editors = getOption<string[] | string>(options, ['editor', 'e']);
  const bucket = getOption<string>(options, ['bucket', 'b']);

  // init manages CLI currency itself (updateCli here, step 1 in the recipe),
  // so suppress the CLI's post-command update-notifier — it's redundant and, on
  // a TTY, would print mid-wizard or pollute the --agent recipe on stdout.
  process.env.TIGRIS_NO_UPDATE_CHECK = '1';

  // Likewise for the package's postinstall banner, which the CLI install and
  // update below would each trigger. It is written straight to /dev/tty, so it
  // escapes the captured stdio of those children and lands on top of the
  // wizard's own prompts. Inherited by every child from here on.
  process.env[NO_BANNER_ENV] = '1';

  // Under `npx tigris init` this process *is* the CLI, reached through a bin
  // directory npx drops from PATH as soon as it exits. Strip those entries for
  // the whole command so no probe, update or handoff below can mistake that
  // throwaway copy for an installed CLI.
  process.env.PATH = withoutEphemeralBins(process.env.PATH);

  if (!agentMode) {
    if (yes || editors) {
      await runNonInteractive(
        editors === undefined
          ? undefined
          : Array.isArray(editors)
            ? editors
            : [editors]
      );
    } else {
      await runInteractive();
    }
    return;
  }

  // Reached through `npx` (no `tigris` on PATH) the recipe has to install the
  // CLI first; otherwise it just keeps the existing one current.
  console.log(
    buildAgentSetup(getInstalledCliVersion() !== null, {
      ...(bucket ? { bucket } : {}),
    })
  );
}
