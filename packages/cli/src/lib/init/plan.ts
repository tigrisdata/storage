import { ENV_KEYS } from './shared.js';

/**
 * Emit the agent onboarding plan for `tigris init --agent --getting-started`.
 *
 * This does NOT execute anything. It returns a recipe — an ordered list of
 * `{ id, description, command }` steps — that an AI coding agent follows,
 * running the listed `tigris` commands itself and making decisions per each
 * description (Neon's `init --agent` model).
 */
export function emitGettingStarted() {
  const plan = {
    phase: 'setup',
    status: 'getting_started',
    nextAction: {
      type: 'agent_action',
      steps: [
        {
          id: 'ensure_cli',
          description:
            'Ensure the Tigris CLI is available; install it only if the `tigris` command is not already on PATH.',
          command:
            'command -v tigris >/dev/null 2>&1 || npm install -g @tigrisdata/cli --ignore-scripts',
        },
        {
          id: 'select_org',
          description:
            "List the user's Tigris organizations. If only one exists, use it automatically. If several exist, ask the user which to use. Remember the selected org for the next steps.",
          command: 'tigris orgs list --format json',
        },
        {
          id: 'create_bucket',
          description:
            'Create a bucket for this project, or reuse an existing one from `tigris buckets list --format json`. Choose a clear, project-specific name.',
          command: 'tigris buckets create <bucket> --format json',
        },
        {
          id: 'create_access_key',
          description:
            'Create an access key for the application to use with the Tigris SDK.',
          command: 'tigris access-keys create <key-name> --format json',
        },
        {
          id: 'assign_role',
          description:
            'Grant the new access key Editor access to the bucket created above, using the key id returned by the previous step.',
          command:
            'tigris access-keys assign <key-id> --bucket <bucket> --role Editor --format json',
        },
        {
          id: 'write_env',
          description:
            `Write the credentials to the project's .env so the SDK picks them up: ` +
            `${ENV_KEYS.accessKeyId} and ${ENV_KEYS.secretAccessKey} from create_access_key, ` +
            `${ENV_KEYS.bucket} = the bucket name, and ${ENV_KEYS.endpoint} = https://t3.storage.dev.`,
          command: null,
        },
      ],
    },
  };

  console.log(JSON.stringify(plan, null, 2));
}
