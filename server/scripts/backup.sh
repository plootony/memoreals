#!/bin/bash
# SQLite online backup — безопасно во время работы приложения
# Запускать: cron, systemd timer, или вручную

DB=/root/memoreals/server/data/db.sqlite
BACKUP_DIR=/root/memoreals/server/data/backups
DATE=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"

# Online backup через sqlite3 CLI (WAL-safe, не блокирует сервер)
sqlite3 "$DB" ".backup '$BACKUP_DIR/db_$DATE.sqlite'"

# Оставляем только последние 30 бэкапов
ls -t "$BACKUP_DIR"/db_*.sqlite | tail -n +31 | xargs rm -f 2>/dev/null

echo "Backup done: $BACKUP_DIR/db_$DATE.sqlite"
