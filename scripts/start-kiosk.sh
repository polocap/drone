#!/bin/bash
#
# DRONE OPS Kiosk Launcher
# Launches Firefox in kiosk mode with proper error handling
#

set -e

KIOSK_DIR="/opt/drone"
API_URL="http://localhost:8080"
MAX_RETRIES=30
RETRY_DELAY=2

# Colors (for logging)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[KIOSK]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[KIOSK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[KIOSK]${NC} $1"
}

log_error() {
    echo -e "${RED}[KIOSK]${NC} $1"
}

# Wait for X11
wait_for_x11() {
    log_info "Attente du serveur X11..."
    local retries=0
    while ! pgrep -x "Xorg" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge $MAX_RETRIES ]; then
            log_error "Timeout en attendant X11"
            return 1
        fi
        sleep 1
    done
    log_success "X11 disponible"
}

# Allow X11 access for root
setup_x11() {
    log_info "Configuration de l'accès X11..."
    xhost +local:root 2>/dev/null || true
    export DISPLAY=:0
    export HOME=/root
    export XAUTHORITY=/root/.Xauthority
}

# Wait for API to be ready
wait_for_api() {
    log_info "Attente du serveur API ($API_URL)..."
    local retries=0
    while ! curl -s "${API_URL}/health" > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [ $retries -ge $MAX_RETRIES ]; then
            log_error "Timeout en attendant l'API"
            log_warn "Démarrage du kiosk quand même..."
            return 1
        fi
        log_info "Tentative $retries/$MAX_RETRIES..."
        sleep $RETRY_DELAY
    done
    log_success "API disponible sur $API_URL"
}

# Kill existing Firefox instances
kill_existing_firefox() {
    log_info "Arrêt des instances Firefox existantes..."
    pkill -9 -f firefox || true
    pkill -9 -f "firefox-esr" || true
    sleep 2
}

# Launch Firefox kiosk
launch_kiosk() {
    log_info "Démarrage de Firefox en mode kiosk..."

    # Firefox arguments for kiosk mode
    local firefox_args=(
        "--kiosk"
        "--no-first-run"
        "--disable-fx-migration"
        "--disable-default-browser-check"
        "--disable-background-networking"
        "--disable-extensions"
        "--disable-sync"
        "--disable-session-crashed-bubble"
        "--hide-crash-restore-bubble"
        "--no-crash-dialog"
        "--start-fullscreen"
        "--url" "$API_URL"
    )

    # Check which Firefox binary exists
    local firefox_bin=""
    if command -v firefox &>/dev/null; then
        firefox_bin="firefox"
    elif command -v firefox-esr &>/dev/null; then
        firefox_bin="firefox-esr"
    else
        log_error "Firefox non trouvé"
        exit 1
    fi

    log_info "Utilisation de: $firefox_bin"

    # Launch Firefox
    $firefox_bin "${firefox_args[@]}" &
    local kiosk_pid=$!

    log_success "Firefox démarré (PID: $kiosk_pid)"
    echo $kiosk_pid > /var/run/drone-kiosk.pid

    # Wait a bit and verify it's running
    sleep 3
    if kill -0 $kiosk_pid 2>/dev/null; then
        log_success "Kiosk actif et fonctionnel"
    else
        log_error "Firefox s'est arrêté prématurément"
        return 1
    fi
}

# Hide cursor
hide_cursor() {
    log_info "Masquage du curseur..."
    if command -v unclutter &>/dev/null; then
        unclutter -idle 0.1 -root &
        log_success "Curseur masqué (unclutter)"
    else
        log_warn "unclutter non disponible, le curseur sera visible"
    fi
}

# Disable screen blanking
disable_screen_blanking() {
    log_info "Désactivation de la mise en veille de l'écran..."
    xset -dpms 2>/dev/null || true
    xset s off 2>/dev/null || true
    xset s noblank 2>/dev/null || true
    log_success "Mise en veille désactivée"
}

# Main execution
main() {
    log_info "=================================="
    log_info "  DRONE OPS Kiosk Launcher"
    log_info "=================================="
    echo ""

    # Setup
    wait_for_x11
    setup_x11
    disable_screen_blanking
    hide_cursor
    wait_for_api

    # Kill existing and launch new
    kill_existing_firefox
    launch_kiosk

    log_info ""
    log_success "Kiosk démarré avec succès!"
    log_info "URL: $API_URL"
    log_info "PID: $(cat /var/run/drone-kiosk.pid 2>/dev/null || echo 'N/A')"
}

# Run main
main "$@"
