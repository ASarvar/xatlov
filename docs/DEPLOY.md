# Serverga o'rnatish (deploy)

Ilova serverda **Docker** ichida, **9091-portda** ishlaydi. Kod git orqali yetkaziladi,
yangilanish bitta buyruq bilan bajariladi.

---

## 1. Server talablari

- Linux (Ubuntu 22.04/24.04 tavsiya etiladi), 2 CPU / 2 GB RAM / 20 GB disk — boshlang'ich uchun yetarli
- Docker Engine + Docker Compose plugin
- Git
- Tashqaridan kirish uchun: nginx (tavsiya etiladi) yoki 9091-portning ochiq bo'lishi

Docker o'rnatilmagan bo'lsa (Ubuntu):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # keyin qayta login qiling
sudo systemctl enable --now docker
```

> `systemctl enable docker` muhim: server qayta yuklanganda konteynerlar
> `restart: always` siyosati bilan o'zi ko'tariladi.

---

## 2. Kodni serverga olish

Loyiha `/mnt/hdd1/xatlov` katalogida turadi:

```bash
sudo mkdir -p /mnt/hdd1/xatlov
sudo chown $USER:$USER /mnt/hdd1/xatlov
git clone https://github.com/ASarvar/xatlov.git /mnt/hdd1/xatlov
cd /mnt/hdd1/xatlov
```

> Katalog bo'sh bo'lishi kerak. Agar `git clone` "directory not empty" desa:
> `git init && git remote add origin https://github.com/ASarvar/xatlov.git && git fetch && git checkout -f main`

**Diqqat:** kod `/mnt/hdd1/xatlov` da bo'lsa ham, baza fayllari va image'lar sukut bo'yicha
`/var/lib/docker` da, ya'ni tizim diskida saqlanadi. Baza ham `/mnt/hdd1` da yotishi kerak
bo'lsa, `.env` ga quyidagini yozing (baza **birinchi marta yaratilishidan oldin**):

```
DB_DATA_DIR=/mnt/hdd1/xatlov-data/postgres
```

`deploy.sh` buni ko'rsa, katalogni yaratadi va `docker-compose.hdd.yml` ni avtomatik
qo'shadi. Ishlab turgan bazani ko'chirish kerak bo'lsa: `./scripts/backup-db.sh` →
`DB_DATA_DIR` ni yozish → `docker compose ... down -v` → `./scripts/deploy.sh` → zaxirani tiklash.

## 3. Sozlamalar (.env)

```bash
cp .env.production.example .env
openssl rand -base64 24    # POSTGRES_PASSWORD uchun
openssl rand -base64 24    # BASIC_PASS uchun
nano .env
```

To'ldirilishi shart:

| O'zgaruvchi | Qiymat |
|---|---|
| `APP_PORT` | `9091` |
| `BIND_HOST` | `127.0.0.1` (nginx orqali) yoki `0.0.0.0` (to'g'ridan-to'g'ri) |
| `POSTGRES_PASSWORD` | kuchli parol |
| `BASIC_USER` / `BASIC_PASS` | API uchun login/parol |

`.env` git ga tushmaydi va **faqat serverda** saqlanadi. Nusxasini xavfsiz joyda saqlang —
bazaning paroli yo'qolsa, mavjud volume'dagi ma'lumotga kirib bo'lmaydi.

## 4. Ishga tushirish

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

Skript: kodni tortadi → image yig'adi → konteynerlarni ko'taradi → ilova javob berishini
kutadi → migratsiyani qo'llaydi → holatni ko'rsatadi. Xato bo'lsa loglarni chiqaradi va
nolga teng bo'lmagan kod bilan to'xtaydi.

Tekshirish:

```bash
curl http://127.0.0.1:9091/api/health     # {"status":"ok","db":true}
```

To'liq tekshiruv (14 ta holat). Serverdagi tizim Node'i eski bo'lishi mumkin, shuning
uchun skriptlar **konteyner ichida** ishga tushiriladi — u yerda Node 22 bor:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml   exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000
```

> Konteyner ichida ilova `127.0.0.1:3000` da, tashqarida esa `APP_PORT` da (9091).
> Shuning uchun ichkaridagi buyruqlarda 3000 yoziladi.

---

## 5. Tashqariga chiqarish

### Variant A — nginx orqali (tavsiya etiladi)

`BIND_HOST=127.0.0.1` bo'lsa, port faqat server ichidan ochiq bo'ladi:

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/xatlov
sudo nano /etc/nginx/sites-available/xatlov      # server_name ni o'zgartiring
sudo ln -s /etc/nginx/sites-available/xatlov /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d xatlov.example.uz        # HTTPS
```

### Variant B — to'g'ridan-to'g'ri 9091-port

`.env` da `BIND_HOST=0.0.0.0` qiling, `./scripts/deploy.sh` ni qayta ishga tushiring va
portni oching:

```bash
sudo ufw allow 9091/tcp
```

> Bu holatda trafik HTTPS siz ketadi — Basic auth paroli tarmoqda ochiq uzatiladi.
> Faqat ichki tarmoq yoki VPN ichida ishlatilsin.

---

## 5a. Eski API o'rnini egallash (9091-port)

Serverda eski Express API (`/srv/api/...`) 9091-portda ishlab turibdi va uning
ma'lumotlari **serverdagi PostgreSQL** da. Yangi tizimning bazasi esa alohida
konteynerda, shuning uchun portni almashtirishdan oldin ma'lumotni ko'chirish kerak.

**1-qadam.** Yangi ilova ishlab turgan bo'lsin (`./scripts/deploy.sh`).

