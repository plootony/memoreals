#!/bin/bash
set -e

DB=/root/memoreals/server/data/db.sqlite
BACKUP_DIR=/root/memoreals/server/data/backups
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"

# 1. Local backup (WAL-safe, не блокирует сервер)
sqlite3 "$DB" ".backup '$BACKUP_DIR/db_$DATE.sqlite'"
echo "Local backup: $BACKUP_DIR/db_$DATE.sqlite"

# 2. R2 backup
cd /root/memoreals
node server/scripts/backup-to-r2.js

# 3. Оставляем только последние 30 локальных бэкапов
ls -t "$BACKUP_DIR"/db_*.sqlite | tail -n +31 | xargs rm -f 2>/dev/null || true
