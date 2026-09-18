#!/usr/bin/env bash
# Bazadan zaxira nusxa olish (pg_dump, siqilgan holda).
#
#   ./scripts/backup-db.sh                 -> backups/xatlov-YYYYmmdd-HHMM.sql.gz
#   ./scripts/backup-db.sh /mnt/backup     -> boshqa katalogga
#
# Tiklash:
#   gunzip -c backups/xatlov-...sql.gz | docker compose exec -T db psql -U xatlov -d xatlov
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
OUT_DIR="${1:-backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"

# shellcheck disable=SC1091
[ -f .env ] && { set -a; . ./.env; set +a; }
DB_USER="${POSTGRES_USER:-xatlov}"
DB_NAME="${POSTGRES_DB:-xatlov}"

mkdir -p "$OUT_DIR"
FILE="$OUT_DIR/xatlov-$(date +%Y%m%d-%H%M).sql.gz"

$COMPOSE exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$FILE"

echo "Zaxira: $FILE ($(du -h "$FILE" | cut -f1))"

# Eski nusxalarni tozalash
find "$OUT_DIR" -name 'xatlov-*.sql.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
