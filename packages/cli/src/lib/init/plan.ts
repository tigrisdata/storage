/**
 * The onboarding recipe printed by `tigris init --agent`.
 *
 * This does NOT execute anything — it is a plain-text set of steps for an AI
 * coding agent to follow, running the listed `tigris` commands itself and
 * making decisions per step.
 */
export const AGENT_SETUP = `Help the user set up their project with Tigris:

1. If \`tigris\` isn't on $PATH (\`command -v tigris\`), ask permission, then \`npm install -g @tigrisdata/cli --ignore-scripts\`.
2. If \`tigris\` is on $PATH, ensure it's latest version using \`tigris update\`.
3. Check if the user is already authenticated using \`tigris whoami\`. If not, authenticate using \`tigris login oauth\`.
4. Run \`tigris orgs list --format json\`. If there's more than one org, ask which to use, then make it active with \`tigris orgs select <org>\` so the following commands target it.
5. Infer the project name from metadata (package.json, go.mod, pyproject.toml, ...). Check \`tigris buckets list --format json\` first; if the bucket is absent, \`tigris buckets create <name> --format json\`. Ask the user whenever anything is ambiguous.
6. Create the access key into a private temp file (overwrite, never append), then print only the ID:
   \`umask 077; tmpfile=$(mktemp); tigris access-keys create <username>-<project>-devel --format json > "$tmpfile" && jq -r '.id' < "$tmpfile"\`
7. Grant bucket access: \`tigris access-keys assign <id> --bucket <bucket> --role Editor --format json\`.
8. Detect whether the code uses the Tigris SDK or the AWS SDK, then have a small script append the right vars to .env, reading \`.id\`/\`.secret\` from the temp file. Do NOT read the secret into your context — append it via script. Delete the temp file when done: \`rm -f "$tmpfile"\`.

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

9. Congratulate the user and point them to:
   - JS:    https://www.tigrisdata.com/docs/sdks/tigris/
   - Go:    https://pkg.go.dev/github.com/tigrisdata/storage-go
   - Docs:  https://www.tigrisdata.com/docs/
   - Discord: https://community.tigrisdata.com/
   - Skills: https://www.tigrisdata.com/docs/skills/

   Suggest adding to their agent config:
     > ## Tigris object storage
     > This project uses Tigris. For any Tigris questions, consult https://www.tigrisdata.com/llms.txt before acting; look it up rather than relying on memory.
`;
