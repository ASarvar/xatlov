# Xatlov — VMQ-247 bo'yicha davlat ko'chmas mulk obyektlarini xatlovdan o'tkazish tizimi

**1-bosqich:** "Davlat mulki" axborot tizimidan Davlat muassasalari ro'yxatini (STIR bo'yicha)
qabul qilish, saqlash va **yangilab turish**.

Texnologiyalar: Next.js 16 (App Router, TypeScript) · PostgreSQL 17 · Docker.

---

## Tez boshlash (Docker) — **lokal ishlab chiqish uchun**

```bash
cp .env.example .env
docker compose up -d --build
```

> Serverda bu buyruq ishlatilmaydi: u bazaning 5432-portini hostga chiqaradi va
> serverda allaqachon PostgreSQL ishlayotgan bo'lsa to'qnashadi. Serverda faqat
> `./scripts/deploy.sh` (u `docker-compose.prod.yml` ni qo'shadi va baza portini
> umuman ochmaydi) — [`docs/DEPLOY.md`](docs/DEPLOY.md).

- Ilova: http://localhost:3000
- Holat: http://localhost:3000/api/health
- Baza: `localhost:5432` (`xatlov` / `xatlov`)

Sxema `db/init/*.sql` orqali baza birinchi marta ko'tarilganda avtomatik yaratiladi.
Mavjud bazada qayta qo'llash uchun:

```bash
docker compose exec app node scripts/migrate.mjs
```

### Ishlab chiqish rejimi (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Dockersiz (faqat baza konteynerda)

```bash
docker compose up -d db
npm install
npm run db:migrate
npm run dev
```

### Serverda (production)

Ilova serverda **9091-portda** ishlaydi:

```bash
git clone https://github.com/ASarvar/xatlov.git /mnt/hdd1/xatlov && cd /mnt/hdd1/xatlov
cp .env.production.example .env    # parollarni to'ldiring
./scripts/deploy.sh
```

To'liq yo'riqnoma: [`docs/DEPLOY.md`](docs/DEPLOY.md) — nginx + HTTPS, yangilash,
rollback, zaxira nusxa va kundalik buyruqlar.

---

## Qanday tekshiriladi

Avtomatik tekshiruv (14 ta holat: auth, validatsiya, upsert, PATCH, bulk hisobi,
soft delete, UI sahifa):

```bash
npm run smoke
```

Qo'lda tekshirish:

```bash
docker compose ps                       # ikkala konteyner "healthy" bo'lishi kerak
curl http://localhost:3000/api/health   # {"status":"ok","db":true}
docker compose logs -f app              # jonli loglar
```

Bazaga bevosita qarash:

```bash
docker compose exec db psql -U xatlov -d xatlov -c "SELECT id, tin, org_name, state, updated_at FROM organisations ORDER BY id DESC LIMIT 10;"
docker compose exec db psql -U xatlov -d xatlov -c "SELECT * FROM sync_runs ORDER BY id DESC LIMIT 5;"
```

Namuna ma'lumot yuklash va natijani UI da ko'rish:

```bash
npm run import data/sample-organisations.json
```

> **Muhim:** `.env` dagi `BASIC_PASS` yoki baza sozlamalari o'zgartirilsa, konteyner
> eski qiymatlar bilan ishlashda davom etadi. Qayta qo'llash uchun: `docker compose up -d`.

