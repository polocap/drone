#!/bin/bash
#
# DRONE OPS Kiosk Session (cage + Chromium)
# Started by GDM auto-login via the "drone-kiosk" Wayland session (user: drone).
# cage is a kiosk compositor: Chromium is the single fullscreen client.
#

KIOSK_URL="http://localhost:8080"
LOG_TAG="drone-kiosk-session"

log() { echo "[$LOG_TAG] $1"; }

export XDG_SESSION_TYPE=wayland
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export MOZ_ENABLE_WAYLAND=1
# Hide Wayland cursor at compositor level (touch-only kiosk, avoid cursor/touch mismatch)
export WLR_XCURSOR_SIZE=1
export XCURSOR_SIZE=1
export XCURSOR_THEME="OzoneWhite"
# Force 1:1 pixel mapping - prevents touch vs CSS coordinate scaling mismatch
# (HiDPI factor 1.25/1.5 would make 8→5, ×→9 offset by one row)
export GDK_SCALE=1
export GDK_DPI_SCALE=1
export WLR_DRM_NO_ATOMIC=1

# Launch immediately — the app shows the coreLinks loading screen and
# retries the API itself, so there is no black screen while services boot
log "Launching cage + Chromium kiosk at $KIOSK_URL (app retries API on its own)"

exec cage -d -- \
    chromium \
    --kiosk \
    --noerrdialogs \
    --no-first-run \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --hide-crash-restore-bubble \
    --disable-sync \
    --disable-background-networking \
    --disable-features=Translate \
    --disable-translate \
    --no-translate \
    --ozone-platform-hint=auto \
    --force-device-scale-factor=1 \
    --disable-pinch \
    --disable-features=TouchpadOverscrollHistoryNavigation \
    --start-fullscreen \
    "$KIOSK_URL"
