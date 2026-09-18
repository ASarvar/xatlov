# Postman bilan tekshirish

Bu katalogda API ning **barcha modullari** uchun tayyor Postman kolleksiyasi bor.
Har bir so'rovga testlar yozilgan, shuning uchun Collection Runner'da bir tugma bilan
butun tizimni tekshirish mumkin.

| Fayl | Nima |
|---|---|
| `xatlov.postman_collection.json` | kolleksiya: 6 ta papka, 23 ta so'rov, 52 ta tekshiruv |
| `xatlov.local.postman_environment.json` | lokal muhit (`http://localhost:3000`) |
| `xatlov.server.postman_environment.json` | server muhiti (`http://127.0.0.1:9091`) |

## 1. Import qilish

Postman → **Import** → ikkala faylni (kolleksiya + kerakli environment) tashlang.
So'ng o'ng yuqoridagi ro'yxatdan environment'ni tanlang.

## 2. Login/parolni kiritish

Environment'dagi `login` va `parol` — serverdagi `.env` faylning `BASIC_USER` va
`BASIC_PASS` qiymatlari. Basic auth kolleksiya darajasida sozlangan, ya'ni har bir
so'rovga alohida yozish shart emas.

## 3. Serverga ulanish

Server ilovasi `127.0.0.1:9091` ga bog'langan (tashqaridan ko'rinmaydi). Postman'ni
o'z kompyuteringizdan ishlatish uchun SSH tunnel oching:

```bash
ssh -L 9091:127.0.0.1:9091 root@markazsrv
```

Tunnel ochiq turganda `http://127.0.0.1:9091` sizning kompyuteringizdan ham ishlaydi.
Nginx sozlangan bo'lsa, `base_url` ni to'g'ridan-to'g'ri domenga qo'ying.

## 4. Ishga tushirish

- **Bitta so'rov:** chapdagi ro'yxatdan tanlab **Send**. Natijani "Test Results"
  bo'limida ko'rasiz.
- **Hammasi birdan:** kolleksiya ustiga bosib → **Run collection** → **Run**.
  So'rovlar yuqoridan pastga, bir-biriga bog'liq tartibda ketadi (yaratilgan yozuvning
  `id` si o'zgaruvchiga saqlanadi).

Kolleksiya `999000001` va `999000002` STIR'laridan foydalanadi va oxirida ularni nofaol
qiladi — xohlagancha qayta ishga tushirsa bo'ladi, baza ifloslanmaydi.

## Nimalar tekshiriladi

| Papka | Tekshiruvlar |
|---|---|
| 0. Holat | `/api/health` (200, `db: true`), parolsiz so'rov → 401 |
| 1. Tashkilotlar | qo'shish, o'sha STIR qayta yuborilganda **yangilanishi**, `?mode=insert` da 409, noto'g'ri STIR da 422, PATCH, PUT, yo'q id da 404 |
| 2. STIR bo'yicha | `by-tin` upsert, olish, qisman yangilash, yo'q STIR da 404 |
| 3. Ommaviy yuklash | bulk (yangi/yangilangan/o'zgarishsiz hisobi), takroriy yuklash idempotentligi, `sync-runs` tarixi |
| 4. Ro'yxat va filtrlar | sahifalash, STIR bo'yicha filtr, nom bo'yicha qidiruv, bo'sh filtrlar |
| 5. Nofaol qilish | `DELETE` → `state = 0`, yozuv saqlanib qolgani |

## Terminal orqali (newman)

Postman'siz, xuddi shu kolleksiyani konsolda ham ishlatish mumkin:

```bash
npx newman run docs/postman/xatlov.postman_collection.json -e docs/postman/xatlov.local.postman_environment.json --env-var parol=SIZNING_PAROL
```

Serverda esa buning o'rniga tezroq variant bor — konteyner ichidagi smoke-test:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T app node scripts/smoke-test.mjs http://127.0.0.1:3000
```
