# Authentication

The Tigris CLI supports multiple authentication methods. When more than one is configured, the CLI uses the first match in the following priority order:

| Priority | Method | How to set up |
|----------|--------|---------------|
| 1 | AWS Profile | `AWS_PROFILE` env var + `~/.aws/credentials` |
| 2 | Environment variables (AWS_) | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` |
| 3 | Environment variables (TIGRIS_) | `TIGRIS_STORAGE_ACCESS_KEY_ID` + `TIGRIS_STORAGE_SECRET_ACCESS_KEY` |
| 4 | OAuth login | `tigris login` or `tigris login oauth` |
| 5 | Credentials login | `tigris login credentials` |
| 6 | Configured credentials | `tigris configure` |

Run `tigris whoami` to see which method is currently active.

## OAuth Login

The recommended method for interactive use. Opens a browser for authentication via OAuth2 device flow.

```sh
tigris login
# or explicitly:
tigris login oauth
```

OAuth sessions support organization management (`tigris orgs list`, `tigris orgs select`) and IAM operations (users, policies). Tokens are refreshed automatically.

## Credentials Login

Creates a temporary session using an access key and secret. The session is cleared on `tigris logout`, but credentials saved via `tigris configure` are preserved.

```sh
tigris login credentials --access-key tid_AaBb --access-secret tsec_XxYy
# or interactively:
tigris login credentials
```

## Configured Credentials

Saves access key credentials permanently to `~/.tigris/config.json`. These persist across login/logout cycles and are used as a fallback when no other login method is active.

```sh
tigris configure --access-key tid_AaBb --access-secret tsec_XxYy
```

You can optionally specify a custom endpoint:

```sh
tigris configure --access-key tid_AaBb --access-secret tsec_XxYy --endpoint https://custom.endpoint.dev
```

## Environment Variables

Environment variables act as per-session overrides and take priority over stored login state. This is useful for CI/CD pipelines, scripts, and testing with different credentials without affecting your local config.

### AWS-standard variables (highest priority)

```sh
export AWS_ACCESS_KEY_ID=tid_AaBb
export AWS_SECRET_ACCESS_KEY=tsec_XxYy
# Optional: override the storage endpoint
export AWS_ENDPOINT_URL_S3=https://t3.storage.dev
```

### Tigris-specific variables

```sh
export TIGRIS_STORAGE_ACCESS_KEY_ID=tid_AaBb
export TIGRIS_STORAGE_SECRET_ACCESS_KEY=tsec_XxYy
# Optional: override the storage endpoint
export TIGRIS_STORAGE_ENDPOINT=https://t3.storage.dev
```

When both AWS_ and TIGRIS_ variables are set, AWS_ takes priority.

### Endpoint variables

You can override service endpoints independently:

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_ENDPOINT_URL_S3` | Storage endpoint | `https://t3.storage.dev` |
| `AWS_ENDPOINT_URL_IAM` | IAM endpoint | `https://iam.storageapi.dev` |
| `TIGRIS_STORAGE_ENDPOINT` | Storage endpoint  | `https://t3.storage.dev` |
| `TIGRIS_IAM_ENDPOINT` | IAM endpoint (fallback) | `https://iam.storageapi.dev` |

AWS_ endpoint variables take priority over TIGRIS_ endpoint variables.

## AWS Profile

If you have Tigris credentials configured in `~/.aws/credentials`, the CLI picks them up automatically when `AWS_PROFILE` is set.

```ini
# ~/.aws/credentials
[tigris]
aws_access_key_id = tid_AaBb
aws_secret_access_key = tsec_XxYy
```

```ini
# ~/.aws/config
[profile tigris]
endpoint_url_s3 = https://t3.storage.dev
region = auto
```

```sh
export AWS_PROFILE=tigris
tigris ls
```

## Checking Auth Status

```sh
tigris whoami
```

Displays the active authentication method, user info, and organization. For OAuth users, shows a list of organizations with the active one highlighted.

```sh
tigris whoami --json
```

Returns machine-readable JSON output including `authMethod`, `email`, `userId`, and organization details.

## Logout

```sh
tigris logout
```

Clears the current login session (OAuth tokens and temporary credentials). Credentials saved via `tigris configure` are preserved.

## Configuration File

Auth state is stored in `~/.tigris/config.json` with restrictive file permissions (600). The file is managed automatically by the CLI — you should not need to edit it directly.
