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

```bash
sudo mkdir -p /opt/xatlov && sudo chown $USER:$USER /opt/xatlov
git clone <repo-url> /opt/xatlov
cd /opt/xatlov
```

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
npm run smoke -- http://127.0.0.1:9091    # to'liq tekshiruv (Node o'rnatilgan bo'lsa)
```

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

## 6. Yangilash

```bash
cd /opt/xatlov
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
# 0 2 * * * cd /opt/xatlov && ./scripts/backup-db.sh >> /var/log/xatlov-backup.log 2>&1
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
| Resurslar | `docker stats --no-stream` |

---

## 9. Xavfsizlik bo'yicha eslatmalar

- Baza porti tashqariga **umuman chiqarilmaydi** (`docker-compose.prod.yml` da `ports` bo'sh).
- Ilova konteyner ichida `nextjs` (root bo'lmagan) foydalanuvchi nomidan ishlaydi.
- `.env` faylga faqat egasi kira olsin: `chmod 600 .env`.
- Loglar 10 MB × 3 fayl bilan cheklangan — disk to'lib qolmaydi.
- API Basic auth bilan himoyalangan; ochiq internetga chiqariladigan bo'lsa HTTPS majburiy.
