import { requireBasicAuth } from '@/lib/auth';
import { handleError, json, readJson } from '@/lib/http';
import {
  getOrganisationByTin,
  listOrganisations,
  upsertOrganisation,
} from '@/lib/organisations';
import { listQuerySchema, organisationInputSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/organisations — ro'yxat (filtr + sahifalash) */
export async function GET(req: Request) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  try {
    const params = listQuerySchema.parse(
      Object.fromEntries(new URL(req.url).searchParams.entries()),
    );
    return json(await listOrganisations(params));
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/organisations — yangi tashkilot qo'shadi.
 * STIR mavjud bo'lsa, sukut bo'yicha yozuv YANGILANADI (upsert).
 * ?mode=insert bilan chaqirilsa, dublikat holatida 409 qaytadi.
 */
export async function POST(req: Request) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const input = organisationInputSchema.parse(data);
    const mode = new URL(req.url).searchParams.get('mode');

    if (mode === 'insert') {
      const existing = await getOrganisationByTin(input.tin);
      if (existing) {
        return json(
          { error: 'Bunday STIR allaqachon mavjud', data: existing },
          409,
        );
      }
    }

    const { row, action } = await upsertOrganisation(input);
    return json(
      { message: action === 'created' ? 'Success!' : 'Updated!', action, data: row },
      action === 'created' ? 201 : 200,
    );
  } catch (err) {
    return handleError(err);
  }
}
