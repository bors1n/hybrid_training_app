#!/usr/bin/env bash
# Ночная копия базы SQLite. `.backup` даёт целый файл, даже если в базу в этот момент пишут.
set -euo pipefail

DB="${DATABASE_FILE:-/var/lib/hybridlog/hybridlog.db}"
DIR="${BACKUP_DIR:-/var/backups/hybridlog}"
KEEP_DAYS="${KEEP_DAYS:-14}"

umask 077
mkdir -p "$DIR"
out="$DIR/hybridlog-$(date +%F).db"
rm -f "$out" "$out.gz"
sqlite3 "$DB" ".backup '$out'"
gzip -f "$out"
find "$DIR" -name 'hybridlog-*.db.gz' -mtime "+$KEEP_DAYS" -delete

# Копия вне сервера: без неё потеря VPS уносит и бэкапы.
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
  rsync -az "$DIR/" "$BACKUP_REMOTE"
fi
echo "Копия: $out.gz"
