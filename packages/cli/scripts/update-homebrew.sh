#!/usr/bin/env bash
# Updates the Homebrew formula with the correct version and SHA256 hashes,
# then opens a PR against the tigrisdata/homebrew-tap repo.
#
# Usage:
#   scripts/update-homebrew.sh <version>
#
# Example:
#   scripts/update-homebrew.sh 1.2.3
#
# Environment variables:
#   HOMEBREW_TAP_TOKEN  - GitHub token with push and PR access to the tap repo (required in CI)
#   HOMEBREW_TAP_REPO   - Override tap repo (default: tigrisdata/homebrew-tap)

set -euo pipefail

VERSION="${1:?Usage: update-homebrew.sh <version>}"
TAP_REPO="${HOMEBREW_TAP_REPO:-tigrisdata/homebrew-tap}"
CLI_REPO="tigrisdata/cli"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/../homebrew/Formula/tigris.rb"
BRANCH="update-tigris-${VERSION}"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: Formula template not found at $TEMPLATE"
  exit 1
fi

CLONE_URL="https://github.com/${TAP_REPO}.git"
if [ -n "${HOMEBREW_TAP_TOKEN:-}" ]; then
  CLONE_URL="https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/${TAP_REPO}.git"
fi

export GH_TOKEN="${HOMEBREW_TAP_TOKEN:-}"

# Early exit: if a PR already exists for this version, nothing to do
EXISTING_PR="$(gh pr list --repo "$TAP_REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)"
if [ -n "$EXISTING_PR" ]; then
  echo "PR #${EXISTING_PR} already exists for ${BRANCH}."
  exit 0
fi

# Early exit: if the branch exists but no PR, skip downloads and just create the PR
REMOTE_BRANCH_EXISTS="$(git ls-remote "https://github.com/${TAP_REPO}.git" "refs/heads/${BRANCH}" | head -1)"
if [ -n "$REMOTE_BRANCH_EXISTS" ]; then
  echo "Branch ${BRANCH} already exists on remote. Creating PR..."
  gh pr create \
    --repo "$TAP_REPO" \
    --base main \
    --head "$BRANCH" \
    --title "tigris ${VERSION}" \
    --body "Update Tigris CLI formula to [v${VERSION}](https://github.com/${CLI_REPO}/releases/tag/v${VERSION})."
  echo ""
  echo "Pull request created for v${VERSION}"
  exit 0
fi

# Download each archive and compute SHA256
compute_sha256() {
  local asset_name="$1"
  local url="https://github.com/${CLI_REPO}/releases/download/v${VERSION}/${asset_name}"
  local tmp
  tmp="$(mktemp)"
  echo "Downloading ${asset_name}..." >&2
  curl -fsSL "$url" -o "$tmp"
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$tmp" | awk '{print $1}'
  else
    shasum -a 256 "$tmp" | awk '{print $1}'
  fi
  rm -f "$tmp"
}

echo "Computing SHA256 hashes for v${VERSION}..."

SHA_DARWIN_ARM64="$(compute_sha256 "tigris-darwin-arm64.tar.gz")"
SHA_DARWIN_X64="$(compute_sha256 "tigris-darwin-x64.tar.gz")"
SHA_LINUX_ARM64="$(compute_sha256 "tigris-linux-arm64.tar.gz")"
SHA_LINUX_X64="$(compute_sha256 "tigris-linux-x64.tar.gz")"

echo "  darwin-arm64: ${SHA_DARWIN_ARM64}"
echo "  darwin-x64:   ${SHA_DARWIN_X64}"
echo "  linux-arm64:  ${SHA_LINUX_ARM64}"
echo "  linux-x64:    ${SHA_LINUX_X64}"

# Generate the formula from the template
FORMULA="$(sed \
  -e "s/VERSION_PLACEHOLDER/${VERSION}/g" \
  -e "s/SHA_DARWIN_ARM64_PLACEHOLDER/${SHA_DARWIN_ARM64}/g" \
  -e "s/SHA_DARWIN_X64_PLACEHOLDER/${SHA_DARWIN_X64}/g" \
  -e "s/SHA_LINUX_ARM64_PLACEHOLDER/${SHA_LINUX_ARM64}/g" \
  -e "s/SHA_LINUX_X64_PLACEHOLDER/${SHA_LINUX_X64}/g" \
  "$TEMPLATE")"

echo ""
echo "Generated formula:"
echo "---"
echo "$FORMULA"
echo "---"

# Clone the tap repo, update the formula, and push
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo ""
echo "Cloning ${TAP_REPO}..."
git clone --depth 1 "$CLONE_URL" "$TMP_DIR/tap"

cd "$TMP_DIR/tap"

mkdir -p Formula
echo "$FORMULA" > Formula/tigris.rb

git add Formula/tigris.rb

if git diff --cached --quiet; then
  echo "Formula is already up to date."
  exit 0
fi

git checkout -b "$BRANCH"
git -c user.name="github-actions[bot]" -c user.email="github-actions[bot]@users.noreply.github.com" \
  commit -m "tigris ${VERSION}"
git push origin "$BRANCH"

echo ""
echo "Creating pull request..."
gh pr create \
  --repo "$TAP_REPO" \
  --base main \
  --head "$BRANCH" \
  --title "tigris ${VERSION}" \
  --body "Update Tigris CLI formula to [v${VERSION}](https://github.com/${CLI_REPO}/releases/tag/v${VERSION})."

echo ""
echo "Pull request created for v${VERSION}"
