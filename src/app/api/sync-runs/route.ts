import { requireBasicAuth } from '@/lib/auth';
import { query } from '@/lib/db';
import { handleError, json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/sync-runs — manbadan yuklash sessiyalari tarixi. */
export async function GET(req: Request) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  try {
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 20) || 20, 100);
    const { rows } = await query(
      `SELECT id, source, received, created_count, updated_count, unchanged_count,
              started_at, finished_at
         FROM sync_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );
    return json({ items: rows });
  } catch (err) {
    return handleError(err);
  }
}
