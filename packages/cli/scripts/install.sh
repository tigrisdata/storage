#!/bin/sh
# Tigris CLI installer
# Usage: curl -fsSL https://get.t3.storage.dev/install.sh | sh
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: /usr/local/bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_BASE_URL     - Artifact host (default: https://get.t3.storage.dev)
#   TIGRIS_REPO         - GitHub repo for the fallback path (default: tigrisdata/storage)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)
#   TIGRIS_SKIP_PATH    - Set to 1 to skip PATH modification (for testing)

set -e

REPO="${TIGRIS_REPO:-tigrisdata/storage}"
BASE_URL="${TIGRIS_BASE_URL:-https://get.t3.storage.dev}"
# Strip trailing slashes so "${BASE_URL}/cli/..." can't build a "//" path. An
# S3-style host reads the extra separator as part of the key, making
# "//cli/latest.json" a different (missing) object rather than the same one.
# Loops to match the PowerShell installer's TrimEnd('/'), which strips all.
while [ "${BASE_URL%/}" != "$BASE_URL" ]; do
  BASE_URL="${BASE_URL%/}"
done
BINARY_NAME="tigris"
DEFAULT_INSTALL_DIR="/usr/local/bin"

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  NC='\033[0m' # No Color
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  BOLD=''
  NC=''
fi

info() {
  printf "${BLUE}info${NC}  %s\n" "$1"
}

success() {
  printf "${GREEN}success${NC}  %s\n" "$1"
}

warn() {
  printf "${YELLOW}warn${NC}  %s\n" "$1"
}

error() {
  printf "${RED}error${NC}  %s\n" "$1" >&2
  exit 1
}

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux)  OS="linux" ;;
    Darwin) OS="darwin" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
    *) error "Unsupported operating system: $OS" ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $ARCH" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
}

