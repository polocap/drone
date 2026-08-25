#!/bin/bash
#
# Alternative DHCP client for DRONE OPS
# Works without dhclient using NetworkManager or manual config
#

set -e

echo "=============================================="
echo "  Network Configuration (Alternative)"
echo "=============================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Must run as root"
    exit 1
fi

# Detect ethernet interface
detect_ethernet() {
    echo "🔍 Detecting ethernet interface..."

    for iface in enp1s0 enp2s0 enp3s0 enp0s3 enp0s31f6 eth0 eth1; do
        if ip link show "$iface" &>/dev/null; then
            ETHERNET_IFACE="$iface"
            echo "✓ Found: $iface"
            return 0
        fi
    done

    # Fallback - find any ethernet
    ETHERNET_IFACE=$(ip -br link show 2>/dev/null | grep -E "^(en|eth)" | awk '{print $1}' | head -1)

    if [ -n "$ETHERNET_IFACE" ]; then
        echo "✓ Found: $ETHERNET_IFACE"
        return 0
    fi

    echo "❌ No ethernet interface found"
    echo "Available interfaces:"
    ip link show
    exit 1
}

# Method 1: NetworkManager (preferred)
use_networkmanager() {
    echo ""
    echo "📡 Method 1: Using NetworkManager..."

    if ! command -v nmcli &>/dev/null; then
        echo "⚠️  NetworkManager not available"
        return 1
    fi

    # Check if device is managed
    nmcli dev status | grep "$ETHERNET_IFACE" | grep -q "connected\|disconnected"
    if [ $? -eq 0 ]; then
        # Disconnect and reconnect to trigger DHCP
        nmcli dev disconnect "$ETHERNET_IFACE" 2>/dev/null || true
        sleep 2
        nmcli dev connect "$ETHERNET_IFACE" 2>/dev/null || true

        sleep 3

        # Check if we got an IP
        NEW_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if [ -n "$NEW_IP" ]; then
            echo "✓ IP obtained via NetworkManager: $NEW_IP"
            return 0
        fi
    fi

    return 1
}

# Method 2: Manual DHCP using systemd-networkd
use_systemd_networkd() {
    echo ""
    echo "📡 Method 2: Using systemd-networkd..."

    # Create networkd config
    mkdir -p /etc/systemd/network

    cat > "/etc/systemd/network/10-${ETHERNET_IFACE}.network" <<EOF
[Match]
Name=$ETHERNET_IFACE

[Network]
DHCP=yes

[DHCP]
RouteMetric=100
EOF

    # Enable and start systemd-networkd
    systemctl enable systemd-networkd 2>/dev/null || true
    systemctl restart systemd-networkd 2>/dev/null || true

    # Also ensure the interface is up
    ip link set "$ETHERNET_IFACE" up 2>/dev/null || true

    sleep 3

    # Check for IP
    NEW_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    if [ -n "$NEW_IP" ]; then
        echo "✓ IP obtained via systemd-networkd: $NEW_IP"
        return 0
    fi

    return 1
}

# Method 3: Manual IP configuration
use_manual_config() {
    echo ""
    echo "📡 Method 3: Manual static IP configuration..."

    # Bring interface up
    ip link set "$ETHERNET_IFACE" up 2>/dev/null || true

    echo ""
    echo "⚠️  Could not get DHCP IP automatically"
    echo ""
    echo "Choose an option:"
    echo "  1. Try to find existing DHCP lease"
    echo "  2. Configure static IP manually"
    echo "  3. Debug mode - show all info"
    echo ""

    read -p "Choice [1-3]: " choice

    case $choice in
        1)
            try_existing_lease
            ;;
        2)
            configure_static_ip
            ;;
        3)
            debug_mode
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

