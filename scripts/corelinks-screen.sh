#!/bin/bash
# coreLinks — affiche le logo sur le framebuffer (remplace plymouth, cassé
# sur cette Ubuntu). Mode "boot" : attend /dev/fb0 jusqu'à 25s puis affiche.
# Mode "shutdown" : affiche immédiatement. Arrêté automatiquement quand
# l'interface graphique prend la main (Conflicts=graphical.target).

LOGO="/usr/share/plymouth/themes/drone-ops/corelinks-screen.png"
MODE="${1:-shutdown}"

# attendre le framebuffer (boot seulement)
max_wait=0
[ "$MODE" = "boot" ] && max_wait=25
for _ in $(seq 0 "$max_wait"); do
    [ -e /dev/fb0 ] && break
    sleep 1
done
[ -e /dev/fb0 ] || exit 0

# résolution du framebuffer (sinon 1080p par défaut)
W=$(awk -F, '{print $1}' /sys/class/graphics/fb0/virtual_size 2>/dev/null)
H=$(awk -F, '{print $2}' /sys/class/graphics/fb0/virtual_size 2>/dev/null)
[ -n "$W" ] && [ -n "$H" ] || { W=1920; H=1080; }

# masquer le texte console derrière l'image
setterm -clear all >/dev/tty1 2>/dev/null || true

# peindre en boucle jusqu'à ce que systemd arrête l'unité
exec ffmpeg -loglevel error -loop 1 -i "$LOGO" -vf "scale=${W}:${H},format=bgra" -f fbdev /dev/fb0