http_get() {
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$1"
  elif command -v wget > /dev/null 2>&1; then
    wget -qO- "$1"
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

# --- GitHub fallback -------------------------------------------------------
# Only reached when the artifact bucket is unreachable. Resolve the download
# URL for an asset from the newest (or $TIGRIS_VERSION) @tigrisdata/cli
# release. In this monorepo `releases/latest` is whatever package shipped last,
# not the CLI — so we list releases and match on the asset filename (only CLI
# releases carry tigris-<platform> archives) and copy GitHub's own
# browser_download_url verbatim rather than assembling the
# @tigrisdata/cli@<version> path (its '/' and '@' don't encode consistently).
#
# Note this path is subject to GitHub's unauthenticated API rate limit
# (60 req/hour per IP), which is precisely why the bucket is tried first.
resolve_asset_url() {
  asset="$1"
  body="$(http_get "https://api.github.com/repos/${REPO}/releases?per_page=100")"
  matches="$(printf '%s\n' "$body" \
    | grep '"browser_download_url"' \
    | sed -E 's/.*"browser_download_url": ?"([^"]+)".*/\1/' \
    | grep -F "/${asset}" || true)"
  if [ -n "${TIGRIS_VERSION:-}" ]; then
    # Pin to the EXACT version. The version is the tail of the release tag and
    # is always immediately followed by "/<asset>" in the URL, so anchor on
    # "<version>/<asset>": a bare "grep -F <version>" would also match e.g.
    # 3.4.10 when 3.4.1 was requested. This holds regardless of how the tag's
    # '@'/'/' are encoded (only the segment after the version matters here),
    # and matches the exact-tag equality the PowerShell installer uses.
    matches="$(printf '%s\n' "$matches" | grep -F "${TIGRIS_VERSION}/${asset}" || true)"
  fi
  printf '%s\n' "$matches" | head -n 1
}

download_file() {
  URL="$1"
  OUTPUT="$2"

  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$URL" -o "$OUTPUT"
  elif command -v wget > /dev/null 2>&1; then
    wget -q "$URL" -O "$OUTPUT"
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
}

# A version reaches us from $TIGRIS_VERSION or from latest.json, and is then
# interpolated into a download URL. Neither is shell-evaluated, but keep the
# charset tight so a surprising value fails here rather than as a confusing
# 404 (or a path that escapes the version prefix) later.
valid_version() {
  case "$1" in
    '') return 1 ;;
    *[!0-9A-Za-z.+-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# The newest published CLI version, per the bucket's version pointer. Empty if
# the bucket is unreachable or serving something unexpected.
fetch_latest_version() {
  body="$(http_get "${BASE_URL}/cli/latest.json" 2>/dev/null || true)"
  [ -n "$body" ] || return 1
  version="$(printf '%s' "$body" \
    | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1)"
  valid_version "$version" || return 1
  printf '%s' "$version"
}

sha256_of() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum > /dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    return 1
  fi
}

# Verify $1 (a downloaded archive named $3) against the SHA256SUMS document at
# $2. A missing checksum document is tolerated — CLI releases published before
# this installer landed don't carry one, and the GitHub fallback must keep
# working for them. A checksum that is present and does NOT match is fatal.
verify_checksum() {
  archive_path="$1"
  sums_url="$2"
  archive_name="$3"

  sums="$(http_get "$sums_url" 2>/dev/null || true)"
  if [ -z "$sums" ]; then
    warn "No SHA256SUMS published for this version — skipping checksum verification"
    return 0
  fi

  expected="$(printf '%s\n' "$sums" | awk -v f="$archive_name" '$2 == f { print $1; exit }')"
  if [ -z "$expected" ]; then
    warn "SHA256SUMS has no entry for ${archive_name} — skipping checksum verification"
    return 0
  fi

  if ! actual="$(sha256_of "$archive_path")"; then
    warn "Neither sha256sum nor shasum found — skipping checksum verification"
    return 0
  fi

  if [ "$actual" != "$expected" ]; then
    error "Checksum mismatch for ${archive_name}
  expected: ${expected}
  actual:   ${actual}
This archive does not match the published checksum. Aborting."
  fi

  info "Checksum verified"
}

# Download the platform archive $2 into $1, preferring the artifact bucket and
# falling back to GitHub releases. Sets VERSION as a side effect.
#
# The bucket is tried first because it needs no API call to resolve a pinned
# version (and only one cheap request for "latest"), which keeps installs
# working from shared IPs that have exhausted GitHub's anonymous rate limit.
download_release() {
  out="$1"
  archive_name="$2"

  if [ -n "${TIGRIS_VERSION:-}" ]; then
    if ! valid_version "$TIGRIS_VERSION"; then
      error "TIGRIS_VERSION is not a valid version string: ${TIGRIS_VERSION}"
    fi
    VERSION="$TIGRIS_VERSION"
    info "Resolving Tigris CLI ${VERSION}..."
  else
    info "Resolving latest Tigris CLI release..."
    VERSION="$(fetch_latest_version || true)"
  fi

  if [ -n "$VERSION" ]; then
    bucket_url="${BASE_URL}/cli/v${VERSION}/${archive_name}"
    info "Downloading from: $bucket_url"
    if download_file "$bucket_url" "$out" 2>/dev/null; then
      verify_checksum "$out" "${BASE_URL}/cli/v${VERSION}/SHA256SUMS" "$archive_name"
      return 0
    fi
    warn "Could not fetch ${archive_name} from ${BASE_URL} — falling back to GitHub releases"
  else
    warn "Could not reach ${BASE_URL} — falling back to GitHub releases"
  fi

  gh_url="$(resolve_asset_url "$archive_name")"
  if [ -z "$gh_url" ]; then
    error "Could not find ${archive_name} for Tigris CLI ${VERSION:-latest}.
Checked ${BASE_URL} and the ${REPO} GitHub releases."
  fi
  VERSION="${TIGRIS_VERSION:-latest}"
  info "Downloading from: $gh_url"
  download_file "$gh_url" "$out"
  # Same release, so the checksum document sits alongside the archive.
  verify_checksum "$out" "${gh_url%/*}/SHA256SUMS" "$archive_name"
}

detect_shell() {
  SHELL_NAME="$(basename "$SHELL")"
}

add_to_path() {
  INSTALL_DIR="$1"

  # Detect config file based on shell
  PROFILE=""

  case "$SHELL_NAME" in
    zsh)
      PROFILE="$HOME/.zshrc"
      ;;
    bash)
      if [ -f "$HOME/.bashrc" ]; then
        PROFILE="$HOME/.bashrc"
      elif [ -f "$HOME/.bash_profile" ]; then
        PROFILE="$HOME/.bash_profile"
      else
        PROFILE="$HOME/.profile"
      fi
      ;;
    fish)
      # Fish uses a different method
      PROFILE=""
      ;;
    *)
      PROFILE="$HOME/.profile"
      ;;
  esac

  # Check if already in PATH
  case ":$PATH:" in
    *":$INSTALL_DIR:"*)
      return 0
      ;;
  esac

  # Add to PATH
  if [ "$SHELL_NAME" = "fish" ]; then
    # Fish shell
    fish -c "set -Ux fish_user_paths $INSTALL_DIR \$fish_user_paths" 2>/dev/null || true
    info "Added $INSTALL_DIR to fish PATH"
  elif [ -n "$PROFILE" ]; then
    # Check if already in profile
    if ! grep -q "$INSTALL_DIR" "$PROFILE" 2>/dev/null; then
      echo "" >> "$PROFILE"
      echo "# Tigris CLI" >> "$PROFILE"
      echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$PROFILE"
      info "Added $INSTALL_DIR to $PROFILE"
    fi
  fi

  # Export for current session
  export PATH="$INSTALL_DIR:$PATH"
}

