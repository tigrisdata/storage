#!/usr/bin/env bash
# Regenerate the Homebrew formula for the released Tigris CLI and open a PR
# against the tap repo.
#
# The CLI's release tag is @tigrisdata/cli@<version> — it contains '/' and '@',
# which are awkward and inconsistent to embed in a download path by hand. So we
# never build those URLs: we read the release from the GitHub API and copy each
# asset's own download URL verbatim into the formula.
#
# Usage:
#   scripts/update-homebrew.sh <version>
#
# Environment:
#   HOMEBREW_TAP_TOKEN  GitHub token with push + PR access to the tap (required)
#   GITHUB_TOKEN        Token that can read the CLI_REPO releases (the default
#                       Actions token; required)
#   HOMEBREW_TAP_REPO   Override tap repo (default: tigrisdata/homebrew-tap)
#   CLI_REPO            Override source repo (default: tigrisdata/storage)

set -euo pipefail

VERSION="${1:?Usage: update-homebrew.sh <version>}"
TAP_REPO="${HOMEBREW_TAP_REPO:-tigrisdata/homebrew-tap}"
CLI_REPO="${CLI_REPO:-tigrisdata/storage}"
TAG="@tigrisdata/cli@${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/../homebrew/Formula/tigris.rb"
BRANCH="update-tigris-${VERSION}"

if [ ! -f "$TEMPLATE" ]; then
  echo "ERROR: Formula template not found at $TEMPLATE"
  exit 1
fi

# --- Read the release + asset URLs from GitHub (uses GITHUB_TOKEN). gh encodes
#     the '@'/'/'-laden tag for the API call; we never touch the download URLs. ---
ASSETS_JSON="$(GH_TOKEN="${GITHUB_TOKEN:-}" gh release view "$TAG" --repo "$CLI_REPO" --json assets,url)"
RELEASE_URL="$(printf '%s' "$ASSETS_JSON" | jq -r '.url')"

asset_url() {
  printf '%s' "$ASSETS_JSON" | jq -r --arg n "$1" '.assets[] | select(.name == $n) | .url'
}

URL_DARWIN_ARM64="$(asset_url tigris-darwin-arm64.tar.gz)"
URL_DARWIN_X64="$(asset_url tigris-darwin-x64.tar.gz)"
URL_LINUX_ARM64="$(asset_url tigris-linux-arm64.tar.gz)"
URL_LINUX_X64="$(asset_url tigris-linux-x64.tar.gz)"

for pair in \
  "darwin-arm64:$URL_DARWIN_ARM64" \
  "darwin-x64:$URL_DARWIN_X64" \
  "linux-arm64:$URL_LINUX_ARM64" \
  "linux-x64:$URL_LINUX_X64"; do
  name="${pair%%:*}"
  url="${pair#*:}"
  if [ -z "$url" ] || [ "$url" = "null" ]; then
    echo "ERROR: missing release asset for ${name} on ${TAG}"
    exit 1
  fi
done

compute_sha256() {
  local url="$1" tmp
  tmp="$(mktemp)"
  echo "Downloading ${url} ..." >&2
  curl -fsSL "$url" -o "$tmp"
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$tmp" | awk '{print $1}'
  else
    shasum -a 256 "$tmp" | awk '{print $1}'
  fi
  rm -f "$tmp"
}

echo "Computing SHA256 hashes for ${TAG} ..."
SHA_DARWIN_ARM64="$(compute_sha256 "$URL_DARWIN_ARM64")"
SHA_DARWIN_X64="$(compute_sha256 "$URL_DARWIN_X64")"
SHA_LINUX_ARM64="$(compute_sha256 "$URL_LINUX_ARM64")"
SHA_LINUX_X64="$(compute_sha256 "$URL_LINUX_X64")"

# Generate the formula. Use '|' as the sed delimiter since the download URLs
# contain '/' (they never contain '|').
FORMULA="$(sed \
  -e "s|VERSION_PLACEHOLDER|${VERSION}|g" \
  -e "s|URL_DARWIN_ARM64_PLACEHOLDER|${URL_DARWIN_ARM64}|g" \
  -e "s|URL_DARWIN_X64_PLACEHOLDER|${URL_DARWIN_X64}|g" \
  -e "s|URL_LINUX_ARM64_PLACEHOLDER|${URL_LINUX_ARM64}|g" \
  -e "s|URL_LINUX_X64_PLACEHOLDER|${URL_LINUX_X64}|g" \
  -e "s|SHA_DARWIN_ARM64_PLACEHOLDER|${SHA_DARWIN_ARM64}|g" \
  -e "s|SHA_DARWIN_X64_PLACEHOLDER|${SHA_DARWIN_X64}|g" \
  -e "s|SHA_LINUX_ARM64_PLACEHOLDER|${SHA_LINUX_ARM64}|g" \
  -e "s|SHA_LINUX_X64_PLACEHOLDER|${SHA_LINUX_X64}|g" \
  "$TEMPLATE")"

echo "Generated formula:"
echo "---"
echo "$FORMULA"
echo "---"

# --- Push to the tap and open a PR (uses HOMEBREW_TAP_TOKEN) ---
export GH_TOKEN="${HOMEBREW_TAP_TOKEN:?HOMEBREW_TAP_TOKEN is required}"
CLONE_URL="https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/${TAP_REPO}.git"

# Early exit: a PR is already open for this version.
EXISTING_PR="$(gh pr list --repo "$TAP_REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty' 2>/dev/null || true)"
if [ -n "$EXISTING_PR" ]; then
  echo "PR #${EXISTING_PR} already exists for ${BRANCH}."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Cloning ${TAP_REPO} ..."
git clone --depth 1 "$CLONE_URL" "$TMP_DIR/tap"
cd "$TMP_DIR/tap"

mkdir -p Formula
printf '%s\n' "$FORMULA" > Formula/tigris.rb
git add Formula/tigris.rb

if git diff --cached --quiet; then
  echo "Formula is already up to date."
  exit 0
fi

git checkout -b "$BRANCH"
git -c user.name="github-actions[bot]" -c user.email="github-actions[bot]@users.noreply.github.com" \
  commit -m "tigris ${VERSION}"
git push origin "$BRANCH"

echo "Creating pull request ..."
gh pr create \
  --repo "$TAP_REPO" \
  --base main \
  --head "$BRANCH" \
  --title "tigris ${VERSION}" \
  --body "Update Tigris CLI formula to ${VERSION} ([release](${RELEASE_URL}))."

echo "Pull request created for ${VERSION}"
