#!/bin/bash
#
# DRONE OPS WiFi Access Point Setup Script
# Detects available WiFi interfaces and configures AP mode
#

set -e

SSID="corelink-001"
PASSWORD="9fK7qP2xL8vT4wR!3kD8mN5"
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

# Detect 5GHz band + AP mode support (for the drone feed: higher throughput,
# less interference than 2.4GHz). Falls back to 2.4GHz when unsupported.
SUPPORTS_5GHZ=0

detect_5ghz_support() {
    SUPPORTS_5GHZ=0

    if ! command -v iw &>/dev/null; then
        # Cannot probe the card: attempt 5GHz anyway, both start paths
        # (hostapd and NetworkManager) fall back to 2.4GHz on failure
        log_warn "'iw' non disponible — tentative 5GHz avec repli automatique 2.4GHz"
        SUPPORTS_5GHZ=1
        return
    fi

    # Any 5GHz frequency present in the band list (e.g. "5180.0 MHz [36]")
    if iw list 2>/dev/null | grep -qE '^\s*\*\s*5[0-9]{3}\.[0-9] MHz'; then
        # AP mode must be listed in supported interface modes
        if iw list 2>/dev/null | grep -A 10 'Supported interface modes' | grep -q '\* AP'; then
            SUPPORTS_5GHZ=1
            log_success "Bande 5GHz supportée — le réseau télécommande passera en 5GHz"
        else
            log_warn "Mode AP non listé pour ce driver, bande 2.4GHz utilisée"
        fi
    else
        log_info "Bande 5GHz non disponible — bande 2.4GHz utilisée"
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
# $1 = band: "a" (5GHz) or "g" (2.4GHz)
create_hostapd_config() {
    local band="${1:-g}"
    log_info "Création de la configuration hostapd (bande ${band})..."

    mkdir -p /etc/hostapd

    if [ "$band" = "a" ]; then
        cat > /etc/hostapd/hostapd.conf <<EOF
# DRONE OPS WiFi AP Configuration (5GHz — flux télécommande)
interface=$WIFI_IFACE
driver=nl80211

# Basic settings
ssid=$SSID
country_code=FR
ieee80211d=1
hw_mode=a
channel=36
wmm_enabled=1

# 802.11n/ac (VHT80 on channel 36)
ieee80211n=1
ieee80211ac=1
ht_capab=[HT40+][SHORT-GI-20][SHORT-GI-40]
vht_capab=[SHORT-GI-80]
vht_oper_chwidth=1
vht_oper_centr_freq_seg0_idx=42

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
max_num_sta=8
EOF
    else
        cat > /etc/hostapd/hostapd.conf <<EOF
# DRONE OPS WiFi AP Configuration (2.4GHz — flux télécommande)
interface=$WIFI_IFACE
driver=nl80211

# Basic settings
ssid=$SSID
hw_mode=g
channel=6
wmm_enabled=1

# 802.11n
ieee80211n=1
ht_capab=[HT40+][SHORT-GI-20][DSSS_CCK-40]

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
max_num_sta=8
EOF
    fi

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

    # Start hostapd — 5GHz preferred for the remote feed, 2.4GHz fallback
    if command -v hostapd &>/dev/null; then
        local ap_started=0
        local bands=()
        if [ "$SUPPORTS_5GHZ" = "1" ]; then
            bands=(a g)
        else
            bands=(g)
        fi

        for band in "${bands[@]}"; do
            create_hostapd_config "$band"
            hostapd -B /etc/hostapd/hostapd.conf 2>/dev/null || true
            sleep 2
            if pgrep -x hostapd &>/dev/null && iw dev "$WIFI_IFACE" info 2>/dev/null | grep -q "type AP"; then
                if [ "$band" = "a" ]; then
                    log_success "hostapd démarré (5GHz, canal 36)"
                else
                    log_success "hostapd démarré (2.4GHz)"
                fi
                ap_started=1
                break
            fi
            log_warn "hostapd n'a pas démarré en bande ${band}, tentative suivante..."
            pkill -x hostapd 2>/dev/null || true
            sleep 1
        done

        if [ "$ap_started" != "1" ]; then
            log_error "Échec du démarrage de hostapd"
            exit 1
        fi
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

    # Re-enable WiFi if it was disabled
    nmcli radio wifi on 2>/dev/null || true
    sleep 1

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

    # Prefer 5GHz for the remote feed when the card supports it
    if [ "$SUPPORTS_5GHZ" = "1" ]; then
        nmcli con modify "DRONE-OPS-AP" 802-11-wireless.band a 2>/dev/null || true
        nmcli con modify "DRONE-OPS-AP" 802-11-wireless.channel 36 2>/dev/null || true
        if nmcli con up "DRONE-OPS-AP" 2>/dev/null; then
            log_success "Hotspot en 5GHz (canal 36)"
        else
            log_warn "5GHz refusé par le driver, retour en 2.4GHz"
            nmcli con modify "DRONE-OPS-AP" 802-11-wireless.band bg 2>/dev/null || true
            nmcli con modify "DRONE-OPS-AP" 802-11-wireless.channel 6 2>/dev/null || true
            nmcli con up "DRONE-OPS-AP" 2>/dev/null || true
        fi
    fi

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
    local band_info="2.4GHz"
    if [ "$SUPPORTS_5GHZ" = "1" ]; then band_info="5GHz (si accepté par le driver)"; fi
    log_info ""
    log_info "=================================="
    log_info "  WiFi AP Status (flux télécommande)"
    log_info "=================================="
    log_info "  SSID:      $SSID"
    log_info "  Password:  $PASSWORD"
    log_info "  IP:        $AP_IP"
    log_info "  Interface: $WIFI_IFACE"
    log_info "  Bande:     $band_info"
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
    detect_5ghz_support

    # Stop conflicting services
    stop_conflicting_services

    # Try NetworkManager first (more modern approach)
    if use_networkmanager_hotspot 2>/dev/null; then
        log_success "Utilisation de NetworkManager pour le hotspot"
    else
        log_info "Utilisation de la méthode manuelle (hostapd + dnsmasq)"
        configure_interface
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
