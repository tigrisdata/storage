/**
 * The onboarding recipe printed by `tigris init --agent`.
 *
 * This does NOT execute anything — it is a plain-text set of steps for an AI
 * coding agent to follow, running the listed `tigris` commands itself and
 * making decisions per step.
 */

/**
 * The recipe always opens with exactly one CLI step, picked from what `init`
 * already detected rather than left to the agent to work out. Install when
 * `tigris` isn't on PATH — i.e. the recipe was reached through `npx`; update
 * when it is. `tigris update` runs its own version check and knows how the CLI
 * was installed, so it's safe to run unconditionally.
 */
const INSTALL_STEP =
  'Ask the user for permission. Then install the CLI: `npm install -g @tigrisdata/cli --ignore-scripts`.';
const UPDATE_STEP = 'Update the CLI to the latest version: `tigris update`.';

const SETUP_STEPS = [
  'Run `tigris whoami` to get the authentication state. If the user is not authenticated, run `tigris login oauth`.',
  'Run `tigris orgs list --format json`. If there is more than one org, ask the user which org to use. If there is more than one org, run `tigris orgs select <org>` to make that org active. The commands that come after target the active org.',
  'Read the project name from a metadata file, for example package.json, go.mod, or pyproject.toml. Run `tigris buckets list --format json` first. If the bucket is absent, run `tigris buckets create <name> --format json`. If anything is ambiguous, ask the user.',
  `Identify the SDK that the code uses: Tigris SDK (@tigrisdata/storage, storage-go) or the AWS SDK. Check that \`.env\` can be written: \`test -w . && { test ! -e .env || test -w .env; }\`. If that fails, fix the permissions before you continue. Then create an access key with the Editor role on the bucket and write its credentials to \`.env\` in one step:
   \`tigris access-keys create <username>-<project>-devel --bucket <bucket> --role Editor --env --for tigris\`
   Pass \`--for aws\` instead for the AWS SDK. While the write succeeds, the secret goes to \`.env\` only and is not printed. Do not read \`.env\` into your context. If \`tigris access-keys create\` exits non-zero, it printed the credentials instead: delete that key with \`tigris access-keys delete <id> --yes\`, fix the cause, and run it again. If the command warns that \`.env\` is not ignored by \`.gitignore\`, add it.

   Variables written for Tigris SDK:
     TIGRIS_STORAGE_ACCESS_KEY_ID, TIGRIS_STORAGE_SECRET_ACCESS_KEY, TIGRIS_STORAGE_BUCKET
   Variables written for the AWS SDK:
     AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_ENDPOINT_URL_IAM, AWS_REGION`,
  `Congratulate the user. Then give these links:
   - JS:    https://www.tigrisdata.com/docs/sdks/tigris/
   - Go:    https://pkg.go.dev/github.com/tigrisdata/storage-go
   - Docs:  https://www.tigrisdata.com/docs/
   - Discord: https://community.tigrisdata.com/
   - Skills: https://www.tigrisdata.com/docs/skills/

   Suggest that the user adds these lines to the agent configuration file:
     > ## Tigris object storage
     > This project uses Tigris. Read https://www.tigrisdata.com/llms.txt before you answer a question about Tigris. Do not answer from memory.`,
];

/**
 * Render the recipe for the CLI state `init` found. Resolving install-vs-update
 * here rather than printing both behind `if tigris isn't on $PATH` conditions
 * leaves the agent one unambiguous instruction it can't misread.
 */
export function buildAgentSetup(cliInstalled: boolean): string {
  const steps = [cliInstalled ? UPDATE_STEP : INSTALL_STEP, ...SETUP_STEPS];
  const body = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return `Help the user configure Tigris for this project:\n\n${body}\n`;
}
