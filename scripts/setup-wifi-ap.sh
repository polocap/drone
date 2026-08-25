#!/bin/bash
#
# DRONE OPS WiFi Access Point Setup Script
# Detects available WiFi interfaces and configures AP mode
#

set -e

SSID="DRONE-OPS-001"
PASSWORD="drone2024"
IP_PREFIX="10.0.0"
AP_IP="${IP_PREFIX}.1"
DHCP_RANGE="${IP_PREFIX}.10,${IP_PREFIX}.100,12h"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Find WiFi interface
find_wifi_interface() {
    log_info "Recherche de l'interface WiFi..."

    # Try common WiFi interface names
    local interfaces=("wlan0" "wlp2s0" "wlp1s0" "wlo1" "wlx" "wlp0s20f3")

    for iface in "${interfaces[@]}"; do
        if [[ "$iface" == "wlx"* ]]; then
            # Handle USB WiFi adapters with mac addresses in name
            local usb_iface=$(ip link show | grep -oE 'wlx[0-9a-f]+' | head -1)
            if [ -n "$usb_iface" ]; then
                if ip link show "$usb_iface" &>/dev/null; then
                    WIFI_IFACE="$usb_iface"
                    log_success "Interface WiFi USB trouvée: $WIFI_IFACE"
                    return 0
                fi
            fi
        elif ip link show "$iface" &>/dev/null; then
            WIFI_IFACE="$iface"
            log_success "Interface WiFi trouvée: $WIFI_IFACE"
            return 0
        fi
    done

    # Fallback: try to find any wireless interface
    WIFI_IFACE=$(iw dev 2>/dev/null | grep -E "^\\s+Interface" | awk '{print $2}' | head -1)

    if [ -z "$WIFI_IFACE" ]; then
        log_error "Aucune interface WiFi trouvée!"
        log_info "Interfaces disponibles:"
        ip link show
        exit 1
    fi

    log_success "Interface WiFi détectée: $WIFI_IFACE"
    return 0
}

# Check if interface supports AP mode
check_ap_support() {
    log_info "Vérification support mode AP..."

    if ! command -v iw &>/dev/null; then
        log_warn "'iw' non disponible, impossible de vérifier le support AP"
        return 0
    fi

    local supported=$(iw list 2>/dev/null | grep -A 5 "$WIFI_IFACE" | grep -i "AP" | head -1)

    if [ -z "$supported" ]; then
        log_warn "Interface $WIFI_IFACE ne supporte pas explicitement le mode AP"
        log_info "Tentative de configuration via NetworkManager..."
    else
        log_success "Mode AP supporté"
    fi
}

# Stop conflicting services
stop_conflicting_services() {
    log_info "Arrêt des services conflictuels..."

    # Stop wpa_supplicant
    systemctl stop wpa_supplicant 2>/dev/null || true
    pkill wpa_supplicant 2>/dev/null || true

    # Stop NetworkManager WiFi management temporarily
    if systemctl is-active --quiet NetworkManager 2>/dev/null; then
        nmcli radio wifi off 2>/dev/null || true
        log_info "WiFi NetworkManager désactivé temporairement"
    fi

    # Stop any existing hostapd
    pkill hostapd 2>/dev/null || true

    # Stop any existing dnsmasq
    pkill dnsmasq 2>/dev/null || true

    sleep 2
    log_success "Services conflictuels arrêtés"
}

# Configure interface
configure_interface() {
    log_info "Configuration de l'interface $WIFI_IFACE..."

    # Bring interface up
    ip link set "$WIFI_IFACE" up || {
        log_error "Impossible d'activer l'interface $WIFI_IFACE"
        exit 1
    }

    # Flush existing IPs
    ip addr flush dev "$WIFI_IFACE" 2>/dev/null || true

    # Set static IP
    ip addr add "${AP_IP}/24" dev "$WIFI_IFACE" || {
        log_error "Impossible de configurer l'IP $AP_IP"
        exit 1
    }

    log_success "Interface configurée: $WIFI_IFACE @ $AP_IP"
}

# Create hostapd configuration
create_hostapd_config() {
    log_info "Création de la configuration hostapd..."

    mkdir -p /etc/hostapd

    cat > /etc/hostapd/hostapd.conf <<EOF
# DRONE OPS WiFi AP Configuration
interface=$WIFI_IFACE
driver=nl80211

# Basic settings
ssid=$SSID
hw_mode=g
channel=7
wmm_enabled=1

# 802.11n support
ieee80211n=1
ieee80211ac=1
ieee80211ax=1

# Security
wpa=2
wpa_passphrase=$PASSWORD
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP

# Broadcast settings
ignore_broadcast_ssid=0

# Logging
logger_syslog=-1
logger_syslog_level=2

# Performance
beacon_int=100
dtim_period=2
max_num_sta=32
EOF

    log_success "Configuration hostapd créée: /etc/hostapd/hostapd.conf"
}

