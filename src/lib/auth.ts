import { timingSafeEqual } from 'node:crypto';

const UNAUTHORIZED = new Response(JSON.stringify({ error: 'Access denied' }), {
  status: 401,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'www-authenticate': 'Basic realm="xatlov", charset="UTF-8"',
  },
});

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Basic auth tekshiruvi. Muvaffaqiyatli bo'lsa `null`, aks holda 401 javob qaytaradi.
 *
 *   const denied = requireBasicAuth(req);
 *   if (denied) return denied;
 */
export function requireBasicAuth(req: Request): Response | null {
  const user = process.env.BASIC_USER;
  const pass = process.env.BASIC_PASS;
  if (!user || !pass) {
    return new Response(JSON.stringify({ error: 'BASIC_USER/BASIC_PASS sozlanmagan' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const header = req.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('basic ')) return UNAUTHORIZED.clone();

  const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return UNAUTHORIZED.clone();

  const name = decoded.slice(0, sep);
  const secret = decoded.slice(sep + 1);

  return safeEqual(name, user) && safeEqual(secret, pass) ? null : UNAUTHORIZED.clone();
}
