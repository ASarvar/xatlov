# Xatlov — VMQ-247 bo'yicha davlat ko'chmas mulk obyektlarini xatlovdan o'tkazish tizimi

**1-bosqich:** "Davlat mulki" axborot tizimidan Davlat muassasalari ro'yxatini (STIR bo'yicha)
qabul qilish, saqlash va **yangilab turish**.

Texnologiyalar: Next.js 16 (App Router, TypeScript) · PostgreSQL 17 · Docker.

---

## Tez boshlash (lokal)

```bash
cp .env.example .env && docker compose up -d --build
```

- Ilova: http://localhost:3000
- Holat: http://localhost:3000/api/health
- Baza: `localhost:5432` (`.env` dagi hisob ma'lumotlari)

Sxema `db/init/*.sql` orqali baza birinchi marta ko'tarilganda avtomatik yaratiladi.
Mavjud bazada qayta qo'llash uchun:

```bash
docker compose exec -T app node scripts/migrate.mjs
```

> Bu buyruqlar **serverda ishlatilmaydi** — lokal `docker-compose.override.yml` bazaning
> 5432-portini hostga chiqaradi va serverdagi mavjud PostgreSQL bilan to'qnashadi.
> Serverda faqat `./scripts/deploy.sh`.

### Hot reload bilan ishlash

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Dockersiz (faqat baza konteynerda)

```bash
docker compose up -d db && npm install && npm run db:migrate && npm run dev
```

### Serverda

Ilova serverda **9091-portda** ishlaydi:

```bash
git clone https://github.com/ASarvar/xatlov.git /mnt/hdd1/xatlov && cd /mnt/hdd1/xatlov
```

```bash
cp .env.production.example .env    # parollarni to'ldiring
```

```bash
./scripts/deploy.sh
```

To'liq yo'riqnoma — [`docs/DEPLOY.md`](docs/DEPLOY.md): nginx + HTTPS, eski API dan
ma'lumot ko'chirish, yangilash va rollback, zaxira nusxa, nosozliklarni bartaraf etish.

---

## Qanday tekshiriladi

Avtomatik tekshiruv — 16 ta holat (auth, validatsiya, upsert, PATCH, bulk hisobi,
soft delete, UI sahifa):

```bash
npm run smoke
```

Serverda yoki tizim Node'i eski bo'lgan mashinada skriptlar konteyner ichida ishlaydi
(u yerda Node 22 va barcha bog'liqliklar bor):

```bash
docker compose exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000
```

Qo'lda tekshirish:

```bash
docker compose ps && curl http://localhost:3000/api/health && docker compose logs --tail 20 app
```

Bazaga bevosita qarash:

```bash
docker compose exec db psql -U xatlov -d xatlov -c "SELECT id, tin, org_name, state, updated_at FROM organisations ORDER BY id DESC LIMIT 10;"
```

Namuna ma'lumot yuklash:

```bash
npm run import data/sample-organisations.json
```

> `.env` dagi parol yoki port o'zgartirilsa, konteyner eski qiymatlar bilan ishlashda
> davom etadi. Qayta qo'llash uchun: `docker compose up -d` (serverda `./scripts/deploy.sh`).

Bazani butunlay tozalash: `docker compose down -v`.

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
| `updated_at` | **ma'lumot haqiqatan o'zgargan** vaqt (sinxronizatsiyaning o'zi buni o'zgartirmaydi) |

`sync_runs` — har bir yuklash sessiyasi: nechta yozuv kelgan, nechtasi yangi, nechtasi
yangilangan, nechtasi o'zgarishsiz qolgan.

---

## API

Barcha endpointlar (`/api/health` dan tashqari) **Basic auth** bilan himoyalangan:
`BASIC_USER` / `BASIC_PASS`.

| Metod | Yo'l | Vazifasi |
|---|---|---|
| `GET` | `/api/health` | ilova va baza holati; nosozlikda sababi (`error`) bilan |
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

Tayyor so'rovlar to'plami: [`docs/api.http`](docs/api.http) (VS Code / JetBrains HTTP Client).
Postman uchun kolleksiya va muhit fayllari: [`docs/postman/`](docs/postman/README.md) —
barcha modullar, testlari bilan, Collection Runner'da bir tugmada ishlaydi.

### Misollar

Bitta yozuv (qo'shadi yoki yangilaydi):

```bash
curl -u LOGIN:PAROL -H 'content-type: application/json' -d '{"typeid":1,"source_id":"DM-001","org_name":"Toshkent shahar hokimligi","region_id":26,"district_id":263,"tin":"201122334","soato":"1726269"}' http://localhost:3000/api/organisations
```

Javob: `201` + `"action":"created"` yoki `200` + `"action":"updated"`.

Ommaviy yuklash:

```bash
curl -u LOGIN:PAROL -H 'content-type: application/json' -d '{"source":"davlat-mulki","items":[{"org_name":"...","tin":"201122334"}]}' http://localhost:3000/api/organisations/bulk
```

```json
{
  "message": "Success!",
  "run_id": "4",
  "summary": { "received": 3, "created": 1, "updated": 1, "unchanged": 1 },
  "actions": { "201122334": "updated", "302233445": "unchanged", "403344556": "created" }
}
```

### Xatolar formati

| Kod | Holat |
|---|---|
| `401` | Basic auth xato |
| `404` | yozuv topilmadi |
| `409` | `?mode=insert` da STIR dublikati |
| `422` | validatsiya xatosi (`details` ichida maydonlar ro'yxati) |
| `400` | noto'g'ri JSON yoki baza cheklovi |
| `503` | baza mavjud emas (`/api/health`, sababi `error` maydonida) |

---

## Skriptlar

| Buyruq | Vazifasi |
|---|---|
| `npm run db:migrate` | `db/init/*.sql` ni qo'llaydi (idempotent) |
| `npm run smoke` | ishga tushgan ilovani 16 ta holat bo'yicha tekshiradi |
| `npm run import FAYL.json` | JSON fayldan ommaviy yuklaydi (500 talab bo'lib) |
| `npm run import:legacy` | eski (legacy) bazadagi `organisations` jadvalini ko'chiradi |
| `./scripts/deploy.sh` | serverda: pull → build → ko'tarish → migratsiya → holat |
| `./scripts/backup-db.sh` | `pg_dump` zaxirasi + eski nusxalarni tozalash |

---

## Muhit o'zgaruvchilari

| O'zgaruvchi | Izoh |
|---|---|
| `APP_PORT` | host porti (lokal `3000`, serverda `9091`) |
| `BIND_HOST` | serverda: `127.0.0.1` (nginx orqali) yoki `0.0.0.0` (to'g'ridan-to'g'ri) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | baza hisob ma'lumotlari |
| `PGHOST` / `PGPORT` | baza manzili (Docker'da `db:5432`) |
| `DATABASE_URL` | ixtiyoriy: alohida o'zgaruvchilar o'rniga to'liq ulanish satri |
| `BASIC_USER` / `BASIC_PASS` | API himoyasi |
| `DB_DATA_DIR` | ixtiyoriy: baza fayllari uchun katalog (alohida disk) |
| `PGSSL` | `true` bo'lsa SSL orqali ulanadi |
| `TZ` | vaqt mintaqasi (`Asia/Tashkent`) |

> Ilova bazaga ulanish satri orqali emas, **alohida o'zgaruvchilar** orqali ulanadi:
> `openssl rand -base64` bergan parolda `/` yoki `=` bo'lsa, URL yaroqsiz bo'lib qoladi.
> `DATABASE_URL` berilgan bo'lsa, u ustun turadi.

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

Compose fayllari:

| Fayl | Vazifasi |
|---|---|
| `docker-compose.yml` | asosiy servislar; **port e'lon qilmaydi** |
| `docker-compose.override.yml` | lokal portlar (3000, 5432) — `docker compose up` avtomatik qo'shadi |
| `docker-compose.prod.yml` | serverda: faqat ilova porti, `restart: always`, log rotatsiyasi |
| `docker-compose.hdd.yml` | baza fayllarini alohida diskda saqlash (`DB_DATA_DIR`) |
| `docker-compose.dev.yml` | hot reload (Compose 2.24+) |

---

## Keyingi bosqichlar (VMQ-247 sxemasi bo'yicha)

2-bosqich — Adliya vazirligi, Kadastr agentligi, Iqtisodiyot va moliya vazirligi va boshqa
organlardan ma'lumot almashinuvi; 3-bosqich — tahlil, xatlov va samarali foydalanish choralari.
Joriy modul ularning barchasi uchun tayanch reyestr bo'lib xizmat qiladi.
