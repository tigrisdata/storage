# Tigris CLI installer for Windows
# Usage: irm https://get.t3.storage.dev/install.ps1 | iex
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: $HOME\.tigris\bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_BASE_URL     - Artifact host (default: https://get.t3.storage.dev)
#   TIGRIS_REPO         - GitHub repo for the fallback path (default: tigrisdata/storage)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)

$ErrorActionPreference = "Stop"

$Repo = if ($env:TIGRIS_REPO) { $env:TIGRIS_REPO } else { "tigrisdata/storage" }
$BaseUrl = if ($env:TIGRIS_BASE_URL) { $env:TIGRIS_BASE_URL.TrimEnd('/') } else { "https://get.t3.storage.dev" }
$BinaryName = "tigris"
$DefaultInstallDir = "$HOME\.tigris\bin"

function Write-Info { param($Message) Write-Host "info  " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param($Message) Write-Host "success  " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn { param($Message) Write-Host "warn  " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err { param($Message) Write-Host "error  " -ForegroundColor Red -NoNewline; Write-Host $Message; exit 1 }

function Resolve-AssetUrl {
    param($AssetName)
    # GitHub fallback, only reached when the artifact bucket is unreachable.
    # In this monorepo `releases/latest` is whatever package shipped last, not
    # the CLI, and the @tigrisdata/cli@<version> tag's '/' and '@' don't encode
    # consistently in a hand-built path. So list releases, keep the CLI ones,
    # and use GitHub's own asset download URL verbatim.
    #
    # This path is subject to GitHub's unauthenticated API rate limit
    # (60 req/hour per IP), which is why the bucket is tried first.
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

# A version reaches us from $env:TIGRIS_VERSION or from latest.json and is then
# interpolated into a download URL. Keep the charset tight so a surprising value
# fails here rather than as a confusing 404 (or a path that escapes the version
# prefix) later.
function Test-VersionString {
    param($Version)
    return ($Version -is [string]) -and ($Version -match '^[0-9A-Za-z.+-]+$')
}

# The newest published CLI version, per the bucket's version pointer.
# $null when the bucket is unreachable or serving something unexpected.
function Get-LatestVersion {
    try {
        $res = Invoke-RestMethod -Uri "$BaseUrl/cli/latest.json" -ErrorAction Stop
        if (Test-VersionString $res.version) { return $res.version }
    }
    catch {
        # Fall through to the GitHub path.
    }
    return $null
}

# Verify $ArchivePath against the SHA256SUMS document at $SumsUrl. A missing
# document is tolerated — CLI releases published before this installer landed
# don't carry one, and the GitHub fallback must keep working for them. A
# checksum that is present and does NOT match is fatal.
function Test-Checksum {
    param($ArchivePath, $SumsUrl, $ArchiveName)

    try {
        $raw = (Invoke-WebRequest -Uri $SumsUrl -UseBasicParsing -ErrorAction Stop).Content
    }
    catch {
        Write-Warn "No SHA256SUMS published for this version - skipping checksum verification"
        return
    }

    # Windows PowerShell 5.1 — the usual host for `irm | iex` — returns
    # .Content as a byte[] when the server sends a binary content type. GitHub
    # serves release assets as application/octet-stream, so on the fallback
    # path this arrives as bytes; splitting those yields no checksum lines and
    # verification would be skipped without ever reporting a problem. Decode
    # explicitly so both sources parse the same way.
    $sums = if ($raw -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($raw)
    }
    else {
        $raw
    }

    $expected = $null
    foreach ($line in ($sums -split "`n")) {
        $parts = $line.Trim() -split '\s+'
        if ($parts.Count -ge 2 -and $parts[1] -eq $ArchiveName) {
            $expected = $parts[0]
            break
        }
    }

    if (-not $expected) {
        Write-Warn "SHA256SUMS has no entry for $ArchiveName - skipping checksum verification"
        return
    }

    $actual = (Get-FileHash -Algorithm SHA256 -Path $ArchivePath).Hash
    if ($actual -ine $expected) {
        Write-Err "Checksum mismatch for $ArchiveName`n  expected: $expected`n  actual:   $actual`nThis archive does not match the published checksum. Aborting."
    }

    Write-Info "Checksum verified"
}

# Download the platform archive into $OutFile, preferring the artifact bucket
# and falling back to GitHub releases. Returns the resolved version string.
#
# The bucket is tried first because it needs no API call to resolve a pinned
# version (and only one cheap request for "latest"), which keeps installs
# working from shared IPs that have exhausted GitHub's anonymous rate limit.
function Save-Release {
    param($OutFile, $ArchiveName)

    if ($env:TIGRIS_VERSION) {
        if (-not (Test-VersionString $env:TIGRIS_VERSION)) {
            Write-Err "TIGRIS_VERSION is not a valid version string: $($env:TIGRIS_VERSION)"
        }
        $version = $env:TIGRIS_VERSION
        Write-Info "Resolving Tigris CLI $version..."
    }
    else {
        Write-Info "Resolving latest Tigris CLI release..."
        $version = Get-LatestVersion
    }

    if ($version) {
        $bucketUrl = "$BaseUrl/cli/v$version/$ArchiveName"
        Write-Info "Downloading from: $bucketUrl"
        try {
            Invoke-WebRequest -Uri $bucketUrl -OutFile $OutFile -ErrorAction Stop
            Test-Checksum $OutFile "$BaseUrl/cli/v$version/SHA256SUMS" $ArchiveName
            return $version
        }
        catch {
            Write-Warn "Could not fetch $ArchiveName from $BaseUrl - falling back to GitHub releases"
        }
    }
    else {
        Write-Warn "Could not reach $BaseUrl - falling back to GitHub releases"
    }

    $ghUrl = Resolve-AssetUrl $ArchiveName
    if (-not $ghUrl) {
        $wanted = if ($version) { $version } else { "latest" }
        Write-Err "Could not find $ArchiveName for Tigris CLI $wanted.`nChecked $BaseUrl and the $Repo GitHub releases."
    }
    Write-Info "Downloading from: $ghUrl"
    Invoke-WebRequest -Uri $ghUrl -OutFile $OutFile
    # Same release, so the checksum document sits alongside the archive.
    Test-Checksum $OutFile ($ghUrl -replace '/[^/]+$', '/SHA256SUMS') $ArchiveName

    if ($env:TIGRIS_VERSION) { return $env:TIGRIS_VERSION } else { return "latest" }
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

    # Only attempt if ~/.claude exists (Claude Code is installed)
    if (-not (Test-Path (Join-Path $HOME ".claude"))) {
        return
    }

    # Best-effort, and entirely optional — try the bucket, then GitHub (which
    # also keeps forks working, since $Repo still resolves there).
    $skillUrls = @(
        "$BaseUrl/SKILL.md",
        "https://raw.githubusercontent.com/$Repo/main/packages/cli/SKILL.md"
    )

    try {
        if (-not (Test-Path $skillDir)) {
            New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
        }
    }
    catch {
        return
    }

    foreach ($skillUrl in $skillUrls) {
        try {
            Invoke-WebRequest -Uri $skillUrl -OutFile (Join-Path $skillDir "SKILL.md") -ErrorAction Stop
            return
        }
        catch {
            # Try the next source; SKILL.md install is optional.
        }
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

    # Create temp directory
    $tempDir = Join-Path $env:TEMP "tigris-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $archivePath = Join-Path $tempDir $archiveName

        # Download archive
        if ($env:TIGRIS_DOWNLOAD_URL) {
            # Direct URL provided (for testing) - no resolution, no checksum.
            $version = "local"
            Write-Info "Using direct download URL (testing mode)"
            Write-Info "Downloading from: $($env:TIGRIS_DOWNLOAD_URL)"
            Invoke-WebRequest -Uri $env:TIGRIS_DOWNLOAD_URL -OutFile $archivePath
        }
        else {
            $version = Save-Release $archivePath $archiveName
        }

        Write-Info "Installing version: $version"

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
