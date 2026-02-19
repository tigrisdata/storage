# Tigris CLI installer for Windows
# Usage: irm https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.ps1 | iex
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: $HOME\.tigris\bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_REPO         - GitHub repo (default: tigrisdata/cli)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)

$ErrorActionPreference = "Stop"

$Repo = if ($env:TIGRIS_REPO) { $env:TIGRIS_REPO } else { "tigrisdata/cli" }
$BinaryName = "tigris"
$DefaultInstallDir = "$HOME\.tigris\bin"

function Write-Info { param($Message) Write-Host "info  " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param($Message) Write-Host "success  " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn { param($Message) Write-Host "warn  " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err { param($Message) Write-Host "error  " -ForegroundColor Red -NoNewline; Write-Host $Message; exit 1 }

function Get-LatestVersion {
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    return $response.tag_name
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
        # Fetch from GitHub releases
        $version = $env:TIGRIS_VERSION
        if (-not $version) {
            Write-Info "Fetching latest version..."
            $version = Get-LatestVersion
            if (-not $version) {
                Write-Err "Failed to determine latest version"
            }
        }
        $downloadUrl = "https://github.com/$Repo/releases/download/$version/$archiveName"
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
