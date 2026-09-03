#!/bin/bash
#
# Quick network diagnostic for DRONE OPS
# Run this on the Beelink server
#

echo "=============================================="
echo "  DRONE OPS Network Diagnostic"
echo "=============================================="
echo ""

# Show all interfaces
echo "📡 Network Interfaces:"
echo "----------------------"
ip -br addr show 2>/dev/null || ip addr show | grep -E "^[0-9]+:"

echo ""
echo "🌐 IP Addresses:"
echo "----------------"
for iface in $(ls /sys/class/net/ | grep -v "lo"); do
    ip_addr=$(ip -br addr show "$iface" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+' | head -1)
    if [ -n "$ip_addr" ]; then
        echo "  $iface: $ip_addr"
    else
        state=$(ip -br link show "$iface" 2>/dev/null | awk '{print $2}')
        echo "  $iface: $state (no IP)"
    fi
done

echo ""
echo "📶 WiFi Status:"
echo "---------------"
if command -v iw &>/dev/null; then
    WIFI_IFACE=$(iw dev 2>/dev/null | grep -E "^\\s+Interface" | awk '{print $2}' | head -1)
    if [ -n "$WIFI_IFACE" ]; then
        echo "  Interface: $WIFI_IFACE"
        iw dev "$WIFI_IFACE" link 2>/dev/null | grep -E "SSID|signal|tx" || echo "  Status: Not connected (should be AP mode)"
    else
        echo "  No WiFi interface found"
    fi
else
    echo "  'iw' not installed"
fi

echo ""
echo "🔗 Default Route:"
echo "-----------------"
ip route | grep default || echo "  No default route"

echo ""
echo "🛰️  Routeur 4G (Cudy IR02):"
echo "---------------------------"
GW=$(ip route | awk '/^default/ {print $3; exit}')
if [ -n "$GW" ]; then
    echo "  Passerelle: $GW"
    if ping -c1 -W1 "$GW" &>/dev/null; then
        echo "  Routeur:    ✓ joignable"
    else
        echo "  Routeur:    ✗ injoignable (câble Ethernet ? routeur allumé ?)"
    fi
    if ping -c1 -W2 1.1.1.1 &>/dev/null; then
        echo "  Internet:   ✓ OK (4G active)"
    else
        echo "  Internet:   ✗ pas d'accès Internet (SIM/data 4G ?)"
    fi
else
    echo "  Pas de passerelle — le Beelink n'est pas raccordé au routeur"
fi

echo ""
echo "📶 WiFi écrans (routeur):"
echo "-------------------------"
echo "  SSID attendu: corelink-screen"
echo "  Les écrans/tablettes s'y connectent puis ouvrent http://$(ip -br addr show 2>/dev/null | grep -v 'lo\|wlp' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1):8080"

echo ""
echo "🔌 SSH Service:"
echo "---------------"
if systemctl is-active ssh &>/dev/null; then
    echo "  Status: ✓ Running"
else
    echo "  Status: ✗ Not running"
    echo "  Start: sudo systemctl start ssh"
fi

if systemctl is-enabled ssh &>/dev/null; then
    echo "  Auto-start: ✓ Enabled"
else
    echo "  Auto-start: ✗ Disabled"
    echo "  Enable: sudo systemctl enable ssh"
fi

echo ""
echo "📋 Listening Ports:"
echo "-------------------"
ss -tlnp 2>/dev/null | grep -E "(22|8080|1935)" || netstat -tlnp 2>/dev/null | grep -E "(22|8080|1935)" || echo "  Install ss or netstat to see ports"

echo ""
echo "=============================================="
echo ""
echo "📝 For admin SSH access:"
echo "   Look for an IP starting with 192.168. or 10."
echo "   (NOT 10.0.0.1 - that's for WiFi clients)"
echo ""
echo "   Example: ssh drone@192.168.1.100"
echo ""
