#!/bin/bash
set -euo pipefail

# This script runs as the non-root "vscode" user and must NOT require sudo.
# Everything that needs root (apt packages, dialout group membership) is baked
# into the image at build time — see .devcontainer/Dockerfile.

# Install Claude Code via the native installer into ~/.local/bin. This is a
# user-owned, self-updating install: `claude update` works without sudo,
# unlike the previous root-owned npm global install. The installer adds
# ~/.local/bin to PATH via your shell rc (e.g. ~/.bashrc).
if ! command -v claude >/dev/null 2>&1; then
    echo "Installing Claude Code (native installer, user-local)..."
    curl -fsSL https://claude.ai/install.sh | bash
else
    echo "Claude Code already installed at $(command -v claude) — skipping."
fi

# Install the project's npm dependencies and the headless Chromium used by
# `npm run capture` (it lives in ~/.cache/ms-playwright, so no sudo is needed).
npm ci
npx playwright install chromium

echo "Development environment setup complete!"
