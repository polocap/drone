#!/bin/bash

VIDEOS_DIR="${VIDEOS_DIR:-/var/lib/drone/videos}"
DAYS_TO_KEEP="${DAYS_TO_KEEP:-7}"

echo "🧹 Nettoyage des vidéos de plus de $DAYS_TO_KEEP jours..."

if [ ! -d "$VIDEOS_DIR" ]; then
    echo "⚠️  Dossier vidéos non trouvé: $VIDEOS_DIR"
    exit 0
fi

CUTOFF_DATE=$(date -d "$DAYS_TO_KEEP days ago" +%Y-%m-%d)
echo "Date limite: $CUTOFF_DATE"

DELETED_COUNT=0
FREED_SPACE=0

for dir in "$VIDEOS_DIR"/*/; do
    if [ -d "$dir" ]; then
        DIRNAME=$(basename "$dir")
        
        FILES_COUNT=$((FILES_COUNT + $(find "$dir" -type f \( -name "*.flv" -o -name "*.mp4" \) | wc -l)))
        
        if [[ "$DIRNAME" < "$CUTOFF_DATE" ]] || [[ "$DIRNAME" == "$CUTOFF_DATE" ]]; then
            DIR_SIZE=$(du -sb "$dir" | cut -f1)
            SIZE_MB=$((DIR_SIZE / 1024 / 1024))
            
            echo "🗑️  Suppression: $DIRNAME ($SIZE_MB MB)"
            rm -rf "$dir"
            
            DELETED_COUNT=$((DELETED_COUNT + 1))
            FREED_SPACE=$((FREED_SPACE + SIZE_MB))
        fi
    fi
done

if [ $DELETED_COUNT -eq 0 ]; then
    echo "✅ Aucune vidéo à supprimer"
else
    echo "✅ $DELETED_COUNT jour(s) supprimé(s) - $FREED_SPACE MB libérés"
fi

TOTAL_SIZE=$(du -sh "$VIDEOS_DIR" 2>/dev/null | cut -f1)
TOTAL_FILES=$(find "$VIDEOS_DIR" -type f \( -name "*.flv" -o -name "*.mp4" \) | wc -l)

echo "📊 Espace total: $TOTAL_SIZE | Fichiers: $TOTAL_FILES"
