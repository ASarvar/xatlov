import { json } from '@/lib/http';
import { healthCheck } from '@/lib/organisations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — ilova va bazaning holati (auth talab qilinmaydi). */
export async function GET() {
  const db = await healthCheck();
  return json(
    {
      status: db.ok ? 'ok' : 'degraded',
      db: db.ok,
      ...(db.error ? { error: db.error } : {}),
      time: new Date().toISOString(),
    },
    db.ok ? 200 : 503,
  );
}
