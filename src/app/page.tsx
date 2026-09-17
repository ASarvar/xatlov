import { query } from '@/lib/db';
import { listOrganisations } from '@/lib/organisations';
import { listQuerySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short' });

async function getStats() {
  const { rows } = await query<{ total: string; active: string; last_sync: string | null }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE state = 1)::text AS active,
            max(synced_at)::text AS last_sync
       FROM organisations`,
  );
  return rows[0];
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const page = typeof sp.page === 'string' ? sp.page : '1';

  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  let result: Awaited<ReturnType<typeof listOrganisations>> | null = null;
  let dbError: string | null = null;

  try {
    const params = listQuerySchema.parse({ q, page, limit: '20', sort: 'id', order: 'desc' });
    [stats, result] = await Promise.all([getStats(), listOrganisations(params)]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (dbError || !stats || !result) {
    return (
      <section className="card" style={{ marginTop: 24 }}>
        <h2>Bazaga ulanib bo&apos;lmadi</h2>
        <p className="muted">{dbError}</p>
        <p>
          <code>docker compose up -d</code> buyrug&apos;i bilan bazani ishga tushiring va{' '}
          <code>DATABASE_URL</code> ni tekshiring.
        </p>
      </section>
    );
  }

  const hasPrev = result.page > 1;
  const hasNext = result.page < result.pages;
  const link = (p: number) => `/?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="muted">Jami tashkilot</div>
          <div className="value">{Number(stats.total).toLocaleString('uz-UZ')}</div>
        </div>
        <div className="card">
          <div className="muted">Faol (state = 1)</div>
          <div className="value">{Number(stats.active).toLocaleString('uz-UZ')}</div>
        </div>
        <div className="card">
          <div className="muted">Oxirgi sinxronizatsiya</div>
          <div className="value" style={{ fontSize: 16 }}>
            {stats.last_sync ? dateFmt.format(new Date(stats.last_sync)) : '—'}
          </div>
        </div>
      </div>

      <form className="toolbar" action="/" method="get">
        <input type="search" name="q" defaultValue={q ?? ''} placeholder="Nomi yoki STIR bo'yicha qidirish" />
        <button type="submit">Qidirish</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>STIR</th>
            <th>Tashkilot nomi</th>
            <th>Viloyat</th>
            <th>Tuman</th>
            <th>MHOBT</th>
            <th>Holat</th>
            <th>Yangilangan</th>
          </tr>
        </thead>
        <tbody>
          {result.items.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                Ma&apos;lumot yo&apos;q. <code>POST /api/organisations/bulk</code> orqali yuklang.
              </td>
            </tr>
          )}
          {result.items.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.tin}</td>
              <td>{o.org_name}</td>
              <td>{o.region_id ?? '—'}</td>
              <td>{o.district_id ?? '—'}</td>
              <td>{o.soato ?? '—'}</td>
              <td>{o.state === 1 ? 'Faol' : 'Nofaol'}</td>
              <td>{dateFmt.format(new Date(o.updated_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager">
        <span className="muted">
          {result.total.toLocaleString('uz-UZ')} tadan {result.page}-sahifa ({result.pages || 1} sahifa)
        </span>
        <span style={{ flex: 1 }} />
        {hasPrev && (
          <a className="btn secondary" href={link(result.page - 1)}>
            ← Oldingi
          </a>
        )}
        {hasNext && (
          <a className="btn secondary" href={link(result.page + 1)}>
            Keyingi →
          </a>
        )}
      </div>
    </>
  );
}
