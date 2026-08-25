#!/bin/bash
#
# DRONE OPS SUITE INSTALLER
# Complete installation script for the Beelink server
#

set -e

echo "====================================="
echo "    DRONE OPS SUITE INSTALLER"
echo "    Version 2.0 - Professional Edition"
echo "====================================="
echo ""

NODE_MAJOR=20
INSTALL_DIR="/opt/drone"

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "❌ Ce script doit être exécuté en root"
        echo "   sudo bash $0"
        exit 1
    fi
}

install_dependencies() {
    echo "📦 Installation des dépendances système..."

    apt-get update
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        python3 \
        ffmpeg \
        firefox \
        firefox-esr \
        unclutter \
        upower \
        acpi \
        network-manager \
        net-tools \
        wireless-tools \
        iw \
        hostapd \
        dnsmasq \
        plymouth \
        plymouth-themes

    echo "✅ Dépendances système installées"
}

install_nodejs() {
    echo ""
    echo "📦 Installation de Node.js $NODE_MAJOR..."

    # Remove old Node.js if present
    apt-get remove -y nodejs npm 2>/dev/null || true
    rm -f /etc/apt/sources.list.d/nodesource.list 2>/dev/null || true

    # Install Node.js 20
    curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | bash -
    apt-get install -y nodejs

    node --version
    npm --version

    echo "✅ Node.js installé"
}

install_mediamtx() {
    echo ""
    echo "📦 Installation de MediaMTX..."

    MEDIAMTX_VERSION="1.8.5"
    MEDIAMTX_URL="https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz"

    mkdir -p /opt/mediamtx
    cd /tmp
    wget -q "$MEDIAMTX_URL" -O mediamtx.tar.gz
    tar -xzf mediamtx.tar.gz -C /opt/mediamtx
    chmod +x /opt/mediamtx/mediamtx
    rm -f mediamtx.tar.gz

    echo "✅ MediaMTX installé"
}

setup_directories() {
    echo ""
    echo "📁 Création des répertoires..."

    mkdir -p /opt/drone
    mkdir -p /var/lib/drone/videos
    mkdir -p /etc/drone
    mkdir -p /var/log/drone
    mkdir -p /var/run/drone

    # Set permissions
    chmod 755 /var/lib/drone/videos
    chmod 755 /etc/drone
    chmod 755 /var/run/drone

    echo "✅ Répertoires créés"
}

setup_config() {
    echo ""
    echo "⚙️  Configuration..."

    # Copy config files if they don't exist
    if [ -f "$INSTALL_DIR/config/users.json" ] && [ ! -f /etc/drone/users.json ]; then
        cp "$INSTALL_DIR/config/users.json" /etc/drone/users.json
        echo "   - users.json copié"
    fi

    if [ -f "$INSTALL_DIR/config/mediamtx.yml" ]; then
        cp "$INSTALL_DIR/config/mediamtx.yml" /etc/drone/mediamtx.yml
        echo "   - mediamtx.yml configuré"
    fi

    # Ensure config files have correct permissions
    chmod 644 /etc/drone/*.json 2>/dev/null || true
    chmod 644 /etc/drone/*.yml 2>/dev/null || true

    echo "✅ Configuration copiée"
}

setup_plymouth_theme() {
    echo ""
    echo "🎨 Installation du thème Plymouth..."

    THEME_DIR="/usr/share/plymouth/themes/drone-ops"

    # Create theme directory
    mkdir -p "$THEME_DIR"

    # Copy theme files from project
    if [ -d "$INSTALL_DIR/plymouth/drone-ops" ]; then
        cp "$INSTALL_DIR/plymouth/drone-ops/drone-ops.plymouth" "$THEME_DIR/"
        cp "$INSTALL_DIR/plymouth/drone-ops/drone-ops.script" "$THEME_DIR/"
        chmod 644 "$THEME_DIR"/*

        # Set as default theme
        plymouth-set-default-theme -R drone-ops 2>/dev/null || true

        # Update initramfs
        update-initramfs -u -k all 2>/dev/null || true

        # Update GRUB for splash screen
        if [ -f /etc/default/grub ]; then
            # Backup
            cp /etc/default/grub /etc/default/grub.backup.$(date +%Y%m%d) 2>/dev/null || true

            # Update grub config
            sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT=".*"/GRUB_CMDLINE_LINUX_DEFAULT="quiet splash"/' /etc/default/grub 2>/dev/null || true
            sed -i 's/#GRUB_GFXMODE/GRUB_GFXMODE/' /etc/default/grub 2>/dev/null || true
            sed -i 's/GRUB_GFXMODE=.*/GRUB_GFXMODE=auto/' /etc/default/grub 2>/dev/null || true

            update-grub 2>/dev/null || true
        fi

        echo "✅ Thème Plymouth installé"
    else
        echo "⚠️  Fichiers thème Plymouth non trouvés, saut..."
    fi
}

