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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL belgilanmagan');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

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
