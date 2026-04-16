#!/usr/bin/env bash
#
# Release script for @tigrisdata packages
#
# Runs semantic-release for each package in dependency order:
# 1. Independent packages first (storage, iam)
# 2. Dependent packages last (keyv-tigris, react - depend on storage)
#
# Usage:
#   ./scripts/release.sh [--dry-run]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  # Get current branch for local dry-run, or use GITHUB_HEAD_REF in CI PR context
  CURRENT_BRANCH="${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}"
  # Skip npm verification in dry-run (only verify GitHub conditions)
  DRY_RUN="--dry-run --no-ci --branches ${CURRENT_BRANCH} --verify-conditions @semantic-release/github"
  # Unset GITHUB_ACTIONS so semantic-release doesn't try to read CI env vars
  unset GITHUB_ACTIONS
  echo "🔍 Running in dry-run mode on branch: ${CURRENT_BRANCH}"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Package release order (dependencies first)
# storage and iam are independent, keyv-tigris and react depend on storage
PACKAGES=(
  "packages/storage"
  "packages/iam"
  "packages/ai"
  "packages/keyv-tigris"
  "packages/react"
)

release_package() {
  local pkg_dir="$1"
  local pkg_name
  pkg_name=$(node -p "require('$ROOT_DIR/$pkg_dir/package.json').name")

  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}📦 Releasing: ${pkg_name}${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  cd "$ROOT_DIR/$pkg_dir"

  # Run semantic-release with package-specific config
  if npx semantic-release $DRY_RUN; then
    echo -e "${GREEN}✅ ${pkg_name} release completed${NC}"
    return 0
  else
    local exit_code=$?
    # Exit code 1 with no release is expected (no relevant commits)
    if [[ $exit_code -eq 1 ]]; then
      echo -e "${YELLOW}⏭️  ${pkg_name} - No release needed (no relevant commits)${NC}"
      return 0
    else
      echo -e "${RED}❌ ${pkg_name} release failed with exit code $exit_code${NC}"
      return $exit_code
    fi
  fi
}

main() {
  echo -e "${BLUE}🚀 Starting @tigrisdata release process${NC}"
  echo -e "${BLUE}   Release order: storage → iam → ai → keyv-tigris → react${NC}\n"

  cd "$ROOT_DIR"

  local failed=0

  for pkg in "${PACKAGES[@]}"; do
    if ! release_package "$pkg"; then
      failed=1
      echo -e "${RED}⚠️  Stopping release process due to failure in $pkg${NC}"
      break
    fi
  done

  echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  if [[ $failed -eq 0 ]]; then
    echo -e "${GREEN}✅ All releases completed successfully${NC}"
  else
    echo -e "${RED}❌ Release process failed${NC}"
    exit 1
  fi
}

main "$@"
