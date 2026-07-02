#!/usr/bin/env bash
# Local test build only (e.g. on a Mac) — NOT used by the GitHub Actions
# deploy workflow, which builds independently on push. Run this just to
# confirm everything still compiles before you commit.
#
# Usage: ./scripts/build.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> site"
npm install
npm run build

echo "==> admin"
(cd admin-src && npm install && npm run build)

echo "==> mcp-server"
(cd mcp-server && npm install && npm run build)

echo "==> done. Preview locally with: npx serve ."