**2-qadam.** Eski bazadagi yozuvlarni ko'chiring (avval quruq yurish bilan tekshiring):

Skript konteyner ichida ishlaydi, eski baza esa host mashinada — shuning uchun host
manzili sifatida `host.docker.internal` ishlatiladi:

```bash
alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'

# 1) Faqat hisobot (hech narsa yozilmaydi)
dc exec -T   -e LEGACY_PGHOST=host.docker.internal -e LEGACY_PGPORT=5432   -e LEGACY_PGUSER=USER -e LEGACY_PGPASSWORD=PAROL -e LEGACY_PGDATABASE=ESKI_BAZA   -e DRY_RUN=1   app node scripts/import-from-legacy.mjs http://127.0.0.1:3000

# 2) Ko'chirish (DRY_RUN siz)
dc exec -T   -e LEGACY_PGHOST=host.docker.internal -e LEGACY_PGPORT=5432   -e LEGACY_PGUSER=USER -e LEGACY_PGPASSWORD=PAROL -e LEGACY_PGDATABASE=ESKI_BAZA   app node scripts/import-from-legacy.mjs http://127.0.0.1:3000
```

> Host'dagi PostgreSQL konteynerdan kelgan ulanishni qabul qilishi kerak. "no
> pg_hba.conf entry" xatosi chiqsa, `pg_hba.conf` ga docker tarmog'i uchun ruxsat
> qo'shing (masalan `host all all 172.16.0.0/12 md5`) va `systemctl reload postgresql`.

Skript STIR bo'yicha upsert qiladi — qayta ishga tushirsa ham takrorlanmaydi. STIR formati
noto'g'ri (9 xonali emas) yozuvlarni o'tkazib yuboradi va ro'yxatini chiqaradi.

**3-qadam.** Ma'lumot to'g'ri ko'chganini tekshiring:

```bash
curl -u USER:PAROL 'http://127.0.0.1:9091/api/organisations?limit=5'
```

**4-qadam.** Eski xizmatni to'xtating. Avval qanday ishga tushirilganini aniqlang:

```bash
ps -o pid,ppid,cmd -p $(ss -lntp | grep ':9091' | grep -oP 'pid=\K[0-9]+' | head -1)
systemctl list-units --type=service --state=running | grep -iE 'api|organ|node'
pm2 list 2>/dev/null
```

So'ng mos usulda to'xtating va qayta ishga tushmasligini ta'minlang:

| Qanday ishlayapti | To'xtatish |
|---|---|
| systemd xizmati | `sudo systemctl stop NOMI && sudo systemctl disable NOMI` |
| pm2 | `pm2 stop NOMI && pm2 delete NOMI && pm2 save` |
| oddiy jarayon | `kill PID` (autostart bo'lsa, cron/rc.local ni ham tekshiring) |

**5-qadam.** Portni yangi ilovaga bering: `.env` da `APP_PORT=9091`, so'ng
`./scripts/deploy.sh`. Nginx eski xizmatga yo'naltirilgan bo'lsa, `proxy_pass` manzilini
ham yangilang.

> Eski xizmat kodini va bazasini darhol o'chirmang — bir necha kun zaxira sifatida
> qolsin. Eski bazadan yangi yozuvlar kelib tushmayotganiga ishonch hosil qilgach o'chirasiz.

---

## 6. Yangilash

```bash
cd /mnt/hdd1/xatlov
./scripts/deploy.sh
```

Bir necha soniyalik uzilish bo'ladi (konteyner qayta yaratiladi). Kodni tortmasdan qayta
yig'ish kerak bo'lsa: `./scripts/deploy.sh --no-pull`.

**Orqaga qaytarish (rollback):**

```bash
git log --oneline -5
git checkout <oldingi-commit>
./scripts/deploy.sh --no-pull
```

---

## 7. Zaxira nusxa

```bash
./scripts/backup-db.sh                 # backups/xatlov-YYYYmmdd-HHMM.sql.gz
```

Har kuni soat 02:00 da avtomatik (cron):

```bash
crontab -e
# 0 2 * * * cd /mnt/hdd1/xatlov && ./scripts/backup-db.sh >> /var/log/xatlov-backup.log 2>&1
```

Tiklash:

```bash
gunzip -c backups/xatlov-20260101-0200.sql.gz | \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U xatlov -d xatlov
```

---

## 8. Kundalik buyruqlar

Qulaylik uchun alias qo'shing: `alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'`

| Vazifa | Buyruq |
|---|---|
| Holat | `dc ps` |
| Loglar | `dc logs -f app` |
| Qayta ishga tushirish | `dc restart app` |
| To'xtatish | `dc stop` |
| Migratsiyani qo'llash | `dc exec app node scripts/migrate.mjs` |
| Bazaga kirish | `dc exec db psql -U xatlov -d xatlov` |
| Tekshiruv (smoke) | `dc exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000` |
| Fayldan import | `dc exec -T app node scripts/import-organisations.mjs data/fayl.json http://127.0.0.1:3000` |
| Resurslar | `docker stats --no-stream` |

---

## 9. Xavfsizlik bo'yicha eslatmalar

- Baza porti tashqariga **umuman chiqarilmaydi** (`docker-compose.prod.yml` da `ports` bo'sh).
- Ilova konteyner ichida `nextjs` (root bo'lmagan) foydalanuvchi nomidan ishlaydi.
- `.env` faylga faqat egasi kira olsin: `chmod 600 .env`.
- Loglar 10 MB × 3 fayl bilan cheklangan — disk to'lib qolmaydi.
- API Basic auth bilan himoyalangan; ochiq internetga chiqariladigan bo'lsa HTTPS majburiy.
