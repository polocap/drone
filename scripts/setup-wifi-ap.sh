#!/bin/bash

# Désactiver wpa_supplicant
systemctl stop wpa_supplicant 2>/dev/null
pkill wpa_supplicant 2>/dev/null

# Configurer l'interface
ip link set wlp2s0 up
ip addr flush dev wlp2s0
ip addr add 10.0.0.1/24 dev wlp2s0

# Démarrer hostapd manuellement si service pas dispo
if [ -f /etc/hostapd/hostapd.conf ]; then
    /usr/sbin/hostapd /etc/hostapd/hostapd.conf -B
fi

# Démarrer dnsmasq
if [ -f /etc/dnsmasq.conf ]; then
    dnsmasq
fi

echo "WiFi AP démarré: SSID=DRONE-OPS-001, IP=10.0.0.1"