cleanup_old_install() {
  OLD_DIR="$HOME/.tigris/bin"

  # Nothing to clean up
  if [ ! -d "$OLD_DIR" ]; then
    return 0
  fi

  # Only clean up if there's actually an old tigris binary there
  if [ ! -f "$OLD_DIR/tigris" ] && [ ! -f "$OLD_DIR/t3" ]; then
    return 0
  fi

  info "Found previous installation at $OLD_DIR, cleaning up..."

  # Remove old binary and symlink
  rm -f "$OLD_DIR/tigris" "$OLD_DIR/t3"

  # Remove ~/.tigris/bin if empty, then ~/.tigris if empty
  rmdir "$OLD_DIR" 2>/dev/null || true
  rmdir "$HOME/.tigris" 2>/dev/null || true

  # Remove PATH entry from shell profiles
  for PROFILE_FILE in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    if [ -f "$PROFILE_FILE" ] && grep -q '\.tigris/bin' "$PROFILE_FILE" 2>/dev/null; then
      # Filter out the Tigris CLI comment and export line
      { grep -v '# Tigris CLI' "$PROFILE_FILE" | grep -v '\.tigris/bin' || true; } > "${PROFILE_FILE}.tmp"
      mv "${PROFILE_FILE}.tmp" "$PROFILE_FILE"
      info "Removed old PATH entry from $PROFILE_FILE"
    fi
  done

  # Clean up fish shell if applicable
  if command -v fish > /dev/null 2>&1; then
    fish -c "set -e fish_user_paths (contains -i $OLD_DIR \$fish_user_paths)" 2>/dev/null || true
  fi

  success "Cleaned up old installation"
}

