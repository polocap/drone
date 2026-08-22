#!/bin/bash

set -e

echo "====================================="
echo "    DRONE OPS SUITE INSTALLER"
echo "====================================="
echo ""

NODE_MAJOR=20
DISTRO=$(lsb_release -s -c 2>/dev/null || cat /etc/os-release | grep -oP '(?<=VERSION_CODENAME=).*' || echo "jammy")

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
        unclutter \
        upower \
        acpi \
        network-manager
    
    echo "✅ Dépendances système installées"
}

install_nodejs() {
    echo ""
    echo "📦 Installation de Node.js $NODE_MAJOR..."
    
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
    rm mediamtx.tar.gz
    
    echo "✅ MediaMTX installé"
}

setup_directories() {
    echo ""
    echo "📁 Création des répertoires..."
    
    mkdir -p /opt/drone
    mkdir -p /var/lib/drone/videos
    mkdir -p /etc/drone
    mkdir -p /var/log/drone
    
    echo "✅ Répertoires créés"
}

setup_config() {
    echo ""
    echo "⚙️  Configuration..."
    
    if [ ! -f /etc/drone/users.json ]; then
        cp /opt/drone/config/users.json.example /etc/drone/users.json
        echo "   - users.json créé"
    fi
    
    if [ ! -f /etc/drone/servers.json ]; then
        cp /opt/drone/config/servers.json.example /etc/drone/servers.json
        echo "   - servers.json créé"
    fi
    
    cp /opt/drone/config/mediamtx.yml /etc/drone/mediamtx.yml
    echo "   - mediamtx.yml configuré"
    
    echo "✅ Configuration copiée"
}

setup_services() {
    echo ""
    echo "🔧 Installation des services systemd..."
    
    cp /opt/drone/systemd/*.service /etc/systemd/system/
    
    systemctl daemon-reload
    
    systemctl enable mediamtx
    systemctl enable drone-api
    
    echo "✅ Services installés"
}

setup_wifi_ap() {
    echo ""
    echo "📡 Configuration du point d'accès WiFi..."
    
    NETPLAN_CONFIG="/etc/netplan/99-drone-wifi.yaml"
    
    cat > "$NETPLAN_CONFIG" <<EOF
network:
  version: 2
  renderer: NetworkManager
  wifis:
    wlo1:
      dhcp4: false
      addresses:
        - 10.0.0.1/24
      access-points:
        "DRONE-OPS-001":
          mode: ap
          password: "drone2024"
EOF
    
    NETPLAN_CONFIG="/etc/netplan/00-drone-ap.yaml"
    
    cat > "$NETPLAN_CONFIG" <<EOF
network:
  version: 2
  renderer: NetworkManager
  ethernets:
    eth0:
      dhcp4: true
EOF
    
    echo "✅ Configuration WiFi créée (à activer manuellement)"
}

setup_autostart() {
    echo ""
    echo "🚀 Configuration du démarrage automatique..."
    
    AUTOSTART_DIR="/root/.config/autostart"
    mkdir -p "$AUTOSTART_DIR"
    
    cat > "$AUTOSTART_DIR/drone-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=DRONE OPS Kiosk
Exec=/opt/drone/scripts/start-kiosk.sh
X-GNOME-Autostart-enabled=true
Terminal=false
EOF
    
    mkdir -p /root/.config/openbox
    
    cat > /root/.config/openbox/autostart <<EOF
#!/bin/bash
xset -dpms
xset s off
unclutter -idle 0.1 -root &
/opt/drone/scripts/start-kiosk.sh &
EOF
    
    chmod +x /root/.config/openbox/autostart
    
    echo "✅ Autostart configuré"
}

setup_cron() {
    echo ""
    echo "⏰ Configuration du nettoyage automatique..."
    
    (crontab -l 2>/dev/null; echo "@reboot /opt/drone/scripts/cleanup-videos.sh") | crontab -
    (crontab -l 2>/dev/null; echo "0 4 * * * /opt/drone/scripts/cleanup-videos.sh") | crontab -
    
    echo "✅ Cron configuré"
}

install_app() {
    echo ""
    echo "📦 Installation de l'application..."
    
    cd /opt/drone
    
    if [ -f "package.json" ]; then
        npm install --production
        npm run build
    fi
    
    echo "✅ Application installée"
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
    
    install_dependencies
    install_nodejs
    install_mediamtx
    setup_directories
    
    if [ -d "/opt/drone/.git" ]; then
        cd /opt/drone
        git pull
    fi
    
    setup_config
    setup_wifi_ap
    setup_services
    setup_autostart
    setup_cron
    install_app
    
    echo ""
    echo "====================================="
    echo "    ✅ INSTALLATION TERMINÉE"
    echo "====================================="
    echo ""
    echo "Prochaines étapes:"
    echo "1. Modifier /etc/drone/users.json avec vos pilotes"
    echo "2. Configurer le WiFi AP: nmcli d wifi hotspot ifname wlo1 ssid DRONE-OPS-001 password drone2024"
    echo "3. Redémarrer: systemctl reboot"
    echo ""
    echo "Services disponibles:"
    echo "  - API: http://localhost:8080"
    echo "  - RTMP: rtmp://localhost:1935/live/streampath"
    echo ""
}

main "$@"
