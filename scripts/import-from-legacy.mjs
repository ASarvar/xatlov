#!/usr/bin/env node
/**
 * Eski (legacy) PostgreSQL bazasidagi organisations jadvalini yangi tizimga ko'chiradi.
 * Ma'lumot yangi API ning /api/organisations/bulk nuqtasi orqali STIR bo'yicha
 * qo'shiladi yoki yangilanadi, shuning uchun skriptni bir necha marta ishga tushirsa
 * bo'ladi — takrorlar paydo bo'lmaydi.
 *
 *   LEGACY_DATABASE_URL=postgresql://user:parol@127.0.0.1:5432/eski_baza \
 *   node --env-file-if-exists=.env scripts/import-from-legacy.mjs [http://127.0.0.1:9091]
 *
 * Qo'shimcha sozlamalar:
 *   LEGACY_TABLE      — jadval nomi (default: organisations)
 *   IMPORT_CHUNK_SIZE — bir so'rovdagi yozuvlar soni (default: 500)
 *   DRY_RUN=1         — hech narsa yozmaydi, faqat nechta yozuv borligini ko'rsatadi
 */
import pg from 'pg';

const base = process.argv[2] ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:9091';
const legacyUrl = process.env.LEGACY_DATABASE_URL;
const table = process.env.LEGACY_TABLE ?? 'organisations';
const chunkSize = Number(process.env.IMPORT_CHUNK_SIZE ?? 500);
const dryRun = process.env.DRY_RUN === '1';

if (!legacyUrl) {
  console.error('XATO: LEGACY_DATABASE_URL belgilanmagan.');
  console.error('Misol: LEGACY_DATABASE_URL=postgresql://user:parol@127.0.0.1:5432/eski_baza \\');
  console.error('       node scripts/import-from-legacy.mjs http://127.0.0.1:9091');
  process.exit(1);
}

const auth = `Basic ${Buffer.from(
  `${process.env.BASIC_USER ?? 'xatlov'}:${process.env.BASIC_PASS ?? 'change-me'}`,
).toString('base64')}`;

const client = new pg.Client({ connectionString: legacyUrl });
await client.connect();

const { rows } = await client.query(
  `SELECT typeid, source_id, org_name, region_id, district_id, tin, state, soato
     FROM ${table}
    WHERE tin IS NOT NULL
    ORDER BY tin`,
);
await client.end();

console.log(`Eski bazada ${rows.length} ta yozuv topildi (${table}).`);

// Yangi tizim talablariga moslash: STIR 9 xonali bo'lishi shart
const items = [];
const skipped = [];
for (const row of rows) {
  const tin = String(row.tin).trim();
  if (!/^\d{9}$/.test(tin)) {
    skipped.push({ tin: row.tin, org_name: row.org_name });
    continue;
  }
  items.push({
    typeid: row.typeid ?? null,
    source_id: row.source_id == null ? null : String(row.source_id),
    org_name: row.org_name,
    region_id: row.region_id ?? null,
    district_id: row.district_id ?? null,
    tin,
    state: row.state ?? 1,
    soato: row.soato == null ? null : String(row.soato),
  });
}

if (skipped.length) {
  console.log(`\nSTIR formati noto'g'ri bo'lgan ${skipped.length} ta yozuv o'tkazib yuborildi:`);
  for (const s of skipped.slice(0, 20)) console.log(`  ${s.tin} — ${s.org_name}`);
  if (skipped.length > 20) console.log(`  ... va yana ${skipped.length - 20} ta`);
}

if (dryRun) {
  console.log(`\nDRY_RUN: ${items.length} ta yozuv yuborilishi mumkin edi. Hech narsa yozilmadi.`);
  process.exit(0);
}

const total = { received: 0, created: 0, updated: 0, unchanged: 0 };

for (let i = 0; i < items.length; i += chunkSize) {
  const chunk = items.slice(i, i + chunkSize);
  const res = await fetch(`${base}/api/organisations/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ source: 'legacy-api', items: chunk }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`\nXato (${res.status}):`, JSON.stringify(body));
    process.exit(1);
  }

  for (const key of Object.keys(total)) total[key] += body.summary[key];
  console.log(
    `${i + chunk.length}/${items.length} — yangi: ${body.summary.created}, ` +
      `yangilandi: ${body.summary.updated}, o'zgarishsiz: ${body.summary.unchanged}`,
  );
}

console.log('\nYakuniy natija:', total);
if (skipped.length) {
  console.log(`Diqqat: STIR sababli ${skipped.length} ta yozuv ko'chirilmadi — ularni qo'lda tekshiring.`);
}