Bazani butunlay tozalash: `docker compose down -v` (keyingi ko'tarilishda sxema qaytadan yaratiladi).

---

## Ma'lumotlar modeli

`organisations` — davlat muassasasi kartochkasi. Tabiiy kalit — **STIR (`tin`)**,
manbadagi yozuv shu kalit bo'yicha topiladi va yangilanadi.

| Maydon | Izoh |
|---|---|
| `id` | ichki identifikator |
| `typeid` | tashkilot turi (manba klassifikatori) |
| `source_id` | manba tizimidagi identifikator |
| `org_name` | tashkilot nomi |
| `region_id`, `district_id` | viloyat, tuman/shahar |
| `tin` | **STIR**, 9 xonali, unikal |
| `state` | 1 — faol, 0 — nofaol |
| `soato` | MHOBT kodi |
| `synced_at` | manbadan oxirgi marta olingan vaqt (har importda yangilanadi) |
| `created_at` | yozuv yaratilgan vaqt |
| `updated_at` | **ma'lumot haqiqatan o'zgargan** vaqt (faqat sinxronizatsiya `updated_at` ni o'zgartirmaydi) |

`sync_runs` — har bir yuklash sessiyasi: nechta yozuv kelgan, nechtasi yangi, nechtasi
yangilangan, nechtasi o'zgarishsiz qolgan.

---

## API

Barcha endpointlar (`/api/health` dan tashqari) **Basic auth** bilan himoyalangan:
`BASIC_USER` / `BASIC_PASS`.

| Metod | Yo'l | Vazifasi |
|---|---|---|
| `GET` | `/api/health` | ilova va baza holati |
| `GET` | `/api/organisations` | ro'yxat: `page`, `limit`, `q`, `tin`, `region_id`, `district_id`, `typeid`, `state`, `sort`, `order` |
| `POST` | `/api/organisations` | qo'shish; STIR mavjud bo'lsa — **yangilash** (upsert). `?mode=insert` bilan dublikatda `409` |
| `GET` | `/api/organisations/:id` | bitta yozuv |
| `PATCH` | `/api/organisations/:id` | **qisman yangilash** |
| `PUT` | `/api/organisations/:id` | **to'liq yangilash** |
| `DELETE` | `/api/organisations/:id` | nofaol qilish (`state = 0`), yozuv o'chirilmaydi |
| `GET` | `/api/organisations/by-tin/:tin` | STIR bo'yicha olish |
| `PUT` | `/api/organisations/by-tin/:tin` | **STIR bo'yicha upsert** — manba tizimi uchun asosiy nuqta |
| `PATCH` | `/api/organisations/by-tin/:tin` | STIR bo'yicha qisman yangilash |
| `POST` | `/api/organisations/bulk` | **ommaviy upsert** (5000 tagacha yozuv) + natija statistikasi |
| `GET` | `/api/sync-runs` | yuklash sessiyalari tarixi |

Tayyor so'rovlar to'plami: [`docs/api.http`](docs/api.http).

### Misollar

Bitta yozuv (qo'shadi yoki yangilaydi):

```bash
curl -u xatlov:change-me -H 'content-type: application/json' \
  -d '{"typeid":1,"source_id":"DM-001","org_name":"Toshkent shahar hokimligi","region_id":26,"district_id":263,"tin":"201122334","soato":"1726269"}' \
  http://localhost:3000/api/organisations
```

Javob: `201` + `"action":"created"` yoki `200` + `"action":"updated"`.

Ommaviy yuklash:

```bash
curl -u xatlov:change-me -H 'content-type: application/json' \
  -d '{"source":"davlat-mulki","items":[{"org_name":"...","tin":"201122334"}]}' \
  http://localhost:3000/api/organisations/bulk
```

Javob:

```json
{
  "message": "Success!",
  "run_id": "4",
  "summary": { "received": 3, "created": 1, "updated": 1, "unchanged": 1 },
  "actions": { "201122334": "updated", "302233445": "unchanged", "403344556": "created" }
}
```

Fayldan import (avtomatik bo'laklarga bo'lib yuboradi):

```bash
npm run import ./data/organisations.json
```

### Xatolar formati

| Kod | Holat |
|---|---|
| `401` | Basic auth xato |
| `404` | yozuv topilmadi |
| `409` | `?mode=insert` da STIR dublikati |
| `422` | validatsiya xatosi (`details` ichida maydonlar ro'yxati) |
| `400` | noto'g'ri JSON yoki baza cheklovi |

---

## Muhit o'zgaruvchilari

| O'zgaruvchi | Izoh |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `PGSSL` | `true` bo'lsa SSL orqali ulanadi |
| `BASIC_USER`, `BASIC_PASS` | API himoyasi |
| `POSTGRES_USER/PASSWORD/DB/PORT` | `docker compose` uchun baza sozlamalari |

> Ishga tushirishdan oldin `.env` dagi `BASIC_PASS` va baza parolini albatta o'zgartiring.

---

## Loyiha tuzilishi

```
src/
  app/
    api/organisations/route.ts            GET ro'yxat, POST upsert
    api/organisations/[id]/route.ts       GET, PATCH, PUT, DELETE
    api/organisations/by-tin/[tin]/...    STIR bo'yicha GET, PUT, PATCH
    api/organisations/bulk/route.ts       ommaviy upsert
    api/sync-runs/route.ts                yuklash tarixi
    api/health/route.ts                   holat
    page.tsx                              ro'yxatni ko'rish paneli
  lib/
    db.ts              pg pool (lazy), tranzaksiya helperi
    auth.ts            Basic auth
    validation.ts      zod sxemalari
    organisations.ts   SQL qatlami (upsert, diff, bulk)
    http.ts            JSON javoblar va xatolarni qayta ishlash
db/init/*.sql          sxema (idempotent)
scripts/               migratsiya, import, smoke-test, deploy, backup
deploy/                nginx namunasi
docs/                  DEPLOY.md, api.http
```

---

## Keyingi bosqichlar (VMQ-247 sxemasi bo'yicha)

2-bosqich — Adliya vazirligi, Kadastr agentligi, Iqtisodiyot va moliya vazirligi va boshqa
organlardan ma'lumot almashinuvi; 3-bosqich — tahlil, xatlov va samarali foydalanish choralari.
Joriy modul ularning barchasi uchun tayanch reyestr bo'lib xizmat qiladi.