setup_services() {
    echo ""
    echo "🔧 Installation des services systemd..."

    # Copy service files
    cp "$INSTALL_DIR/systemd"/*.service /etc/systemd/system/ 2>/dev/null || true

    # Copy scripts
    cp "$INSTALL_DIR/scripts"/*.sh /opt/drone/scripts/ 2>/dev/null || true
    chmod +x /opt/drone/scripts/*.sh

    # Reload systemd
    systemctl daemon-reload

    # Enable services
    systemctl enable mediamtx 2>/dev/null || true
    systemctl enable drone-api 2>/dev/null || true
    systemctl enable drone-wifi-ap 2>/dev/null || true
    systemctl enable drone-ui 2>/dev/null || true

    echo "✅ Services installés et activés"
}

setup_wifi_ap() {
    echo ""
    echo "📡 Configuration du point d'accès WiFi..."

    # Ensure hostapd and dnsmasq are enabled but managed by our script
    systemctl disable hostapd 2>/dev/null || true
    systemctl disable dnsmasq 2>/dev/null || true

    # Create netplan config for ethernet (if needed)
    if [ ! -f /etc/netplan/00-drone-ethernet.yaml ]; then
        cat > /etc/netplan/00-drone-ethernet.yaml <<EOF
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    eth0:
      dhcp4: true
    enp:
      dhcp4: true
EOF
    fi

    # Apply netplan
    netplan apply 2>/dev/null || true

    echo "✅ Configuration réseau créée"
    echo ""
    echo "ℹ️  Le WiFi AP sera démarré automatiquement par le service drone-wifi-ap"
}

setup_autostart() {
    echo ""
    echo "🚀 Configuration du démarrage automatique..."

    # Create autostart directory
    AUTOSTART_DIR="/root/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"

    # Create desktop entry
    cat > "$AUTOSTART_DIR/drone-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=DRONE OPS Kiosk
Exec=/opt/drone/scripts/start-kiosk.sh
X-GNOME-Autostart-enabled=true
Terminal=false
Hidden=false
EOF

    # Create openbox autostart if using openbox
    mkdir -p /root/.config/openbox

    cat > /root/.config/openbox/autostart <<EOF
#!/bin/bash
# DRONE OPS Openbox Autostart

# Disable screen blanking
xset -dpms
xset s off
xset s noblank

# Hide cursor
if command -v unclutter &>/dev/null; then
    unclutter -idle 0.1 -root &
fi

# Start kiosk
/opt/drone/scripts/start-kiosk.sh &
EOF

    chmod +x /root/.config/openbox/autostart

    echo "✅ Autostart configuré"
}

setup_cron() {
    echo ""
    echo "⏰ Configuration du nettoyage automatique..."

    # Add cleanup script to cron
    (crontab -l 2>/dev/null | grep -v cleanup-videos; echo "@reboot /opt/drone/scripts/cleanup-videos.sh") | crontab -
    (crontab -l 2>/dev/null | grep -v "0 4"; echo "0 4 * * * /opt/drone/scripts/cleanup-videos.sh") | crontab -

    echo "✅ Cron configuré"
}

install_app() {
    echo ""
    echo "📦 Installation de l'application..."

    cd "$INSTALL_DIR"

    # Install dependencies and build
    if [ -f "package.json" ]; then
        npm install --production
        npm run build
    fi

    echo "✅ Application installée"
}

create_healthcheck() {
    echo ""
    echo "🔍 Création du script de vérification..."

    cat > "$INSTALL_DIR/scripts/healthcheck.sh" <<'EOF'
#!/bin/bash
#
# Health check script for DRONE OPS Suite
#

echo "=================================="
echo "  DRONE OPS Health Check"
echo "=================================="
echo ""

# Check services
echo "📡 Services Status:"
echo "-------------------"
for service in mediamtx drone-api drone-wifi-ap drone-ui; do
    status=$(systemctl is-active "$service" 2>/dev/null || echo "unknown")
    if [ "$status" = "active" ]; then
        echo "  ✓ $service: running"
    else
        echo "  ✗ $service: $status"
    fi
done

echo ""
echo "🌐 Network:"
echo "------------"
# Check WiFi
wifi_iface=$(cat /var/run/drone/wifi-iface 2>/dev/null || echo "unknown")
echo "  WiFi Interface: $wifi_iface"

# Check IP
if ip addr show "$wifi_iface" 2>/dev/null | grep -q "10.0.0.1"; then
    echo "  WiFi IP: 10.0.0.1 ✓"
else
    echo "  WiFi IP: not configured ✗"
fi

echo ""
echo "🔌 Ports:"
echo "---------"
# Check ports
if ss -tlnp | grep -q ":8080"; then
    echo "  API (8080): listening ✓"
else
    echo "  API (8080): not listening ✗"
fi

if ss -tlnp | grep -q ":1935"; then
    echo "  RTMP (1935): listening ✓"
else
    echo "  RTMP (1935): not listening ✗"
fi

echo ""
echo "💾 Storage:"
echo "-----------"
df -h /var/lib/drone/videos 2>/dev/null | tail -1

echo ""
echo "=================================="
EOF

    chmod +x "$INSTALL_DIR/scripts/healthcheck.sh"

    echo "✅ Health check script créé"
    echo "   Usage: sudo /opt/drone/scripts/healthcheck.sh"
}

print_summary() {
    echo ""
    echo "====================================="
    echo "    ✅ INSTALLATION TERMINÉE"
    echo "====================================="
    echo ""
    echo "Services installés et activés:"
    echo "  • mediamtx       - Serveur RTMP"
    echo "  • drone-api      - API Web"
    echo "  • drone-wifi-ap  - Point d'accès WiFi"
    echo "  • drone-ui       - Interface tactile"
    echo ""
    echo "Configuration:"
    echo "  • WiFi SSID:     DRONE-OPS-001"
    echo "  • WiFi Password: drone2024"
    echo "  • Serveur IP:    10.0.0.1"
    echo "  • API Port:      8080"
    echo "  • RTMP Port:     1935"
    echo ""
    echo "Prochaines étapes:"
    echo "  1. Modifier /etc/drone/users.json avec vos pilotes"
    echo "  2. Redémarrer le système: sudo reboot"
    echo ""
    echo "Après le redémarrage:"
    echo "  • Écran tactile: Sélection pilote automatique"
    echo "  • Plymouth: Animation droneOps au démarrage"
    echo "  • WiFi: DRONE-OPS-001 disponible immédiatement"
    echo ""
    echo "Commandes utiles:"
    echo "  sudo /opt/drone/scripts/healthcheck.sh"
    echo "  sudo systemctl status drone-wifi-ap"
    echo "  sudo journalctl -u drone-api -f"
    echo ""
}

main() {
    check_root

    echo "Ce script va installer DRONE OPS Suite sur votre système."
    echo ""
    read -p "Continuer ? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Annulé."
        exit 0
    fi

    # Install components
    install_dependencies
    install_nodejs
    install_mediamtx
    setup_directories

    # Update from git if available
    if [ -d "$INSTALL_DIR/.git" ]; then
        cd "$INSTALL_DIR"
        git pull 2>/dev/null || true
    fi

    setup_config
    setup_plymouth_theme
    setup_services
    setup_wifi_ap
    setup_autostart
    setup_cron
    install_app
    create_healthcheck

    print_summary
}

main "$@"
