#!/usr/bin/env bash
# Serverda deploy qilish / yangilash skripti.
#
#   ./scripts/deploy.sh            — git pull + build + ishga tushirish + migratsiya
#   ./scripts/deploy.sh --no-pull  — kodni tortmasdan, joriy holatdan build qiladi
#
# Idempotent: xohlagancha qayta ishga tushirish mumkin.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
PULL=1
[ "${1:-}" = "--no-pull" ] && PULL=0

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }

if [ ! -f .env ]; then
  echo "XATO: .env fayli topilmadi."
  echo "Yarating:  cp .env.production.example .env  va parollarni to'ldiring."
  exit 1
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
APP_PORT="${APP_PORT:-9091}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"

# Baza alohida diskda saqlanadigan bo'lsa (.env dagi DB_DATA_DIR)
if [ -n "${DB_DATA_DIR:-}" ]; then
  mkdir -p "$DB_DATA_DIR"
  COMPOSE="$COMPOSE -f docker-compose.hdd.yml"
  echo "Baza katalogi: $DB_DATA_DIR"
fi

for var in POSTGRES_PASSWORD BASIC_PASS; do
  value="${!var:-}"
  if [ -z "$value" ] || [ "$value" = "change-me" ] || [[ "$value" == ALMASHTIRING* ]]; then
    echo "XATO: .env dagi $var hali o'zgartirilmagan."
    exit 1
  fi
done

if [ "$PULL" = "1" ]; then
  log "Kodni yangilash (git pull)"
  git pull --ff-only
fi

log "Image yig'ilmoqda"
$COMPOSE build

log "Konteynerlar ishga tushirilmoqda"
# --wait-timeout: baza ko'tarilmasa cheksiz kutib qolmaslik uchun
if ! $COMPOSE up -d --wait --wait-timeout "${UP_TIMEOUT:-420}"; then
  echo
  echo "XATO: konteynerlar ${UP_TIMEOUT:-420}s ichida tayyor bo'lmadi."
  $COMPOSE ps
  echo "--- baza loglari ---"
  $COMPOSE logs --tail 60 db
  echo "--- ilova loglari ---"
  $COMPOSE logs --tail 60 app
  exit 1
fi

log "Ilova tayyor bo'lishi kutilmoqda"
ready=0
for _ in $(seq 1 60); do
  if curl -fsS -m 3 "http://127.0.0.1:${APP_PORT}/api/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" != "1" ]; then
  echo "XATO: ilova javob bermadi. Loglar:"
  $COMPOSE logs --tail 50 app
  exit 1
fi

log "Migratsiya qo'llanmoqda"
$COMPOSE exec -T app node scripts/migrate.mjs

log "Holat"
$COMPOSE ps
curl -fsS "http://127.0.0.1:${APP_PORT}/api/health"; echo

printf '\n\033[1;32mTayyor.\033[0m Ilova manzili: http://%s:%s\n' "$BIND_HOST" "$APP_PORT"
if [ "$BIND_HOST" = "127.0.0.1" ]; then
  echo "Tashqaridan kirish uchun nginx sozlang: deploy/nginx.conf.example"
fi
