import { requireBasicAuth } from '@/lib/auth';
import { handleError, json, readJson } from '@/lib/http';
import { upsertOrganisationsBulk } from '@/lib/organisations';
import { organisationBulkSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/organisations/bulk — "Davlat mulki" AT dan olingan ro'yxatni
 * bir martada yuklash. Har bir yozuv STIR bo'yicha qo'shiladi yoki yangilanadi.
 *
 * Body: { "source": "davlat-mulki", "items": [ { ...organisation }, ... ] }
 * Yoki to'g'ridan-to'g'ri massiv: [ { ...organisation }, ... ]
 */
export async function POST(req: Request) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const body = Array.isArray(data) ? { items: data } : data;
    const { items, source } = organisationBulkSchema.parse(body);
    const { summary, runId, actions } = await upsertOrganisationsBulk(items, source);

    return json({ message: 'Success!', run_id: runId, summary, actions }, 200);
  } catch (err) {
    return handleError(err);
  }
}
