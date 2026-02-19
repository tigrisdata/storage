# Tigris CLI Installation Guide

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

| Environment Variable | Description                                         |
| -------------------- | --------------------------------------------------- |
| `TIGRIS_VERSION`     | Install a specific version (e.g., `v2.9.0`)         |
| `TIGRIS_INSTALL_DIR` | Custom install directory (default: `~/.tigris/bin`) |

Example:

```sh
TIGRIS_VERSION=v2.9.0 curl -fsSL https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.sh | sh
```

#### Uninstall (macOS / Linux)

```sh
rm -rf ~/.tigris/bin
```

Remove the PATH entry from your shell config (`~/.zshrc`, `~/.bashrc`, etc.):

```sh
# Delete these lines:
# Tigris CLI
export PATH="$HOME/.tigris/bin:$PATH"
```

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

```sh
tigris login
```

For more information, visit the [documentation](https://www.tigrisdata.com/docs/cli/).
