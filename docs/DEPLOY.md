# Serverga o'rnatish (deploy)

Ilova serverda ikkita konteyner sifatida ishlaydi: **Next.js ilovasi** va **PostgreSQL**.
Kod git orqali yetkaziladi, o'rnatish ham, yangilash ham bitta buyruq — `./scripts/deploy.sh`.

Joriy o'rnatma: `markazsrv:/mnt/hdd1/xatlov`, ilova **9091-portda**.

---

## 1. Qanday tuzilgan

| Konteyner | Nima | Port |
|---|---|---|
| `xatlov-app` | Next.js (standalone), root bo'lmagan `nextjs` foydalanuvchisi | `BIND_HOST:APP_PORT` → 3000 |
| `xatlov-db` | PostgreSQL 17 | **hostga chiqarilmaydi** (faqat ichki tarmoq) |

Compose fayllari bir-birini to'ldiradi:

| Fayl | Qachon | Nima qiladi |
|---|---|---|
| `docker-compose.yml` | doimo | servislar, muhit o'zgaruvchilari, healthcheck. **Port e'lon qilmaydi** |
| `docker-compose.override.yml` | lokalda avtomatik | lokal portlar: 3000 va 5432 |
| `docker-compose.prod.yml` | serverda (`deploy.sh` qo'shadi) | faqat ilova porti, `restart: always`, log rotatsiyasi |
| `docker-compose.hdd.yml` | `.env` da `DB_DATA_DIR` bo'lsa | baza fayllarini alohida diskda saqlaydi |
| `docker-compose.dev.yml` | lokal hot reload | Compose 2.24+ talab qiladi |

Shu sababli serverda **hech qachon** yalang'och `docker compose up` ishlatilmaydi — u lokal
override'ni qo'shib, bazaning 5432-portini hostga chiqaradi va serverdagi mavjud
PostgreSQL bilan to'qnashadi.

---

## 2. Server talablari

- Linux (Ubuntu 22.04/24.04), 2 CPU / 2 GB RAM / 20 GB disk — boshlang'ich uchun yetarli
- Docker Engine + Docker Compose plugin (v2.18 ham yetarli)
- Git
- Tashqaridan kirish uchun: nginx (tavsiya etiladi) yoki `APP_PORT` ning ochiq bo'lishi

Docker o'rnatilmagan bo'lsa:

```bash
curl -fsSL https://get.docker.com | sudo sh && sudo systemctl enable --now docker
```

> `systemctl enable docker` muhim: server qayta yuklanganda konteynerlar `restart: always`
> siyosati bilan o'zi ko'tariladi.

**Serverda Node o'rnatilishi shart emas.** Loyiha skriptlari konteyner ichida (Node 22)
ishga tushiriladi — 12-bo'limga qarang.

---

## 3. Kodni serverga olish

```bash
sudo mkdir -p /mnt/hdd1/xatlov && sudo chown $USER:$USER /mnt/hdd1/xatlov
git clone https://github.com/ASarvar/xatlov.git /mnt/hdd1/xatlov
cd /mnt/hdd1/xatlov && chmod +x scripts/*.sh
```

**Baza qayerda saqlanadi.** Kod `/mnt/hdd1` da bo'lsa ham, Docker volume'lari va image'lar
sukut bo'yicha `/var/lib/docker` da, ya'ni tizim diskida yotadi. Bazani ham katta diskda
saqlash kerak bo'lsa, `.env` ga quyidagi satrni qo'shing — **baza birinchi marta
yaratilishidan oldin**:

```
DB_DATA_DIR=/mnt/hdd1/xatlov-data/postgres
```

`deploy.sh` buni ko'rsa, katalogni yaratadi va `docker-compose.hdd.yml` ni o'zi qo'shadi.
Ishlab turgan bazani ko'chirish kerak bo'lsa: zaxira olish → `DB_DATA_DIR` ni yozish →
`docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v` → `./scripts/deploy.sh`
→ zaxirani tiklash (10-bo'lim).

---

## 4. Sozlamalar (.env)

```bash
cp .env.production.example .env && openssl rand -base64 24 && openssl rand -base64 24
```

```bash
nano .env
```

| O'zgaruvchi | Izoh |
|---|---|
| `APP_PORT` | serverdagi port (`9091`) |
| `BIND_HOST` | `127.0.0.1` — faqat nginx orqali; `0.0.0.0` — to'g'ridan-to'g'ri tashqariga |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | baza hisob ma'lumotlari |
| `BASIC_USER` / `BASIC_PASS` | API himoyasi (Basic auth) |
| `DB_DATA_DIR` | ixtiyoriy: baza fayllari uchun katalog |
| `TZ` | `Asia/Tashkent` |

Parolda `/`, `+`, `=` bo'lishi mumkin — ilova ulanish satrini emas, alohida
o'zgaruvchilarni ishlatadi, shuning uchun `openssl rand -base64` chiqargan har qanday
parol yaraydi.

`.env` git ga tushmaydi va faqat serverda saqlanadi:

```bash
chmod 600 .env
```

> Nusxasini xavfsiz joyda saqlang: baza paroli yo'qolsa, mavjud volume'dagi ma'lumotga
> kirib bo'lmaydi.

---

## 5. Ishga tushirish

```bash
./scripts/deploy.sh
```

Skript ketma-ketligi: `.env` va parollarni tekshirish → port bandligini tekshirish →
`git pull` → image yig'ish → konteynerlarni ko'tarish va `healthy` bo'lishini kutish →
migratsiyani qo'llash → holatni ko'rsatish.

Xato bo'lsa, o'zi ikkala servisning loglarini chiqarib to'xtaydi. Kutish muddati —
420 soniya, sekin serverda uzaytirish mumkin: `UP_TIMEOUT=900 ./scripts/deploy.sh`.
Kodni tortmasdan qayta yig'ish: `./scripts/deploy.sh --no-pull`.

Yakunida shunday chiqadi:

```
{"status":"ok","db":true,"time":"..."}
Tayyor. Ilova manzili: http://127.0.0.1:9091
```

---

## 6. Tekshirish

```bash
curl http://127.0.0.1:9091/api/health
```

To'liq tekshiruv — 14 ta holat (auth, validatsiya, upsert, PATCH, bulk hisobi, soft
delete, UI sahifa). Konteyner ichida ilova 3000-portda bo'lgani uchun manzil `127.0.0.1:3000`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000
```

Test yozuvlari `999000001` va `999000002` STIR'laridan foydalanadi va oxirida nofaol
qilinadi — skriptni xohlagancha qayta ishga tushirsa bo'ladi.

> Image ichida faqat `scripts/`, `db/` va ilovaning o'zi bor. Serverda JSON fayldan
> import qilish kerak bo'lsa, faylni avval konteynerga nusxalang:
> `dc cp organisations.json app:/tmp/import.json`.

---

## 7. Tashqariga chiqarish

### Variant A — nginx + HTTPS (tavsiya etiladi)

`.env` da `BIND_HOST=127.0.0.1` bo'lsin (port faqat server ichidan ochiq):

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/xatlov
```

`server_name` ni o'z domeningizga almashtiring, so'ng:

```bash
sudo ln -s /etc/nginx/sites-available/xatlov /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d xatlov.example.uz
```

### Variant B — to'g'ridan-to'g'ri port

`.env` da `BIND_HOST=0.0.0.0` → `./scripts/deploy.sh`, so'ng portni oching:

```bash
sudo ufw allow 9091/tcp
```

> Bu holatda trafik HTTPS siz ketadi va Basic auth paroli tarmoqda ochiq uzatiladi.
> Faqat ichki tarmoq yoki VPN uchun.

---

## 8. Eski API dan ma'lumot ko'chirish

Eski Express API serverdagi host PostgreSQL'ga yozgan, yangi tizimning bazasi esa
konteynerda. Ko'chirish `scripts/import-from-legacy.mjs` orqali bajariladi: u eski
jadvalni o'qib, yangi API ning `/api/organisations/bulk` nuqtasiga yuboradi. STIR bo'yicha
upsert qilingani uchun takroriy ishga tushirish xavfsiz.

Skript konteyner ichida ishlaydi, eski baza esa host'da — shuning uchun manzil
`host.docker.internal` (compose'dagi `extra_hosts` orqali ishlaydi).

Avval quruq yurish — hech narsa yozilmaydi, faqat hisobot:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T -e LEGACY_PGHOST=host.docker.internal -e LEGACY_PGPORT=5432 -e LEGACY_PGUSER=USER -e LEGACY_PGPASSWORD=PAROL -e LEGACY_PGDATABASE=ESKI_BAZA -e DRY_RUN=1 app node scripts/import-from-legacy.mjs http://127.0.0.1:3000
```

Natija to'g'ri bo'lsa, `-e DRY_RUN=1` siz takrorlang. So'ng tekshiring:

```bash
curl -u LOGIN:PAROL 'http://127.0.0.1:9091/api/organisations?limit=5'
```

Eslatmalar:

- STIR formati noto'g'ri (9 xonali emas) yozuvlar ko'chirilmaydi — skript ularning
  ro'yxatini chiqaradi, ularni qo'lda tekshirish kerak.
- Host'dagi PostgreSQL konteynerdan kelgan ulanishni qabul qilishi kerak. "no pg_hba.conf
  entry" xatosi chiqsa, `pg_hba.conf` ga `host all all 172.16.0.0/12 md5` satrini qo'shing
  va `systemctl reload postgresql` qiling.
- Eski xizmat va uning bazasini darhol o'chirmang — bir necha kun zaxira sifatida qolsin.
- Eski xizmat qayta ko'tarilmasligi uchun uni `disable` qiling: systemd bo'lsa
  `systemctl stop NOMI && systemctl disable NOMI`, pm2 bo'lsa `pm2 delete NOMI && pm2 save`.

Eski API ga murojaat qiladigan integratsiyalar yangi manzillarga o'tkaziladi: `POST
/api/organisations` (STIR mavjud bo'lsa **yangilaydi**, xato bermaydi), ommaviy yuklash
uchun `POST /api/organisations/bulk`.

---

## 9. Yangilash va orqaga qaytarish

```bash
cd /mnt/hdd1/xatlov && ./scripts/deploy.sh
```

Konteyner qayta yaratilgani uchun bir necha soniya uzilish bo'ladi.

Orqaga qaytarish:

```bash
git log --oneline -5
```

```bash
git checkout <oldingi-commit> && ./scripts/deploy.sh --no-pull
```

> Migratsiyalar idempotent va faqat qo'shimcha (jadval/indeks yaratish), shuning uchun
> oldingi versiyaga qaytish bazani buzmaydi.

---

## 10. Zaxira nusxa

```bash
./scripts/backup-db.sh
```

Natija: `backups/xatlov-YYYYmmdd-HHMM.sql.gz`. 30 kundan eski nusxalar o'chiriladi
(`BACKUP_KEEP_DAYS` bilan sozlanadi).

Har kuni soat 02:00 da avtomatik:

```bash
crontab -l 2>/dev/null | { cat; echo "0 2 * * * cd /mnt/hdd1/xatlov && ./scripts/backup-db.sh >> /var/log/xatlov-backup.log 2>&1"; } | crontab -
```

Tiklash:

```bash
gunzip -c backups/xatlov-20260101-0200.sql.gz | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U xatlov -d xatlov
```

---

## 11. Kundalik buyruqlar

Qulaylik uchun:

```bash
echo "alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'" >> ~/.bashrc && source ~/.bashrc
```

| Vazifa | Buyruq |
|---|---|
| Holat | `dc ps` |
| Loglar | `dc logs -f app` |
| Qayta ishga tushirish | `dc restart app` |
| To'xtatish / ko'tarish | `dc stop` / `dc start` |
| Migratsiyani qo'llash | `dc exec -T app node scripts/migrate.mjs` |
| Bazaga kirish | `dc exec db psql -U xatlov -d xatlov` |
| Tekshiruv (smoke) | `dc exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000` |
| Fayldan import | avval `dc cp fayl.json app:/tmp/import.json`, so'ng `dc exec -T app node scripts/import-organisations.mjs /tmp/import.json http://127.0.0.1:3000` |
| Zaxira | `./scripts/backup-db.sh` |
| Resurslar | `docker stats --no-stream` |

---

## 12. Nosozliklarni bartaraf etish

Quyidagilar shu o'rnatmada haqiqatan uchragan holatlar.

**`XATO: 9091 porti boshqa jarayon tomonidan band`**
Portni boshqa xizmat egallagan. Kim ekanini `ss -lntp | grep :9091` ko'rsatadi. Yo o'sha
xizmatni to'xtating, yo `.env` da `APP_PORT` ni almashtiring.

**Konteyner `unhealthy`, lekin loglarda xato yo'q**
Ilova ko'tarilgan, ammo bazaga ulana olmayapti. Sababini so'rang:

```bash
curl -s http://127.0.0.1:9091/api/health
```

`degraded` holatda javobda `error` maydoni bo'ladi. Ko'p uchraydigani — `.env` o'zgartirilgan,
lekin konteyner eski qiymatlar bilan ishlayotgani: `./scripts/deploy.sh` bilan qayta qo'llang.

**`.env` dagi parolni o'zgartirdim, ilova ulanmayapti**
Baza paroli faqat **birinchi** yaratilishda o'rnatiladi. Keyin `.env` da parolni
o'zgartirsangiz, ilova yangi parol bilan eski bazaga ulanolmaydi. Yo eski parolni
qaytaring, yo bazadagi parolni almashtiring:
`dc exec db psql -U xatlov -c "ALTER USER xatlov PASSWORD 'yangi_parol';"`

**`Container xatlov-db Starting` uzoq davom etyapti**
Birinchi ishga tushishda `initdb` sekin disklarda bir necha daqiqa olishi mumkin
(healthcheck'da `start_period: 180s` shuning uchun). 420 soniyadan oshsa, `deploy.sh`
o'zi loglarni chiqaradi. Loglarda `bind: address already in use` bo'lsa — port to'qnashuvi.

**`docker compose config` da bazaning 5432 porti ko'rinyapti**
Demak lokal `docker-compose.override.yml` qo'shilib qolgan: serverda buyruqlarni
`-f docker-compose.yml -f docker-compose.prod.yml` bilan (yoki `deploy.sh` orqali) bajaring.

**`SyntaxError: Unexpected token ?` — skriptni ishga tushirganda**
Serverdagi tizim Node'i juda eski. Skriptlarni konteyner ichida ishga tushiring:
`dc exec -T app node scripts/...`

**Eski Compose (2.24 dan past)**
`!reset` / `!override` teglari ishlamaydi. Loyiha ulardan foydalanmaydi (portlar alohida
fayllarga ajratilgan), faqat `docker-compose.dev.yml` bundan mustasno — u lokal uchun.

---

## 13. Xavfsizlik

- Baza porti hostga umuman chiqarilmaydi; unga faqat ilova konteyneri ulanadi.
- Ilova konteyner ichida root bo'lmagan `nextjs` foydalanuvchisi nomidan ishlaydi.
- `.env` — `chmod 600`, git ga tushmaydi.
- Loglar 10 MB × 3 fayl bilan cheklangan, disk to'lib qolmaydi.
- API Basic auth bilan himoyalangan. Ochiq internetga chiqariladigan bo'lsa HTTPS majburiy
  (7-bo'lim, Variant A).
- Parollarni almashtirgandan keyin `./scripts/deploy.sh` ni qayta ishga tushirishni unutmang.
