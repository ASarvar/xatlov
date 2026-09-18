import type { PoolClient } from 'pg';
import { query, withTransaction } from '@/lib/db';
import type { ListQuery, OrganisationInput, OrganisationPatch } from '@/lib/validation';
import type { BulkSummary, Organisation, UpsertAction } from '@/types/organisation';

const COLUMNS = `id, typeid, source_id, org_name, region_id, district_id, tin, state, soato,
                 synced_at, created_at, updated_at`;

/** Manbadan keladigan va yangilanishi mumkin bo'lgan maydonlar (tin — tabiiy kalit). */
const MUTABLE_FIELDS = [
  'typeid',
  'source_id',
  'org_name',
  'region_id',
  'district_id',
  'state',
  'soato',
] as const;

export async function listOrganisations(params: ListQuery) {
  const where: string[] = [];
  const values: unknown[] = [];

  if (params.q) {
    values.push(`%${params.q}%`);
    where.push(`(org_name ILIKE $${values.length} OR tin ILIKE $${values.length})`);
  }
  if (params.tin) {
    values.push(params.tin);
    where.push(`tin = $${values.length}`);
  }
  if (params.region_id !== undefined) {
    values.push(params.region_id);
    where.push(`region_id = $${values.length}`);
  }
  if (params.district_id !== undefined) {
    values.push(params.district_id);
    where.push(`district_id = $${values.length}`);
  }
  if (params.typeid !== undefined) {
    values.push(params.typeid);
    where.push(`typeid = $${values.length}`);
  }
  if (params.state !== undefined) {
    values.push(params.state);
    where.push(`state = $${values.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (params.page - 1) * params.limit;

  // sort/order zod enum orqali cheklangan — SQL ga qo'shish xavfsiz
  const { rows } = await query<Organisation & { total: string }>(
    `SELECT ${COLUMNS}, count(*) OVER () AS total
       FROM organisations
       ${whereSql}
      ORDER BY ${params.sort} ${params.order.toUpperCase()}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, params.limit, offset],
  );

  const total = rows.length ? Number(rows[0].total) : 0;
  const items = rows.map((row) => {
    const item = { ...row } as Partial<typeof row>;
    delete item.total;
    return item as Organisation;
  });

  return { items, total, page: params.page, limit: params.limit, pages: Math.ceil(total / params.limit) };
}

export async function getOrganisationById(id: string | number): Promise<Organisation | null> {
  const { rows } = await query<Organisation>(`SELECT ${COLUMNS} FROM organisations WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getOrganisationByTin(tin: string): Promise<Organisation | null> {
  const { rows } = await query<Organisation>(`SELECT ${COLUMNS} FROM organisations WHERE tin = $1`, [tin]);
  return rows[0] ?? null;
}

/** Bitta yozuvni qo'shadi; STIR allaqachon mavjud bo'lsa — yangilaydi (upsert). */
export async function upsertOrganisation(
  input: OrganisationInput,
): Promise<{ row: Organisation; action: Exclude<UpsertAction, 'unchanged'> }> {
  const { rows } = await query<Organisation & { inserted: boolean }>(
    `INSERT INTO organisations (typeid, source_id, org_name, region_id, district_id, tin, state, soato)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (tin) DO UPDATE SET
       typeid      = EXCLUDED.typeid,
       source_id   = EXCLUDED.source_id,
       org_name    = EXCLUDED.org_name,
       region_id   = EXCLUDED.region_id,
       district_id = EXCLUDED.district_id,
       state       = EXCLUDED.state,
       soato       = EXCLUDED.soato,
       synced_at   = now()
     RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
    [
      input.typeid ?? null,
      input.source_id ?? null,
      input.org_name,
      input.region_id ?? null,
      input.district_id ?? null,
      input.tin,
      input.state,
      input.soato ?? null,
    ],
  );

  const { inserted, ...row } = rows[0];
  return { row: row as Organisation, action: inserted ? 'created' : 'updated' };
}

