#!/bin/bash
# Supprimer les vidéos de plus de 7 jours
find /var/lib/drone/videos -name '*.flv' -mtime +7 -delete
find /var/lib/drone/videos -type d -empty -delete
