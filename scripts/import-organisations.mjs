#!/usr/bin/env node
/**
 * "Davlat mulki" AT dan olingan JSON faylni /api/organisations/bulk ga yuklaydi.
 *
 *   node --env-file-if-exists=.env scripts/import-organisations.mjs ./data/organisations.json
 *
 * Fayl formati: massiv yoki { "items": [...] }
 * Katta ro'yxat avtomatik bo'laklarga (chunk) bo'lib yuboriladi.
 */
import { readFileSync } from 'node:fs';

const [, , file, baseArg] = process.argv;
if (!file) {
  console.error('Foydalanish: node scripts/import-organisations.mjs <fayl.json> [http://localhost:3000]');
  process.exit(1);
}

const base = baseArg ?? process.env.API_BASE_URL ?? 'http://localhost:3000';
const user = process.env.BASIC_USER ?? 'xatlov';
const pass = process.env.BASIC_PASS ?? 'change-me';
const chunkSize = Number(process.env.IMPORT_CHUNK_SIZE ?? 500);

const parsed = JSON.parse(readFileSync(file, 'utf8'));
const items = Array.isArray(parsed) ? parsed : parsed.items;
if (!Array.isArray(items)) {
  console.error("Faylda 'items' massivi topilmadi");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
const total = { received: 0, created: 0, updated: 0, unchanged: 0 };

for (let i = 0; i < items.length; i += chunkSize) {
  const chunk = items.slice(i, i + chunkSize);
  const res = await fetch(`${base}/api/organisations/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: auth },
    body: JSON.stringify({ source: 'davlat-mulki', items: chunk }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error(`Xato (${res.status}):`, JSON.stringify(body));
    process.exit(1);
  }

  for (const key of Object.keys(total)) total[key] += body.summary[key];
  console.log(
    `${i + chunk.length}/${items.length} — yangi: ${body.summary.created}, ` +
      `yangilandi: ${body.summary.updated}, o'zgarishsiz: ${body.summary.unchanged}`,
  );
}

console.log('Yakuniy natija:', total);
