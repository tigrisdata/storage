/**
 * The onboarding recipe printed by `tigris init --agent`.
 *
 * This does NOT execute anything — it is a plain-text set of steps for an AI
 * coding agent to follow, running the listed `tigris` commands itself and
 * making decisions per step.
 *
 * The recipe is written for the common case: a person with an existing
 * project pastes one line into whatever agent they use, and the agent takes
 * it from there: installs the CLI, configures its own MCP server and skills,
 * signs in, gets a bucket and a key, wires the project up, and proves it works.
 * The agent never has to be told which agent it is; `tigris init --yes`
 * detects that from the environment it runs in.
 *
 * Wording follows ASD-STE100 (see #236): short sentences, one instruction
 * each, no idioms.
 */

import { SUPPORTED_EDITORS } from './shared.js';

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

/**
 * Bucket step, in two shapes. Without a known bucket the agent infers a name
 * from the project. With one (the person arrived from storage.new, where the
 * bucket was created during signup) the agent uses it and creates nothing.
 */
const INFER_BUCKET_STEP =
  'Read the project name from a metadata file, for example package.json, go.mod, or pyproject.toml. Run `tigris buckets list --format json` first. If the bucket is absent, run `tigris buckets create <name> --format json`. If anything is ambiguous, ask the user.';

const useBucketStep = (bucket: string) =>
  `The bucket \`${bucket}\` already exists. Run \`tigris buckets get ${bucket} --format json\` to confirm this. Do not create a different bucket. If the bucket is absent, run \`tigris buckets create ${bucket} --format json\`.`;

const EDITOR_IDS = SUPPORTED_EDITORS.map((e) => e.id).join(', ');

/** Everything after the CLI step, in order; the bucket step is a placeholder. */
const setupSteps = (bucketStep: string): string[] => [
  `Configure the Tigris MCP server and the Tigris agent skills for yourself: run \`tigris init --yes\`. The command detects the agent that runs it (${EDITOR_IDS}) and writes the configuration for that agent. If the command detects no agent, or the wrong agent, run \`tigris init --editor <id>\`. If you are not one of these agents, skip this step. Restart the agent to load the new tools and skills.`,
  'Run `tigris whoami` to get the authentication state. If the user is not authenticated, run `tigris login oauth`. Then run `tigris orgs list --format json`. If there is more than one org, ask the user which org to use, then run `tigris orgs select <org>` to make that org active. The commands that come after target the active org.',
  bucketStep,
  `Create the access key in a private temporary file. Use \`>\` to overwrite the file. Do not use \`>>\` to append. Then print only the ID:
   \`umask 077; tmpfile=$(mktemp); tigris access-keys create <username>-<project>-devel --format json > "$tmpfile" && jq -r '.id' < "$tmpfile"\`
   Then give the access key the Editor role on the bucket: \`tigris access-keys assign <id> --bucket <bucket> --role Editor --format json\`.`,
  `Identify the SDK that the code uses: the Tigris SDK, or the AWS SDK. Then use a small script to append the correct variables to \`.env\`:
   - The script reads \`.id\` and \`.secret\` from the temporary file.
   - Do not read the secret into your own context. Only the script reads the secret.
   - When the script is complete, delete the temporary file: \`rm -f "$tmpfile"\`.
   - Make sure that \`.gitignore\` includes \`.env\`.

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
  `Connect the project code to Tigris. Follow the conventions of the project.
   - If the project has an S3 client (for example aws-sdk, boto3, minio, or rclone), keep it. Set the AWS variables above. Tigris is S3 compatible. Change only the endpoint and the region.
   - If the project has no storage code, ask the user for permission to add a dependency. Then add the Tigris SDK for the language: @tigrisdata/storage for JavaScript and TypeScript, github.com/tigrisdata/storage-go for Go, or boto3 with the AWS variables for Python. Add one small example in the place where the project uses storage, for example an upload function or a signed URL route. Do not restructure the project.`,
  `Test the configuration. Upload one small file to the bucket and read it back. If you added storage code, use the project code. If not, use the CLI: \`echo ok > .tigris-check && tigris cp .tigris-check t3://<bucket>/.tigris-check && tigris ls <bucket> && rm .tigris-check\`. Then delete the test object: \`tigris rm t3://<bucket>/.tigris-check\`.`,
  `Tell the user which files, variables, and dependencies you added. Then give these links:
   - JS:    https://www.tigrisdata.com/docs/sdks/tigris/
   - Go:    https://pkg.go.dev/github.com/tigrisdata/storage-go
   - Docs:  https://www.tigrisdata.com/docs/
   - Discord: https://community.tigrisdata.com/
   - Skills: https://www.tigrisdata.com/docs/skills/

   Suggest that the user adds these lines to the agent configuration file:
     > ## Tigris object storage
     > This project uses Tigris. Read https://www.tigrisdata.com/llms.txt before you answer a question about Tigris. Do not answer from memory.`,
];

export interface AgentSetupOptions {
  /** A bucket that already exists for this user, e.g. the one storage.new created. */
  bucket?: string;
}

export interface AgentPromptOptions extends AgentSetupOptions {
  /** How the prompt invokes the CLI. `npx tigris` works everywhere; `tigris` once it is installed. */
  cli?: 'npx tigris' | 'tigris';
}

/**
 * Render the recipe for the CLI state `init` found. Resolving install-vs-update
 * here rather than printing both behind `if tigris isn't on $PATH` conditions
 * leaves the agent one unambiguous instruction it can't misread.
 */
export function buildAgentSetup(
  cliInstalled: boolean,
  options: AgentSetupOptions = {}
): string {
  const bucketStep = options.bucket
    ? useBucketStep(options.bucket)
    : INFER_BUCKET_STEP;
  const steps = [
    cliInstalled ? UPDATE_STEP : INSTALL_STEP,
    ...setupSteps(bucketStep),
  ];
  const body = steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  return `Help the user configure Tigris for this project:\n\n${body}\n`;
}

/**
 * The one line a person pastes into their agent. Lives here, next to the
 * recipe it points at, so the website, the welcome page and the CLI's own
 * hand-off all print the same thing.
 */
export const AGENT_PROMPT_URL = 'https://www.tigrisdata.com/agent-setup.md';

export function buildAgentPrompt(options: AgentPromptOptions = {}): string {
  const cli = options.cli ?? 'npx tigris';
  const bucketFlag = options.bucket ? ` --bucket ${options.bucket}` : '';
  const bucketNote = options.bucket
    ? ` Use the bucket \`${options.bucket}\`. It already exists.`
    : '';
  return `Add Tigris object storage to this project. Run \`${cli} init --agent${bucketFlag}\` and follow the recipe it prints, step by step.${bucketNote} If you cannot run commands, read ${AGENT_PROMPT_URL} instead.`;
}