# Create dnsmasq configuration
create_dnsmasq_config() {
    log_info "Création de la configuration dnsmasq..."

    mkdir -p /etc/dnsmasq.d

    cat > /etc/dnsmasq.d/drone-ap.conf <<EOF
# DRONE OPS DHCP Configuration
interface=$WIFI_IFACE
bind-interfaces

# DHCP range
dhcp-range=${DHCP_RANGE}

# Gateway
dhcp-option=3,${AP_IP}

# DNS
dhcp-option=6,${AP_IP},8.8.8.8

# Local domain
local=/drone.local/
expand-hosts
domain=drone.local

# Cache settings
cache-size=1000
no-resolv
server=8.8.8.8
server=8.8.4.4

# Logging
log-queries
log-dhcp
EOF

    log_success "Configuration dnsmasq créée: /etc/dnsmasq.d/drone-ap.conf"
}

# Start services
start_services() {
    log_info "Démarrage des services..."

    # Start hostapd
    if command -v hostapd &>/dev/null; then
        hostapd -B /etc/hostapd/hostapd.conf || {
            log_error "Échec du démarrage de hostapd"
            exit 1
        }
        log_success "hostapd démarré"
    else
        log_error "hostapd non installé"
        log_info "Installation: sudo apt-get install hostapd"
        exit 1
    fi

    sleep 2

    # Start dnsmasq
    if command -v dnsmasq &>/dev/null; then
        dnsmasq --conf-file=/etc/dnsmasq.d/drone-ap.conf || {
            log_warn "dnsmasq déjà en cours d'exécution ou erreur"
        }
        log_success "dnsmasq démarré"
    else
        log_warn "dnsmasq non installé"
        log_info "Installation: sudo apt-get install dnsmasq"
    fi
}

# Alternative: Use NetworkManager hotspot
use_networkmanager_hotspot() {
    log_info "Configuration via NetworkManager..."

    if ! command -v nmcli &>/dev/null; then
        log_error "NetworkManager non disponible"
        return 1
    fi

    # Check if WiFi is available
    if ! nmcli dev show "$WIFI_IFACE" &>/dev/null; then
        log_error "Interface $WIFI_IFACE non gérée par NetworkManager"
        return 1
    fi

    # Create hotspot
    nmcli dev wifi hotspot ifname "$WIFI_IFACE" ssid "$SSID" password "$PASSWORD" con-name "DRONE-OPS-AP" || {
        log_error "Échec de création du hotspot via NetworkManager"
        return 1
    }

    # Configure static IP
    nmcli con modify "DRONE-OPS-AP" ipv4.addresses "$AP_IP/24" || true
    nmcli con modify "DRONE-OPS-AP" ipv4.method manual || true
    nmcli con mod "DRONE-OPS-AP" connection.autoconnect yes || true

    log_success "Hotspot NetworkManager configuré"
    return 0
}

# Verify AP is working
verify_ap() {
    log_info "Vérification du point d'accès..."

    sleep 3

    # Check if interface has the AP IP
    if ip addr show "$WIFI_IFACE" | grep -q "$AP_IP"; then
        log_success "IP $AP_IP configurée sur $WIFI_IFACE"
    else
        log_warn "IP non trouvée sur l'interface"
    fi

    # Check hostapd process
    if pgrep -x hostapd &>/dev/null; then
        log_success "hostapd est en cours d'exécution"
    else
        log_warn "hostapd ne semble pas en cours d'exécution"
    fi

    # Display status
    log_info ""
    log_info "=================================="
    log_info "  WiFi AP Status"
    log_info "=================================="
    log_info "  SSID:     $SSID"
    log_info "  Password: $PASSWORD"
    log_info "  IP:       $AP_IP"
    log_info "  Interface: $WIFI_IFACE"
    log_info "=================================="
}

# Save state for systemd
save_state() {
    mkdir -p /var/run/drone
    echo "$WIFI_IFACE" > /var/run/drone/wifi-iface
    echo "$AP_IP" > /var/run/drone/wifi-ip
}

# Main function
main() {
    log_info "=================================="
    log_info "  DRONE OPS WiFi AP Setup"
    log_info "=================================="
    echo ""

    # Check root
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en root"
        echo "   sudo bash $0"
        exit 1
    fi

    # Find interface
    find_wifi_interface
    check_ap_support

    # Stop conflicting services
    stop_conflicting_services

    # Try NetworkManager first (more modern approach)
    if use_networkmanager_hotspot 2>/dev/null; then
        log_success "Utilisation de NetworkManager pour le hotspot"
    else
        log_info "Utilisation de la méthode manuelle (hostapd + dnsmasq)"
        configure_interface
        create_hostapd_config
        create_dnsmasq_config
        start_services
    fi

    # Save state
    save_state

    # Verify
    verify_ap

    log_info ""
    log_success "WiFi AP démarré avec succès!"
    log_info "Les télécommandes DJI peuvent maintenant se connecter à '$SSID'"
}

main "$@"
