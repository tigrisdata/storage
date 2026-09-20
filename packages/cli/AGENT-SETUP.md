# Set up Tigris in this project

Instructions for an AI coding agent. If you are a person, paste this line into your agent:

> Add Tigris object storage to this project. Run `npx tigris init --agent` and follow the recipe it prints, step by step. If you cannot run commands, read https://www.tigrisdata.com/agent-setup.md instead.

If the agent can run commands, `npx tigris init --agent` prints the current version of the steps below. If not, follow the steps from here.

---

Help the user configure Tigris for this project:

1. Ask the user for permission. Then install the CLI: `npm install -g @tigrisdata/cli --ignore-scripts`.
2. Configure the Tigris MCP server and the Tigris agent skills for yourself: run `tigris init --yes`. The command detects the agent that runs it (claude-code, cursor, vscode, windsurf, codex, antigravity-cli, cline, zed, roo, opencode) and writes the configuration for that agent. If the command detects no agent, or the wrong agent, run `tigris init --editor <id>`. If you are not one of these agents, skip this step. Restart the agent to load the new tools and skills.
3. Run `tigris whoami` to get the authentication state. If the user is not authenticated, run `tigris login oauth`. Then run `tigris orgs list --format json`. If there is more than one org, ask the user which org to use, then run `tigris orgs select <org>` to make that org active. The commands that come after target the active org.
4. Read the project name from a metadata file, for example package.json, go.mod, or pyproject.toml. Run `tigris buckets list --format json` first. If the bucket is absent, run `tigris buckets create <name> --format json`. If anything is ambiguous, ask the user.
5. Create the access key in a private temporary file. Use `>` to overwrite the file. Do not use `>>` to append. Then print only the ID:
   `umask 077; tmpfile=$(mktemp); tigris access-keys create <username>-<project>-devel --format json > "$tmpfile" && jq -r '.id' < "$tmpfile"`
   Then give the access key the Editor role on the bucket: `tigris access-keys assign <id> --bucket <bucket> --role Editor --format json`.
6. Identify the SDK that the code uses: the Tigris SDK, or the AWS SDK. Then use a small script to append the correct variables to `.env`:
   - The script reads `.id` and `.secret` from the temporary file.
   - Do not read the secret into your own context. Only the script reads the secret.
   - When the script is complete, delete the temporary file: `rm -f "$tmpfile"`.
   - Make sure that `.gitignore` includes `.env`.

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

7. Connect the project code to Tigris. Follow the conventions of the project.
   - If the project has an S3 client (for example aws-sdk, boto3, minio, or rclone), keep it. Set the AWS variables above. Tigris is S3 compatible. Change only the endpoint and the region.
   - If the project has no storage code, ask the user for permission to add a dependency. Then add the Tigris SDK for the language: @tigrisdata/storage for JavaScript and TypeScript, github.com/tigrisdata/storage-go for Go, or boto3 with the AWS variables for Python. Add one small example in the place where the project uses storage, for example an upload function or a signed URL route. Do not restructure the project.
8. Test the configuration. Upload one small file to the bucket and read it back. If you added storage code, use the project code. If not, use the CLI: `echo ok > .tigris-check && tigris cp .tigris-check t3://<bucket>/.tigris-check && tigris ls <bucket> && rm .tigris-check`. Then delete the test object: `tigris rm t3://<bucket>/.tigris-check`.
9. Tell the user which files, variables, and dependencies you added. Then give these links:
   - JS:    https://www.tigrisdata.com/docs/sdks/tigris/
   - Go:    https://pkg.go.dev/github.com/tigrisdata/storage-go
   - Docs:  https://www.tigrisdata.com/docs/
   - Discord: https://community.tigrisdata.com/
   - Skills: https://www.tigrisdata.com/docs/skills/

   Suggest that the user adds these lines to the agent configuration file:
     > ## Tigris object storage
     > This project uses Tigris. Read https://www.tigrisdata.com/llms.txt before you answer a question about Tigris. Do not answer from memory.
