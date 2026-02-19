#!/bin/sh
# Tigris CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/tigrisdata/cli/main/scripts/install.sh | sh
#
# Environment variables:
#   TIGRIS_INSTALL_DIR  - Installation directory (default: ~/.tigris/bin)
#   TIGRIS_VERSION      - Specific version to install (default: latest)
#   TIGRIS_REPO         - GitHub repo (default: tigrisdata/cli)
#   TIGRIS_DOWNLOAD_URL - Direct download URL (skips version detection, for testing)
#   TIGRIS_SKIP_PATH    - Set to 1 to skip PATH modification (for testing)

set -e

REPO="${TIGRIS_REPO:-tigrisdata/cli}"
BINARY_NAME="tigris"
DEFAULT_INSTALL_DIR="$HOME/.tigris/bin"

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

get_latest_version() {
  if command -v curl > /dev/null 2>&1; then
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
  elif command -v wget > /dev/null 2>&1; then
    wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
  else
    error "Neither curl nor wget found. Please install one of them."
  fi
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

main() {
  detect_platform
  detect_shell
  info "Detected platform: $PLATFORM"

  # Determine install directory
  INSTALL_DIR="${TIGRIS_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
  mkdir -p "$INSTALL_DIR"

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
    # Fetch from GitHub releases
    VERSION="${TIGRIS_VERSION:-}"
    if [ -z "$VERSION" ]; then
      info "Fetching latest version..."
      VERSION="$(get_latest_version)"
      if [ -z "$VERSION" ]; then
        error "Failed to determine latest version"
      fi
    fi
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARCHIVE_NAME}"
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

  # Install binary
  mv "$EXTRACTED_BINARY" "${INSTALL_DIR}/${BINARY_FILE}"
  chmod +x "${INSTALL_DIR}/${BINARY_FILE}"

  # Create t3 symlink
  ln -sf "${INSTALL_DIR}/${BINARY_FILE}" "${INSTALL_DIR}/t3" 2>/dev/null || true

  success "Installed $BINARY_NAME to ${INSTALL_DIR}/${BINARY_FILE}"

  # Add to PATH (skip if testing)
  if [ "${TIGRIS_SKIP_PATH:-}" != "1" ]; then
    add_to_path "$INSTALL_DIR"
  fi

  # Show welcome banner
  show_banner

  # Remind about new shell if PATH was modified
  if ! command -v tigris > /dev/null 2>&1; then
    warn "You may need to restart your shell or run: source ~/.${SHELL_NAME}rc"
  fi
}

main
