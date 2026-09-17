import { ZodError } from 'zod';
import { formatZodError } from '@/lib/validation';

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

export function badRequest(message: string, details?: unknown) {
  return json({ error: message, details }, 400);
}

export function notFound(message = 'Topilmadi') {
  return json({ error: message }, 404);
}

/** So'rov tanasini JSON sifatida o'qiydi; noto'g'ri JSON bo'lsa xato qaytaradi. */
export async function readJson(req: Request): Promise<{ data?: unknown; error?: Response }> {
  try {
    return { data: await req.json() };
  } catch {
    return { error: badRequest("So'rov tanasi yaroqli JSON emas") };
  }
}

interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
  message?: string;
}

/** Zod va PostgreSQL xatolarini bir xil formatdagi HTTP javobga aylantiradi. */
export function handleError(err: unknown): Response {
  if (err instanceof ZodError) {
    return json({ error: "Ma'lumotlar validatsiyadan o'tmadi", details: formatZodError(err) }, 422);
  }

  const pg = err as PgError;
  switch (pg?.code) {
    case '23505':
      return json({ error: 'Bunday STIR allaqachon mavjud', detail: pg.detail }, 409);
    case '23514':
      return json({ error: "Ma'lumot cheklovga mos emas", detail: pg.detail, constraint: pg.constraint }, 400);
    case '22P02':
    case '22003':
      return json({ error: "Maydon qiymati noto'g'ri formatda", detail: pg.detail ?? pg.message }, 400);
    default:
      break;
  }

  console.error('[xatlov] kutilmagan xato:', err);
  return json({ error: 'Ichki server xatosi' }, 500);
}
