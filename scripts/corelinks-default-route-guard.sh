#!/bin/bash
# Garde-fou réseau : toute route par défaut autre que celle du routeur 4G
# (192.168.10.1) est supprimée. Une route fantôme 192.168.100.2 réapparaît
# sur cette machine et détournait le trafic (dont le push RTMP 4G).
GUARD_GW="192.168.10.1"
IFACE="enp1s0"

while true; do
    for gw in $(ip -4 route show default 2>/dev/null | awk "{print \$3}" | sort -u); do
        if [ "$gw" != "$GUARD_GW" ]; then
            ip route del default via "$gw" dev "$IFACE" 2>/dev/null && \
                logger -t corelinks-route-guard "route par défaut parasite supprimée: $gw"
        fi
    done
    sleep 30
done
