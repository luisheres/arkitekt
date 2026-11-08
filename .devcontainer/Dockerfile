# Node 22 on Debian, with the system libraries headless Chromium needs for the end-to-end
# tests and screenshots (npm run e2e, npm run capture). Installed at image build time, so
# the non-root "vscode" user never needs sudo.
FROM mcr.microsoft.com/devcontainers/javascript-node:22-bookworm

RUN npx -y playwright@1 install-deps chromium \
    && rm -rf /var/lib/apt/lists/*
