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

# Install the Dioxus CLI (`dx`), used to build/serve/bundle Dioxus apps.
#
# NOTE: do NOT use `cargo binstall` here. The prebuilt dx binaries are linked
# against a newer glibc (>= 2.39) than Debian bookworm ships (2.36), so they
# fail at runtime with "GLIBC_2.39 not found". Build from source instead so dx
# links against the container's own glibc. Slower (a few minutes) but correct.
if ! command -v dx >/dev/null 2>&1; then
    echo "Installing Dioxus CLI (dx) from source..."
    cargo install dioxus-cli --locked
else
    echo "Dioxus CLI already installed at $(command -v dx) — skipping."
fi

echo "Development environment setup complete!"
