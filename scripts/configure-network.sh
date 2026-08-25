#!/bin/bash
#
# Network Configuration for DRONE OPS
# Configures both Ethernet (admin) and WiFi (AP) interfaces
#

set -e

echo "=============================================="
echo "  DRONE OPS Network Configuration"
echo "=============================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run as root"
    exit 1
fi

# Detect interfaces
detect_interfaces() {
    echo "🔍 Detecting network interfaces..."
    echo ""

    # Find ethernet interface (for admin SSH access)
    ETHERNET_IFACE=""
    for iface in enp1s0 enp2s0 enp3s0 enp0s3 enp0s31f6 eth0 eth1; do
        if ip link show "$iface" &>/dev/null; then
            ETHERNET_IFACE="$iface"
            echo "✓ Ethernet interface found: $iface"
            break
        fi
    done

    if [ -z "$ETHERNET_IFACE" ]; then
        # Try to find any ethernet interface
        ETHERNET_IFACE=$(ip -br link show | grep -E "^(en|eth)" | awk '{print $1}' | head -1)
        if [ -n "$ETHERNET_IFACE" ]; then
            echo "✓ Ethernet interface found: $ETHERNET_IFACE"
        else
            echo "⚠ No ethernet interface found"
        fi
    fi

    # Find WiFi interface (for Access Point)
    WIFI_IFACE=""
    for iface in wlp2s0 wlo1 wlan0 wlp1s0 wlp0s20f3; do
        if ip link show "$iface" &>/dev/null; then
            WIFI_IFACE="$iface"
            echo "✓ WiFi interface found: $iface"
            break
        fi
    done

    if [ -z "$WIFI_IFACE" ]; then
        # Try to find any WiFi interface
        WIFI_IFACE=$(iw dev 2>/dev/null | grep -E "^\\s+Interface" | awk '{print $2}' | head -1)
        if [ -n "$WIFI_IFACE" ]; then
            echo "✓ WiFi interface found: $WIFI_IFACE"
        else
            echo "⚠ No WiFi interface found"
        fi
    fi

    echo ""
}

# Create netplan configuration
configure_netplan() {
    echo "⚙️ Creating netplan configuration..."
    echo ""

    mkdir -p /etc/netplan

    # Backup existing configs
    if [ -d /etc/netplan ]; then
        cp -r /etc/netplan /etc/netplan.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
    fi

    # Configuration for Ethernet (DHCP - for admin SSH access)
    if [ -n "$ETHERNET_IFACE" ]; then
        cat > /etc/netplan/00-admin-ethernet.yaml <<EOF
# Admin Ethernet - SSH access for administrator
network:
  version: 2
  ethernets:
    $ETHERNET_IFACE:
      dhcp4: true
      dhcp6: false
      optional: true
EOF
        echo "✓ Ethernet config: /etc/netplan/00-admin-ethernet.yaml"
        echo "  Interface: $ETHERNET_IFACE"
        echo "  Mode: DHCP (automatic IP from your router)"
    fi

    # Configuration for WiFi (managed by NetworkManager for AP mode)
    if [ -n "$WIFI_IFACE" ]; then
        cat > /etc/netplan/01-wifi-ap.yaml <<EOF
# WiFi Access Point - Managed by NetworkManager
network:
  version: 2
  renderer: NetworkManager
  wifis:
    $WIFI_IFACE:
      dhcp4: false
      dhcp6: false
      optional: true
      addresses:
        - 10.0.0.1/24
      access-points:
        "DRONE-OPS-001":
          mode: ap
          password: "drone2024"
EOF
        echo "✓ WiFi config: /etc/netplan/01-wifi-ap.yaml"
        echo "  Interface: $WIFI_IFACE"
        echo "  IP: 10.0.0.1"
        echo "  SSID: DRONE-OPS-001"
    fi

    # Remove old conflicting configs
    rm -f /etc/netplan/00-drone-ap.yaml 2>/dev/null || true
    rm -f /etc/netplan/99-drone-wifi.yaml 2>/dev/null || true

    echo ""
}

# Apply configuration
apply_netplan() {
    echo "🔄 Applying network configuration..."
    echo ""

    netplan generate 2>/dev/null || true
    netplan apply 2>/dev/null || true

    sleep 2
    echo "✓ Netplan applied"
    echo ""
}

