#!/bin/sh
# Tigris CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/tigrisdata/storage/main/packages/cli/scripts/install.sh | sh
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: /usr/local/bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_REPO         - GitHub repo (default: tigrisdata/storage)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)
#   TIGRIS_SKIP_PATH    - Set to 1 to skip PATH modification (for testing)

set -e

REPO="${TIGRIS_REPO:-tigrisdata/storage}"
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

# Resolve the download URL for an asset from the newest (or $TIGRIS_VERSION)
# @tigrisdata/cli release. In this monorepo `releases/latest` is whatever
# package shipped last, not the CLI — so we list releases and match on the
# asset filename (only CLI releases carry tigris-<platform> archives) and copy
# GitHub's own browser_download_url verbatim rather than assembling the
# @tigrisdata/cli@<version> path (its '/' and '@' don't encode consistently).
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
  SKILL_URL="https://raw.githubusercontent.com/${REPO}/main/packages/cli/SKILL.md"

  # Only attempt if ~/.claude exists (Claude Code is installed)
  if [ ! -d "$HOME/.claude" ]; then
    return 0
  fi

  mkdir -p "$SKILL_DIR" 2>/dev/null || return 0

  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "$SKILL_URL" -o "$SKILL_DIR/SKILL.md" 2>/dev/null || return 0
  elif command -v wget > /dev/null 2>&1; then
    wget -q "$SKILL_URL" -O "$SKILL_DIR/SKILL.md" 2>/dev/null || return 0
  fi
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

  # Determine download URL
  if [ -n "${TIGRIS_DOWNLOAD_URL:-}" ]; then
    # Direct URL provided (for testing)
    DOWNLOAD_URL="$TIGRIS_DOWNLOAD_URL"
    VERSION="local"
    info "Using direct download URL (testing mode)"
  else
    if [ -n "${TIGRIS_VERSION:-}" ]; then
      info "Resolving @tigrisdata/cli@${TIGRIS_VERSION}..."
      VERSION="$TIGRIS_VERSION"
    else
      info "Resolving latest @tigrisdata/cli release..."
      VERSION="latest"
    fi
    DOWNLOAD_URL="$(resolve_asset_url "$ARCHIVE_NAME")"
    if [ -z "$DOWNLOAD_URL" ]; then
      error "Could not find a ${ARCHIVE_NAME} asset in ${REPO} @tigrisdata/cli releases"
    fi
  fi

  info "Installing version: $VERSION"
  info "Downloading from: $DOWNLOAD_URL"

  # Create temp directory
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  # Download archive
  ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"
  download_file "$DOWNLOAD_URL" "$ARCHIVE_PATH"

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
