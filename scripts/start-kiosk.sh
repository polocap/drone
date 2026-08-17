#!/bin/bash

SETUP_DIR=$(dirname "$0")
KIOSK_DIR="/opt/drone"

xhost +local:root || true

/usr/bin/firefox \
  --kiosk \
  --no-first-run \
  --disable-fx-buttons=autologin-feedback-menu \
  --hide-deeplink-failure-warnings \
  --disable-background-networking \
  --disable-extensions \
  --no-default-browser-check \
  --start-fullscreen \
  --url "http://localhost:8080" \
  > /dev/null 2>&1 &

KIOSK_PID=$!
echo "Firefox kiosk démarré (PID: $KIOSK_PID)"
echo $KIOSK_PID > /var/run/drone-kiosk.pid
