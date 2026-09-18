#!/usr/bin/env node
/**
 * db/init/*.sql fayllarini tartib bo'yicha bajaradi.
 * Barcha skriptlar idempotent (IF NOT EXISTS / OR REPLACE), shuning uchun
 * mavjud bazada qayta ishga tushirish xavfsiz.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'db', 'init');

/**
 * Ulanish sozlamalari: DATABASE_URL yoki alohida o'zgaruvchilar.
 * (Parolda `/`, `+`, `=` bo'lsa URL yaroqsiz bo'lib qoladi — shuning uchun ikkinchi yo'l.)
 */
function connectionConfig(prefix = '') {
  const url = process.env[`${prefix}DATABASE_URL`];
  if (url) return { connectionString: url };

  const host = process.env[`${prefix}PGHOST`] ?? process.env[`${prefix}POSTGRES_HOST`];
  const user = process.env[`${prefix}PGUSER`] ?? process.env[`${prefix}POSTGRES_USER`];
  const database = process.env[`${prefix}PGDATABASE`] ?? process.env[`${prefix}POSTGRES_DB`];
  const password = process.env[`${prefix}PGPASSWORD`] ?? process.env[`${prefix}POSTGRES_PASSWORD`];

  if (!host || !user || !database) return null;
  return { host, port: Number(process.env[`${prefix}PGPORT`] ?? 5432), user, password, database };
}

const config = connectionConfig();
if (!config) {
  console.error("Baza sozlamalari topilmadi: DATABASE_URL yoki PGHOST/POSTGRES_USER/POSTGRES_DB belgilang");
  process.exit(1);
}

const client = new pg.Client(config);

// Baza konteyneri hali tayyor bo'lmasligi mumkin — bir necha marta urinamiz
async function connectWithRetry(attempts = 20, delayMs = 1500) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`Bazani kutmoqda (${i}/${attempts})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

await connectWithRetry();

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  process.stdout.write(`-> ${file} ... `);
  await client.query(readFileSync(join(dir, file), 'utf8'));
  console.log('ok');
}

await client.end();
console.log(`Migratsiya tugadi (${files.length} ta fayl).`);
