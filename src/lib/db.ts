import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

declare global {
  var __xatlovPool: Pool | undefined;
}

/**
 * Ulanish sozlamalari.
 *
 * DATABASE_URL berilgan bo'lsa — o'sha ishlatiladi. Aks holda alohida o'zgaruvchilardan
 * yig'iladi (PGHOST/POSTGRES_USER/...). Docker'da aynan shu ikkinchi yo'l ishlatiladi:
 * parolda `/`, `+`, `=` kabi belgilar bo'lsa, ularni URL ichiga qo'yib bo'lmaydi —
 * `postgresql://user:a/b@db/xatlov` yaroqsiz URL hisoblanadi.
 */
function connectionConfig(): PoolConfig {
  const url = process.env.DATABASE_URL;
  if (url) return { connectionString: url };

  const host = process.env.PGHOST ?? process.env.POSTGRES_HOST;
  const user = process.env.PGUSER ?? process.env.POSTGRES_USER;
  const database = process.env.PGDATABASE ?? process.env.POSTGRES_DB;
  const password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD;

  if (!host || !user || !database) {
    throw new Error(
      "Baza sozlamalari topilmadi: DATABASE_URL yoki PGHOST/POSTGRES_USER/POSTGRES_DB belgilang",
    );
  }

  return { host, port: Number(process.env.PGPORT ?? 5432), user, password, database };
}

function createPool(): Pool {
  const config = connectionConfig();
  const common = {
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };

  try {
    return new Pool({ ...config, ...common });
  } catch (err) {
    if (config.connectionString) {
      throw new Error(
        "DATABASE_URL ni o'qib bo'lmadi. Parolda `/`, `+`, `@`, `=` kabi belgilar bo'lsa, " +
          "ularni URL-encode qiling yoki DATABASE_URL o'rniga PGHOST/POSTGRES_USER/" +
          `POSTGRES_PASSWORD/POSTGRES_DB dan foydalaning. (${(err as Error).message})`,
      );
    }
    throw err;
  }
}

/**
 * Pool birinchi so'rovda yaratiladi: build (next build) paytida sozlamalar
 * bo'lmasligi mumkin, shuning uchun modul yuklanishida ulanmaymiz.
 * Dev rejimida hot-reload har safar yangi pool ochib yubormasligi uchun global'da saqlanadi.
 */
export function getPool(): Pool {
  if (!globalThis.__xatlovPool) {
    globalThis.__xatlovPool = createPool();
  }
  return globalThis.__xatlovPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