# Try to use existing lease
try_existing_lease() {
    echo ""
    echo "🔍 Checking for existing DHCP leases..."

    # Check common lease file locations
    for lease_file in /var/lib/dhcp/dhclient.*.leases /var/lib/dhclient/*.leases /var/lib/NetworkManager/*.lease; do
        if [ -f "$lease_file" ]; then
            echo "Found lease file: $lease_file"
            grep -A 5 "fixed-address" "$lease_file" 2>/dev/null | head -10
        fi
    done

    # Try udhcpc as last resort
    if command -v udhcpc &>/dev/null; then
        echo ""
        echo "Trying udhcpc..."
        udhcpc -i "$ETHERNET_IFACE" -t 3 -T 3 -n &>/dev/null || true
        sleep 2

        NEW_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        if [ -n "$NEW_IP" ]; then
            echo "✓ IP obtained via udhcpc: $NEW_IP"
            return 0
        fi
    fi

    echo "❌ No existing lease found"
    return 1
}

# Configure static IP manually
configure_static_ip() {
    echo ""
    echo "📝 Manual static IP configuration"
    echo ""
    echo "Enter network details (you can find these from your router):"
    echo ""

    read -p "IP Address (e.g., 192.168.1.100): " static_ip
    read -p "Subnet prefix (e.g., 24 for /24): " prefix
    read -p "Gateway (e.g., 192.168.1.1): " gateway
    read -p "DNS (e.g., 192.168.1.1 or 8.8.8.8): " dns

    # Validate inputs
    if [ -z "$static_ip" ] || [ -z "$prefix" ]; then
        echo "❌ IP and prefix are required"
        exit 1
    fi

    # Configure interface
    ip addr flush dev "$ETHERNET_IFACE" 2>/dev/null || true
    ip addr add "${static_ip}/${prefix}" dev "$ETHERNET_IFACE"

    if [ -n "$gateway" ]; then
        ip route add default via "$gateway" dev "$ETHERNET_IFACE" 2>/dev/null || true
    fi

    # Configure DNS
    if [ -n "$dns" ]; then
        echo "nameserver $dns" > /etc/resolv.conf
    fi

    echo ""
    echo "✓ Static IP configured: ${static_ip}/${prefix}"
    echo ""

    # Save config for persistence
    save_static_config "$static_ip" "$prefix" "$gateway" "$dns"
}

# Save static config to netplan for persistence
save_static_config() {
    local ip=$1
    local prefix=$2
    local gateway=$3
    local dns=$4

    echo "💾 Saving configuration..."

    mkdir -p /etc/netplan

    cat > /etc/netplan/00-admin-ethernet.yaml <<EOF
# Admin Ethernet - Static IP
network:
  version: 2
  ethernets:
    $ETHERNET_IFACE:
      dhcp4: no
      dhcp6: no
      addresses:
        - ${ip}/${prefix}
      routes:
        - to: default
          via: ${gateway}
      nameservers:
        addresses:
          - ${dns}
EOF

    chmod 600 /etc/netplan/*.yaml

    echo "✓ Configuration saved to /etc/netplan/00-admin-ethernet.yaml"
    echo ""
}

# Debug mode
debug_mode() {
    echo ""
    echo "🔧 DEBUG INFORMATION"
    echo "===================="
    echo ""

    echo "All network interfaces:"
    ip addr show

    echo ""
    echo "Network devices:"
    ls -la /sys/class/net/

    echo ""
    echo "DHCP clients available:"
    which dhclient 2>/dev/null && echo "  - dhclient: $(which dhclient)"
    which dhcpcd 2>/dev/null && echo "  - dhcpcd: $(which dhcpcd)"
    which udhcpc 2>/dev/null && echo "  - udhcpc: $(which udhcpc)"
    which nmcli 2>/dev/null && echo "  - nmcli: $(which nmcli)"

    echo ""
    echo "DHCP lease files:"
    find /var/lib -name "*lease*" -o -name "*dhcp*" 2>/dev/null | head -10

    echo ""
    echo "NetworkManager status:"
    nmcli dev status 2>/dev/null || echo "  NetworkManager not running"

    echo ""
    echo "systemd-networkd status:"
    systemctl status systemd-networkd 2>/dev/null || echo "  systemd-networkd not running"
}

# Main execution
main() {
    detect_ethernet

    # Try methods in order
    if use_networkmanager; then
        echo ""
        echo "✅ Network configured via NetworkManager"
        show_final_status
        exit 0
    fi

    if use_systemd_networkd; then
        echo ""
        echo "✅ Network configured via systemd-networkd"
        show_final_status
        exit 0
    fi

    # Fallback to manual
    use_manual_config
}

show_final_status() {
    echo ""
    echo "=============================================="
    echo "  Network Configuration Complete"
    echo "=============================================="
    echo ""
    echo "Interface: $ETHERNET_IFACE"
    ip -br addr show "$ETHERNET_IFACE" 2>/dev/null || ip addr show "$ETHERNET_IFACE"
    echo ""
    echo "To SSH into this server:"
    NEW_IP=$(ip -br addr show "$ETHERNET_IFACE" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo "  ssh drone@$NEW_IP"
    echo ""
}

main "$@"