# Configure NetworkManager for AP mode
configure_networkmanager() {
    echo "⚙️ Configuring NetworkManager..."
    echo ""

    if [ -z "$WIFI_IFACE" ]; then
        echo "⚠ No WiFi interface, skipping NetworkManager config"
        return
    fi

    # Ensure NetworkManager manages the WiFi interface
    if [ -f /etc/NetworkManager/NetworkManager.conf ]; then
        # Backup
        cp /etc/NetworkManager/NetworkManager.conf /etc/NetworkManager/NetworkManager.conf.backup 2>/dev/null || true

        # Configure to manage all devices
        cat > /etc/NetworkManager/NetworkManager.conf <<EOF
[main]
plugins=ifupdown,keyfile
dhcp=internal

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
EOF
    fi

    # Reload NetworkManager
    systemctl reload NetworkManager 2>/dev/null || true

    echo "✓ NetworkManager configured"
    echo ""
}

# Create startup script to ensure interfaces are up
create_startup_script() {
    echo "📝 Creating network startup script..."
    echo ""

    cat > /opt/drone/scripts/ensure-network.sh <<EOF
#!/bin/bash
# Ensure network interfaces are up at boot

# Bring up ethernet interface
if [ -n "$ETHERNET_IFACE" ] && ip link show "$ETHERNET_IFACE" &>/dev/null; then
    ip link set "$ETHERNET_IFACE" up 2>/dev/null || true
fi

# Bring up WiFi interface
if [ -n "$WIFI_IFACE" ] && ip link show "$WIFI_IFACE" &>/dev/null; then
    ip link set "$WIFI_IFACE" up 2>/dev/null || true
fi

# Restart SSH to ensure it's listening on all interfaces
systemctl is-active --quiet ssh && systemctl restart ssh 2>/dev/null || true

exit 0
EOF

    chmod +x /opt/drone/scripts/ensure-network.sh

    # Add to systemd
    cat > /etc/systemd/system/drone-network-fix.service <<EOF
[Unit]
Description=DRONE OPS Network Fix
After=network.target NetworkManager.service
Before=drone-api.service ssh.service

[Service]
Type=oneshot
ExecStart=/opt/drone/scripts/ensure-network.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable drone-network-fix 2>/dev/null || true

    echo "✓ Startup script created"
    echo ""
}

# Display current status
show_status() {
    echo "=============================================="
    echo "  Current Network Status"
    echo "=============================================="
    echo ""

    echo "Interfaces:"
    echo "-----------"
    ip -br addr show 2>/dev/null | grep -v "lo" || ip addr show

    echo ""
    echo "Routes:"
    echo "-------"
    ip route | grep default || echo "No default route"

    echo ""
    echo "SSH Service:"
    echo "------------"
    systemctl is-active ssh 2>/dev/null && echo "Status: ✓ Running" || echo "Status: ✗ Not running"
    systemctl is-enabled ssh 2>/dev/null && echo "Auto-start: ✓ Enabled" || echo "Auto-start: ✗ Disabled"

    echo ""
    echo "=============================================="
    echo ""
    echo "To connect via SSH:"

    if [ -n "$ETHERNET_IFACE" ]; then
        ETHERNET_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if [ -n "$ETHERNET_IP" ]; then
            echo "  Ethernet: ssh drone@$ETHERNET_IP"
        else
            echo "  Ethernet: Waiting for DHCP..."
            echo "            Check with: ip addr show $ETHERNET_IFACE"
        fi
    fi

    if [ -n "$WIFI_IFACE" ]; then
        echo "  WiFi AP:  Devices connect to 'DRONE-OPS-001'"
        echo "            Then: ssh drone@10.0.0.1"
    fi

    echo ""
}

# Main
main() {
    detect_interfaces
    configure_netplan
    apply_netplan
    configure_networkmanager
    create_startup_script
    show_status

    echo "=============================================="
    echo "  ✅ Network Configuration Complete"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "  1. Connect your Mac to the same network as the Beelink"
    echo "  2. Find the Beelink's IP: ip addr show $ETHERNET_IFACE"
    echo "  3. SSH: ssh drone@<ethernet-ip>"
    echo ""
    echo "If ethernet still doesn't work:"
    echo "  - Check cable connection"
    echo "  - Verify router/DHCP is working"
    echo "  - Try: sudo dhclient $ETHERNET_IFACE -v"
    echo ""
}

main "$@"
