#!/bin/bash
# Supprimer les vidéos de plus de 7 jours (mp4 MediaMTX + ancien format flv)
VIDEOS_DIR=/var/lib/drone/videos
find "$VIDEOS_DIR" \( -name '*.mp4' -o -name '*.flv' \) -type f -mtime +7 -delete
# Vider les dossiers de session vides — mais jamais le dossier racine
find "$VIDEOS_DIR" -mindepth 1 -type d -empty -delete
mkdir -p "$VIDEOS_DIR"
