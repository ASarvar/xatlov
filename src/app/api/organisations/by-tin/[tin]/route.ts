import { requireBasicAuth } from '@/lib/auth';
import { badRequest, handleError, json, notFound, readJson } from '@/lib/http';
import { getOrganisationByTin, updateOrganisation, upsertOrganisation } from '@/lib/organisations';
import { organisationInputSchema, organisationPatchSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ tin: string }> };

const isTin = (v: string) => /^\d{9}$/.test(v);

/** GET /api/organisations/by-tin/:tin */
export async function GET(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { tin } = await params;
  if (!isTin(tin)) return badRequest("STIR 9 xonali raqam bo'lishi kerak");

  try {
    const row = await getOrganisationByTin(tin);
    return row ? json({ data: row }) : notFound('Tashkilot topilmadi');
  } catch (err) {
    return handleError(err);
  }
}

/**
 * PUT /api/organisations/by-tin/:tin — STIR bo'yicha upsert.
 * Manba tizimi id bilan emas, STIR bilan ishlagani uchun asosiy yangilash nuqtasi shu.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { tin } = await params;
  if (!isTin(tin)) return badRequest("STIR 9 xonali raqam bo'lishi kerak");

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const input = organisationInputSchema.parse({ ...(data as object), tin });
    const { row, action } = await upsertOrganisation(input);
    return json(
      { message: action === 'created' ? 'Success!' : 'Updated!', action, data: row },
      action === 'created' ? 201 : 200,
    );
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/organisations/by-tin/:tin — STIR bo'yicha qisman yangilash */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { tin } = await params;
  if (!isTin(tin)) return badRequest("STIR 9 xonali raqam bo'lishi kerak");

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const patch = organisationPatchSchema.parse(data);
    const existing = await getOrganisationByTin(tin);
    if (!existing) return notFound('Tashkilot topilmadi');

    const row = await updateOrganisation(existing.id, patch);
    return json({ message: 'Updated!', data: row });
  } catch (err) {
    return handleError(err);
  }
}
