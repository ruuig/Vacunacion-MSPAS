#!/usr/bin/env bash
# Respaldo diario de la base (RNF-05): pg_dump comprimido, 30 días de retención y copia fuera del VPS.
# Cron (23:00 hora de Guatemala):
#   0 23 * * * /opt/vacunacion/backend/scripts/respaldo.sh >> /var/log/vacunacion-respaldo.log 2>&1
# Restaurar (probar una vez y documentarlo):
#   createdb vacunacion_prueba && pg_restore -d vacunacion_prueba /var/backups/vacunacion/vacunacion-AAAA-MM-DD.dump
set -euo pipefail

DIR="${RESPALDO_DIR:-/var/backups/vacunacion}"
DB_URL="${DATABASE_URL:?Defina DATABASE_URL}"
DESTINO_REMOTO="${RESPALDO_REMOTO:-}"   # ej. "gdrive:respaldos-vacunacion" (rclone) o vacío para omitir
ARCHIVO="$DIR/vacunacion-$(date +%F).dump"

mkdir -p "$DIR"
pg_dump --format=custom --no-owner "$DB_URL" > "$ARCHIVO.tmp"
mv "$ARCHIVO.tmp" "$ARCHIVO"
pg_restore --list "$ARCHIVO" > /dev/null   # verifica que el archivo se puede leer
echo "$(date '+%F %T') respaldo OK: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

find "$DIR" -name 'vacunacion-*.dump' -mtime +30 -delete

if [ -n "$DESTINO_REMOTO" ]; then
  rclone copy "$ARCHIVO" "$DESTINO_REMOTO" && echo "copia remota OK: $DESTINO_REMOTO"
fi
