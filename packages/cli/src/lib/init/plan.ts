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
  'Ask permission, then install the CLI: `npm install -g @tigrisdata/cli --ignore-scripts`.';
const UPDATE_STEP = 'Ensure the CLI is on the latest version: `tigris update`.';

const SETUP_STEPS = [
  'Check if the user is already authenticated using `tigris whoami`. If not, authenticate using `tigris login oauth`.',
  "Run `tigris orgs list --format json`. If there's more than one org, ask which to use, then make it active with `tigris orgs select <org>` so the following commands target it.",
  'Infer the project name from metadata (package.json, go.mod, pyproject.toml, ...). Check `tigris buckets list --format json` first; if the bucket is absent, `tigris buckets create <name> --format json`. Ask the user whenever anything is ambiguous.',
  `Create the access key into a private temp file (overwrite, never append), then print only the ID:
   \`umask 077; tmpfile=$(mktemp); tigris access-keys create <username>-<project>-devel --format json > "$tmpfile" && jq -r '.id' < "$tmpfile"\``,
  'Grant bucket access: `tigris access-keys assign <id> --bucket <bucket> --role Editor --format json`.',
  `Detect whether the code uses the Tigris SDK or the AWS SDK, then have a small script append the right vars to .env, reading \`.id\`/\`.secret\` from the temp file. Do NOT read the secret into your context — append it via script. Delete the temp file when done: \`rm -f "$tmpfile"\`.

   Tigris SDK (@tigrisdata/storage, storage-go):
     TIGRIS_STORAGE_ACCESS_KEY_ID     = .id
     TIGRIS_STORAGE_SECRET_ACCESS_KEY = .secret   (secret)
     TIGRIS_STORAGE_BUCKET            = <bucket>

   AWS SDK:
     AWS_ACCESS_KEY_ID       = .id
     AWS_SECRET_ACCESS_KEY   = .secret            (secret)
     AWS_ENDPOINT_URL_S3     = https://t3.storage.dev    (required)
     AWS_ENDPOINT_URL_IAM    = https://iam.storageapi.dev (required)
     AWS_REGION              = auto                        (required)
`,
  `Congratulate the user and point them to:
   - JS:    https://www.tigrisdata.com/docs/sdks/tigris/
   - Go:    https://pkg.go.dev/github.com/tigrisdata/storage-go
   - Docs:  https://www.tigrisdata.com/docs/
   - Discord: https://community.tigrisdata.com/
   - Skills: https://www.tigrisdata.com/docs/skills/

   Suggest adding to their agent config:
     > ## Tigris object storage
     > This project uses Tigris. For any Tigris questions, consult https://www.tigrisdata.com/llms.txt before acting; look it up rather than relying on memory.`,
];

/**
 * Render the recipe for the CLI state `init` found. Resolving install-vs-update
 * here rather than printing both behind `if tigris isn't on $PATH` conditions
 * leaves the agent one unambiguous instruction it can't misread.
 */
export function buildAgentSetup(cliInstalled: boolean): string {
  const steps = [cliInstalled ? UPDATE_STEP : INSTALL_STEP, ...SETUP_STEPS];
  const body = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return `Help the user set up their project with Tigris:\n\n${body}\n`;
}
