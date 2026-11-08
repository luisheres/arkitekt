#!/bin/bash
set -euo pipefail

# Runs as the non-root "vscode" user; needs no sudo.

# Claude Code, user-local and self-updating (`claude update`).
if ! command -v claude >/dev/null 2>&1; then
    echo "Installing Claude Code..."
    curl -fsSL https://claude.ai/install.sh | bash
fi

# The project's dependencies, and the headless Chromium used by the end-to-end tests and
# screenshots (in ~/.cache/ms-playwright).
npm ci
npx playwright install chromium

echo "Development environment ready: npm run dev"