show_banner() {
  cat << 'EOF'

  ┌───────────────────────────────────────────────────────────────────┐
  │                                                                   │
  │   _____ ___ ___ ___ ___ ___    ___ _    ___                       │
  │  |_   _|_ _/ __| _ \_ _/ __|  / __| |  |_ _|                      │
  │    | |  | | (_ |   /| |\__ \ | (__| |__ | |                       │
  │    |_| |___\___|_|_\___|___/  \___|____|___|                      │
  │                                                                   │
  │  To get started:                                                  │
  │    $ tigris login                                                 │
  │                                                                   │
  │  For help:                                                        │
  │    $ tigris help                                                  │
  │                                                                   │
  │  Tip - You can use 't3' as a shorthand for 'tigris':              │
  │    $ t3 login                                                     │
  │                                                                   │
  │  Docs: https://www.tigrisdata.com/docs/cli/                       │
  │                                                                   │
  └───────────────────────────────────────────────────────────────────┘

EOF
}

install_skill() {
  SKILL_DIR="$HOME/.claude/skills/tigris"

  # Only attempt if ~/.claude exists (Claude Code is installed)
  if [ ! -d "$HOME/.claude" ]; then
    return 0
  fi

  mkdir -p "$SKILL_DIR" 2>/dev/null || return 0

  # Best-effort, and entirely optional — try the bucket, then GitHub (which
  # also keeps forks working, since $TIGRIS_REPO still resolves there).
  for skill_url in \
    "${BASE_URL}/SKILL.md" \
    "https://raw.githubusercontent.com/${REPO}/main/packages/cli/SKILL.md"
  do
    if download_file "$skill_url" "$SKILL_DIR/SKILL.md" 2>/dev/null; then
      return 0
    fi
  done
  return 0
}

main() {
  detect_platform
  detect_shell
  info "Detected platform: $PLATFORM"

  # Determine install directory
  INSTALL_DIR="${TIGRIS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
    if command -v sudo > /dev/null 2>&1; then
      sudo mkdir -p "$INSTALL_DIR"
    else
      error "Cannot create ${INSTALL_DIR} and sudo is not available. Set TIGRIS_INSTALL_DIR to a writable path."
    fi
  fi

  # Clean up old ~/.tigris/bin installation if upgrading to new default location
  if [ "$INSTALL_DIR" != "$HOME/.tigris/bin" ]; then
    cleanup_old_install
  fi

  # Construct archive/binary names
  if [ "$OS" = "windows" ]; then
    ARCHIVE_NAME="tigris-${PLATFORM}.zip"
    BINARY_FILE="${BINARY_NAME}.exe"
  else
    ARCHIVE_NAME="tigris-${PLATFORM}.tar.gz"
    BINARY_FILE="$BINARY_NAME"
  fi

  # Create temp directory
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"

  # Download archive
  if [ -n "${TIGRIS_DOWNLOAD_URL:-}" ]; then
    # Direct URL provided (for testing) — no resolution, no checksum.
    VERSION="local"
    info "Using direct download URL (testing mode)"
    info "Downloading from: $TIGRIS_DOWNLOAD_URL"
    download_file "$TIGRIS_DOWNLOAD_URL" "$ARCHIVE_PATH"
  else
    download_release "$ARCHIVE_PATH" "$ARCHIVE_NAME"
  fi

  info "Installing version: $VERSION"

  # Extract archive
  info "Extracting..."
  cd "$TMP_DIR"
  if [ "$OS" = "windows" ]; then
    unzip -q "$ARCHIVE_PATH"
  else
    tar -xzf "$ARCHIVE_PATH"
  fi

  # Find and install binary
  EXTRACTED_BINARY="tigris-${PLATFORM}"
  if [ "$OS" = "windows" ]; then
    EXTRACTED_BINARY="${EXTRACTED_BINARY}.exe"
  fi

  if [ ! -f "$EXTRACTED_BINARY" ]; then
    if [ -f "$BINARY_NAME" ] || [ -f "${BINARY_NAME}.exe" ]; then
      EXTRACTED_BINARY="$BINARY_NAME"
      [ "$OS" = "windows" ] && EXTRACTED_BINARY="${BINARY_NAME}.exe"
    else
      error "Could not find binary in archive. Contents: $(ls -la)"
    fi
  fi

  # Determine if we need elevated privileges
  SUDO=""
  if [ ! -w "$INSTALL_DIR" ]; then
    if command -v sudo > /dev/null 2>&1; then
      warn "Elevated permissions required to install to ${INSTALL_DIR}"
      SUDO="sudo"
    else
      error "No write permission to ${INSTALL_DIR} and sudo is not available. Set TIGRIS_INSTALL_DIR to a writable path."
    fi
  fi

  # Install binary
  $SUDO mv "$EXTRACTED_BINARY" "${INSTALL_DIR}/${BINARY_FILE}"
  $SUDO chmod +x "${INSTALL_DIR}/${BINARY_FILE}"

  # Create t3 symlink
  $SUDO ln -sf "${INSTALL_DIR}/${BINARY_FILE}" "${INSTALL_DIR}/t3" 2>/dev/null || true

  success "Installed $BINARY_NAME to ${INSTALL_DIR}/${BINARY_FILE}"

  # Add to PATH if not using default /usr/local/bin (which is already in PATH)
  if [ "${TIGRIS_SKIP_PATH:-}" != "1" ] && [ "$INSTALL_DIR" != "/usr/local/bin" ]; then
    add_to_path "$INSTALL_DIR"
  fi

  # Show welcome banner
  show_banner

  # Install Claude Code skill (if Claude Code is present)
  install_skill

  # Remind about new shell if PATH was modified (only for custom install dirs)
  if [ "$INSTALL_DIR" != "/usr/local/bin" ] && ! command -v tigris > /dev/null 2>&1; then
    warn "You may need to restart your shell or run: source ~/.${SHELL_NAME}rc"
  fi
}

main
