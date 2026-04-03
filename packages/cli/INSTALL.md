# Tigris CLI Installation Guide

## Homebrew (macOS and Linux)

```sh
brew install tigrisdata/tap/tigris
```

### Uninstall (Homebrew)

```sh
brew uninstall tigris
```

---

## npm

Requires Node.js 18+.

```sh
npm install -g @tigrisdata/cli
```

### Uninstall (npm)

```sh
npm uninstall -g @tigrisdata/cli
```

---

## Standalone Binary

No dependencies required. Downloads a self-contained executable.

### macOS / Linux

```sh
curl -fsSL https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.sh | sh
```

#### Options

| Environment Variable | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `TIGRIS_VERSION`     | Install a specific version (e.g., `v2.9.0`)          |
| `TIGRIS_INSTALL_DIR` | Custom install directory (default: `/usr/local/bin`) |

Example:

```sh
TIGRIS_VERSION=v2.9.0 curl -fsSL https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.sh | sh
```

#### Uninstall (macOS / Linux)

Remove the binaries from the install directory:

```sh
sudo rm /usr/local/bin/tigris /usr/local/bin/t3
```

If you used a custom `TIGRIS_INSTALL_DIR`, remove from that directory instead and clean up the PATH entry from your shell config (`~/.zshrc`, `~/.bashrc`, etc.).

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.ps1 | iex
```

#### Options

| Environment Variable | Description                                         |
| -------------------- | --------------------------------------------------- |
| `TIGRIS_VERSION`     | Install a specific version (e.g., `v2.9.0`)         |
| `TIGRIS_INSTALL_DIR` | Custom install directory (default: `~\.tigris\bin`) |

Example:

```powershell
$env:TIGRIS_VERSION = "v2.9.0"; irm https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.ps1 | iex
```

#### Uninstall (Windows)

```powershell
Remove-Item -Recurse -Force "$HOME\.tigris\bin"
```

Remove PATH entry (run in PowerShell as Administrator):

```powershell
$installDir = "$HOME\.tigris\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPath = ($userPath -split ';' | Where-Object { $_ -ne $installDir }) -join ';'
[Environment]::SetEnvironmentVariable("Path", $newPath, "User")
```

---

## Verify Installation

After installation, verify it works:

```sh
tigris --version
tigris help
```

You can also use `t3` as a shorthand:

```sh
t3 --version
```

## Getting Started

After installation, authenticate with your Tigris account:

```sh
# Interactive login via browser (recommended)
tigris login

# Or use access key credentials directly
tigris configure --access-key <key> --access-secret <secret>
```

Verify your authentication:

```sh
tigris whoami
```

See [AUTHENTICATION.md](AUTHENTICATION.md) for all supported authentication methods including environment variables and AWS profiles.

For more information, visit the [documentation](https://www.tigrisdata.com/docs/cli/).
