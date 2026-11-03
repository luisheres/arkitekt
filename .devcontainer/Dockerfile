FROM mcr.microsoft.com/devcontainers/base:bookworm

# Install everything that needs root at IMAGE BUILD TIME so the running
# (non-root "vscode") user never needs sudo/apt afterwards.
#
# System libraries required by a Dioxus DESKTOP app on Linux. Dioxus desktop
# renders through wry/tao, which wrap WebKitGTK (a webview) — NOT winit/X11
# like egui/eframe did. The relevant deps (per dioxuslabs.com getting-started):
#   - webkit2gtk 4.1 + gtk3 + soup3 + javascriptcoregtk: the webview engine
#   - libxdo (xdotool): window management / global shortcuts used by tao
#   - libayatana-appindicator3 + librsvg2: system tray support
#   - mesa EGL/GL + llvmpipe (dri): software GL compositing when no GPU exists
#     (paired with LIBGL_ALWAYS_SOFTWARE=1 in devcontainer.json)
#   - openssl: HTTPS (e.g. map tiles, keelson assets)
#   - protobuf-compiler: build-time .proto codegen for keelson messages
#   - libudev: gamepad enumeration for gilrs (M7 manual control)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        curl \
        wget \
        file \
        libwebkit2gtk-4.1-dev \
        libgtk-3-dev \
        libsoup-3.0-dev \
        libjavascriptcoregtk-4.1-dev \
        libxdo-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libegl1-mesa-dev \
        libgl1-mesa-dev \
        libgl1-mesa-dri \
        libssl-dev \
        libudev-dev \
        ca-certificates \
        protobuf-compiler \
    # Headless debug loop for the desktop app: capture and drive the WebKitGTK
    # window over the WSLg XWayland display (DISPLAY=:0). grim/Wayland capture is
    # unavailable (WSLg's Weston has no wlr-screencopy), so run the app with
    # GDK_BACKEND=x11 and use these X11 tools instead:
    #   - scrot + imagemagick (`import`): screenshot a window by id
    #   - x11-utils (`xwininfo`/`xdpyinfo`): find the window id, probe the display
    #   - xdotool: inject clicks/keys to drive the UI in automated checks
        scrot \
        imagemagick \
        x11-utils \
        xdotool \
    && rm -rf /var/lib/apt/lists/*

# Allow the non-root user to access /dev/ttyACM* devices bind-mounted from the
# host (owned by root:dialout). The devcontainer.json cgroup rule restricts
# kernel access to major 166 (ttyACM) regardless of what else is under /dev.
RUN usermod -aG dialout vscode
