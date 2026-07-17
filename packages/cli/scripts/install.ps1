# Tigris CLI installer for Windows
# Usage: irm https://raw.githubusercontent.com/tigrisdata/storage/main/packages/cli/scripts/install.ps1 | iex
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: $HOME\.tigris\bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_REPO         - GitHub repo (default: tigrisdata/storage)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)

$ErrorActionPreference = "Stop"

$Repo = if ($env:TIGRIS_REPO) { $env:TIGRIS_REPO } else { "tigrisdata/storage" }
$BinaryName = "tigris"
$DefaultInstallDir = "$HOME\.tigris\bin"

function Write-Info { param($Message) Write-Host "info  " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param($Message) Write-Host "success  " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn { param($Message) Write-Host "warn  " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err { param($Message) Write-Host "error  " -ForegroundColor Red -NoNewline; Write-Host $Message; exit 1 }

function Resolve-AssetUrl {
    param($AssetName)
    # In this monorepo `releases/latest` is whatever package shipped last, not
    # the CLI, and the @tigrisdata/cli@<version> tag's '/' and '@' don't encode
    # consistently in a hand-built path. So list releases, keep the CLI ones,
    # and use GitHub's own asset download URL verbatim.
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=100"
    $cli = $releases | Where-Object { $_.tag_name -like '@tigrisdata/cli@*' }
    if ($env:TIGRIS_VERSION) {
        $cli = $cli | Where-Object { $_.tag_name -eq "@tigrisdata/cli@$($env:TIGRIS_VERSION)" }
    }
    # GitHub returns releases newest-first.
    $release = $cli | Select-Object -First 1
    if (-not $release) { return $null }
    $asset = $release.assets | Where-Object { $_.name -eq $AssetName } | Select-Object -First 1
    if (-not $asset) { return $null }
    return $asset.browser_download_url
}

function Add-ToPath {
    param($InstallDir)

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")

    # Check if already in PATH
    if ($userPath -like "*$InstallDir*") {
        return
    }

    # Add to user PATH permanently
    $newPath = "$InstallDir;$userPath"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Info "Added $InstallDir to user PATH"

    # Also update current session
    $env:Path = "$InstallDir;$env:Path"
}

function Show-Banner {
    Write-Host @"

  +-------------------------------------------------------------------+
  |                                                                   |
  |   _____ ___ ___ ___ ___ ___    ___ _    ___                       |
  |  |_   _|_ _/ __| _ \_ _/ __|  / __| |  |_ _|                      |
  |    | |  | | (_ |   /| |\__ \ | (__| |__ | |                       |
  |    |_| |___\___|_|_\___|___/  \___|____|___|                      |
  |                                                                   |
  |  To get started:                                                  |
  |    > tigris login                                                 |
  |                                                                   |
  |  For help:                                                        |
  |    > tigris help                                                  |
  |                                                                   |
  |  Tip - You can use 't3' as a shorthand for 'tigris':              |
  |    > t3 login                                                     |
  |                                                                   |
  |  Docs: https://www.tigrisdata.com/docs/cli/                       |
  |                                                                   |
  +-------------------------------------------------------------------+

"@
}

function Install-Skill {
    $skillDir = Join-Path $HOME ".claude\skills\tigris"
    $skillUrl = "https://raw.githubusercontent.com/$Repo/main/packages/cli/SKILL.md"

    # Only attempt if ~/.claude exists (Claude Code is installed)
    if (-not (Test-Path (Join-Path $HOME ".claude"))) {
        return
    }

    try {
        if (-not (Test-Path $skillDir)) {
            New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
        }
        Invoke-WebRequest -Uri $skillUrl -OutFile (Join-Path $skillDir "SKILL.md") -ErrorAction Stop
    }
    catch {
        # Fail silently — SKILL.md install is optional
    }
}

function Main {
    # Detect architecture
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { Write-Err "32-bit Windows is not supported" }
    $platform = "windows-$arch"
    Write-Info "Detected platform: $platform"

    # Determine install directory
    $installDir = if ($env:TIGRIS_INSTALL_DIR) { $env:TIGRIS_INSTALL_DIR } else { $DefaultInstallDir }
    if (-not (Test-Path $installDir)) {
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    }

    # Construct archive name
    $archiveName = "tigris-$platform.zip"

    # Determine download URL
    if ($env:TIGRIS_DOWNLOAD_URL) {
        # Direct URL provided (for testing)
        $downloadUrl = $env:TIGRIS_DOWNLOAD_URL
        $version = "local"
        Write-Info "Using direct download URL (testing mode)"
    } else {
        # Resolve the asset URL from the GitHub releases API (see Resolve-AssetUrl).
        if ($env:TIGRIS_VERSION) {
            Write-Info "Resolving @tigrisdata/cli@$($env:TIGRIS_VERSION)..."
            $version = $env:TIGRIS_VERSION
        } else {
            Write-Info "Resolving latest @tigrisdata/cli release..."
            $version = "latest"
        }
        $downloadUrl = Resolve-AssetUrl $archiveName
        if (-not $downloadUrl) {
            Write-Err "Could not find a $archiveName asset in $Repo @tigrisdata/cli releases"
        }
    }

    Write-Info "Installing version: $version"
    Write-Info "Downloading from: $downloadUrl"

    # Create temp directory
    $tempDir = Join-Path $env:TEMP "tigris-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        # Download archive
        $archivePath = Join-Path $tempDir $archiveName
        Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath

        # Extract archive
        Write-Info "Extracting..."
        Expand-Archive -Path $archivePath -DestinationPath $tempDir -Force

        # Find and install binary
        $extractedBinary = Join-Path $tempDir "tigris-$platform.exe"
        if (-not (Test-Path $extractedBinary)) {
            $extractedBinary = Join-Path $tempDir "$BinaryName.exe"
            if (-not (Test-Path $extractedBinary)) {
                Write-Err "Could not find binary in archive"
            }
        }

        # Install binary
        $targetPath = Join-Path $installDir "$BinaryName.exe"
        Copy-Item $extractedBinary $targetPath -Force

        # Create t3.exe copy (Windows doesn't support symlinks without admin)
        $t3Path = Join-Path $installDir "t3.exe"
        Copy-Item $targetPath $t3Path -Force

        Write-Success "Installed $BinaryName to $targetPath"

        # Add to PATH
        Add-ToPath $installDir

        # Show welcome banner
        Show-Banner

        # Install Claude Code skill (if Claude Code is present)
        Install-Skill

        Write-Success "Installation complete!"
    }
    finally {
        # Cleanup
        if (Test-Path $tempDir) {
            Remove-Item -Recurse -Force $tempDir
        }
    }
}

Main
