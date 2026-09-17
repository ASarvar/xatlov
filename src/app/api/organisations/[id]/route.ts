import { requireBasicAuth } from '@/lib/auth';
import { badRequest, handleError, json, notFound, readJson } from '@/lib/http';
import { getOrganisationById, updateOrganisation } from '@/lib/organisations';
import { organisationInputSchema, organisationPatchSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): string | null {
  return /^\d+$/.test(raw) ? raw : null;
}

/** GET /api/organisations/:id */
export async function GET(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { id } = await params;
  if (!parseId(id)) return badRequest("id butun son bo'lishi kerak");

  try {
    const row = await getOrganisationById(id);
    return row ? json({ data: row }) : notFound('Tashkilot topilmadi');
  } catch (err) {
    return handleError(err);
  }
}

/** PATCH /api/organisations/:id — qisman yangilash */
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { id } = await params;
  if (!parseId(id)) return badRequest("id butun son bo'lishi kerak");

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const patch = organisationPatchSchema.parse(data);
    const row = await updateOrganisation(id, patch);
    return row ? json({ message: 'Updated!', data: row }) : notFound('Tashkilot topilmadi');
  } catch (err) {
    return handleError(err);
  }
}

/** PUT /api/organisations/:id — to'liq yangilash (barcha maydonlar talab qilinadi) */
export async function PUT(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { id } = await params;
  if (!parseId(id)) return badRequest("id butun son bo'lishi kerak");

  const { data, error } = await readJson(req);
  if (error) return error;

  try {
    const input = organisationInputSchema.parse(data);
    const row = await updateOrganisation(id, input);
    return row ? json({ message: 'Updated!', data: row }) : notFound('Tashkilot topilmadi');
  } catch (err) {
    return handleError(err);
  }
}

/**
 * DELETE /api/organisations/:id — yozuvni o'chirmaydi, nofaol holatga o'tkazadi (state = 0).
 * Davlat reyestri tarixi saqlanishi uchun qattiq o'chirish qo'llanilmaydi.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const denied = requireBasicAuth(req);
  if (denied) return denied;

  const { id } = await params;
  if (!parseId(id)) return badRequest("id butun son bo'lishi kerak");

  try {
    const row = await updateOrganisation(id, { state: 0 });
    return row ? json({ message: 'Deactivated!', data: row }) : notFound('Tashkilot topilmadi');
  } catch (err) {
    return handleError(err);
  }
}