/** Faqat berilgan maydonlarni yangilaydi (PATCH/PUT). */
export async function updateOrganisation(
  id: string | number,
  patch: OrganisationPatch,
): Promise<Organisation | null> {
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const field of MUTABLE_FIELDS) {
    if (patch[field] !== undefined) {
      values.push(patch[field] ?? null);
      sets.push(`${field} = $${values.length}`);
    }
  }
  // STIR ni ham tuzatishga ruxsat (manbada xato kiritilgan holatlar uchun)
  if (patch.tin !== undefined) {
    values.push(patch.tin);
    sets.push(`tin = $${values.length}`);
  }

  if (!sets.length) return getOrganisationById(id);

  values.push(id);
  const { rows } = await query<Organisation>(
    `UPDATE organisations
        SET ${sets.join(', ')}
      WHERE id = $${values.length}
      RETURNING ${COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}

/**
 * "Davlat mulki" AT dan kelgan ro'yxatni ommaviy yuklash (upsert).
 * Bitta SQL da: avval eski holat bilan solishtiriladi (diff), keyin qo'shiladi/yangilanadi.
 */
export async function upsertOrganisationsBulk(
  items: OrganisationInput[],
  source = 'davlat-mulki',
): Promise<{ summary: BulkSummary; runId: string; actions: Record<string, UpsertAction> }> {
  const payload = items.map((i) => ({
    typeid: i.typeid ?? null,
    source_id: i.source_id ?? null,
    org_name: i.org_name,
    region_id: i.region_id ?? null,
    district_id: i.district_id ?? null,
    tin: i.tin,
    state: i.state,
    soato: i.soato ?? null,
  }));

  return withTransaction(async (client: PoolClient) => {
    const run = await client.query<{ id: string }>(
      `INSERT INTO sync_runs (source, received) VALUES ($1, $2) RETURNING id`,
      [source, items.length],
    );
    const runId = run.rows[0].id;

    const { rows } = await client.query<{ tin: string; action: UpsertAction }>(
      `WITH incoming AS (
         SELECT DISTINCT ON (tin) *
           FROM jsonb_to_recordset($1::jsonb) AS x(
             typeid int, source_id text, org_name text, region_id int,
             district_id int, tin varchar(9), state smallint, soato varchar(20))
          ORDER BY tin
       ),
       diff AS (
         SELECT i.tin,
                CASE
                  WHEN o.id IS NULL THEN 'created'
                  WHEN (o.typeid, o.source_id, o.org_name, o.region_id, o.district_id, o.state, o.soato)
                       IS DISTINCT FROM
                       (i.typeid, i.source_id, i.org_name, i.region_id, i.district_id, i.state, i.soato)
                    THEN 'updated'
                  ELSE 'unchanged'
                END AS action
           FROM incoming i
           LEFT JOIN organisations o ON o.tin = i.tin
       ),
       ups AS (
         INSERT INTO organisations (typeid, source_id, org_name, region_id, district_id, tin, state, soato)
         SELECT typeid, source_id, org_name, region_id, district_id, tin, COALESCE(state, 1), soato
           FROM incoming
         ON CONFLICT (tin) DO UPDATE SET
           typeid      = EXCLUDED.typeid,
           source_id   = EXCLUDED.source_id,
           org_name    = EXCLUDED.org_name,
           region_id   = EXCLUDED.region_id,
           district_id = EXCLUDED.district_id,
           state       = EXCLUDED.state,
           soato       = EXCLUDED.soato,
           synced_at   = now()
         RETURNING id
       )
       SELECT d.tin, d.action
         FROM diff d
        WHERE (SELECT count(*) FROM ups) >= 0`,
      [JSON.stringify(payload)],
    );

    const actions: Record<string, UpsertAction> = {};
    const summary: BulkSummary = { received: items.length, created: 0, updated: 0, unchanged: 0 };
    for (const row of rows) {
      actions[row.tin] = row.action;
      summary[row.action] += 1;
    }

    await client.query(
      `UPDATE sync_runs
          SET created_count = $2, updated_count = $3, unchanged_count = $4, finished_at = now()
        WHERE id = $1`,
      [runId, summary.created, summary.updated, summary.unchanged],
    );

    return { summary, runId, actions };
  });
}

export async function healthCheck(): Promise<{ ok: boolean; error?: string }> {
  try {
    await query('SELECT 1');
    return { ok: true };
  } catch (err) {
    // Sabab javobda ko'rinsin — aks holda konteyner "unhealthy" bo'ladi-yu, nega ekani noma'lum qoladi
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
