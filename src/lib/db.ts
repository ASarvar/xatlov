import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

declare global {
  var __xatlovPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL muhit o'zgaruvchisi belgilanmagan");
  }

  return new Pool({
    connectionString,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

/**
 * Pool birinchi so'rovda yaratiladi: build (next build) paytida DATABASE_URL
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
