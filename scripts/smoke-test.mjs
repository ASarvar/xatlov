#!/usr/bin/env node
/**
 * Ishga tushgan ilovani uchdan-uchga tekshiradi (smoke test).
 *
 *   node --env-file-if-exists=.env scripts/smoke-test.mjs [http://localhost:3000]
 *
 * Test yozuvlari 999xxxxxx STIR diapazonidan foydalanadi va oxirida nofaol
 * (state = 0) qilinadi, shuning uchun skriptni xohlagancha qayta ishga tushirsa bo'ladi.
 */
const base = process.argv[2] ?? process.env.API_BASE_URL ?? 'http://localhost:3000';
const user = process.env.BASIC_USER ?? 'xatlov';
const pass = process.env.BASIC_PASS ?? 'change-me';
const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

const TIN_A = '999000001';
const TIN_B = '999000002';

let passed = 0;
let failed = 0;

function check(name, ok, info = '') {
  if (ok) {
    passed += 1;
    console.log(`  OK   ${name}`);
  } else {
    failed += 1;
    console.log(`  XATO ${name}${info ? ` — ${info}` : ''}`);
  }
}

async function call(method, path, body, withAuth = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(withAuth ? { authorization: auth } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* javob JSON bo'lmasligi mumkin (masalan, HTML sahifa) */
  }
  return { status: res.status, body: json };
}

const org = (tin, name) => ({
  typeid: 9,
  source_id: `SMOKE-${tin}`,
  org_name: name,
  region_id: 26,
  district_id: 263,
  tin,
  soato: '1726269',
});

console.log(`Manzil: ${base}\n`);

// 1. Holat
const health = await call('GET', '/api/health', null, false);
check('health: 200 va db=true', health.status === 200 && health.body?.db === true, JSON.stringify(health.body));

// 2. Himoya
const noAuth = await call('GET', '/api/organisations', null, false);
check('auth: parolsiz so\'rov 401', noAuth.status === 401, `status=${noAuth.status}`);

// 3. Validatsiya
const badTin = await call('POST', '/api/organisations', { org_name: 'Test', tin: '123' });
check('validatsiya: noto\'g\'ri STIR 422', badTin.status === 422, `status=${badTin.status}`);

// 4. Qo'shish yoki yangilash (upsert)
const created = await call('POST', '/api/organisations', org(TIN_A, 'Smoke test tashkiloti'));
check(
  'POST /organisations: yozuv yaratildi yoki yangilandi',
  [200, 201].includes(created.status) && created.body?.data?.tin === TIN_A,
  `status=${created.status}`,
);
const id = created.body?.data?.id;

// 5. O'sha STIR qayta yuborilsa — yangilanadi, dublikat yaratilmaydi
const upserted = await call('POST', '/api/organisations', org(TIN_A, 'Smoke test tashkiloti (yangilandi)'));
check(
  'POST /organisations: mavjud STIR yangilandi (dublikat yo\'q)',
  upserted.status === 200 &&
    upserted.body?.action === 'updated' &&
    upserted.body?.data?.id === id &&
    upserted.body?.data?.org_name.includes('yangilandi'),
  JSON.stringify(upserted.body?.action),
);

// 6. Qat'iy qo'shish rejimi
const dup = await call('POST', '/api/organisations?mode=insert', org(TIN_A, 'Dublikat'));
check('POST ?mode=insert: dublikatda 409', dup.status === 409, `status=${dup.status}`);

// 7. Qisman yangilash
const patched = await call('PATCH', `/api/organisations/${id}`, { org_name: 'Smoke test tashkiloti (PATCH)' });
check(
  'PATCH /organisations/:id: nom yangilandi',
  patched.status === 200 && patched.body?.data?.org_name.includes('PATCH'),
  `status=${patched.status}`,
);

// 8. STIR bo'yicha upsert
const byTin = await call('PUT', `/api/organisations/by-tin/${TIN_B}`, org(TIN_B, 'Smoke test tashkiloti B'));
check(
  'PUT /organisations/by-tin/:tin: STIR bo\'yicha upsert',
  [200, 201].includes(byTin.status) && byTin.body?.data?.tin === TIN_B,
  `status=${byTin.status}`,
);

// 9. Ommaviy yuklash: 1 ta o'zgargan + 1 ta o'zgarishsiz
const bulk = await call('POST', '/api/organisations/bulk', {
  items: [org(TIN_A, 'Smoke test tashkiloti (BULK)'), org(TIN_B, 'Smoke test tashkiloti B')],
});
check(
  'POST /organisations/bulk: o\'zgarganini va o\'zgarishsizini ajratdi',
  bulk.status === 200 && bulk.body?.summary?.updated === 1 && bulk.body?.summary?.unchanged === 1,
  JSON.stringify(bulk.body?.summary),
);

// 10. Takroran yuborilsa — hammasi o'zgarishsiz (idempotent)
const bulkAgain = await call('POST', '/api/organisations/bulk', {
  items: [org(TIN_A, 'Smoke test tashkiloti (BULK)'), org(TIN_B, 'Smoke test tashkiloti B')],
});
check(
  'POST /organisations/bulk: takroriy yuklash o\'zgarish keltirmadi',
  bulkAgain.body?.summary?.unchanged === 2,
  JSON.stringify(bulkAgain.body?.summary),
);

// 11. Qidiruv va filtr
const search = await call('GET', `/api/organisations?tin=${TIN_A}`);
check(
  'GET /organisations?tin=: filtr ishladi',
  search.status === 200 && search.body?.items?.length === 1 && search.body.items[0].tin === TIN_A,
  `topildi=${search.body?.items?.length}`,
);

// 12. Bo'sh filtrlar — HTML forma bo'sh maydonni ham yuboradi (?q=&page=)
const emptyFilters = await call('GET', '/api/organisations?q=&tin=&page=&region_id=');
check(
  "bo'sh filtrlar (?q=&tin=) xato bermaydi",
  emptyFilters.status === 200 && Array.isArray(emptyFilters.body?.items),
  `status=${emptyFilters.status}`,
);

// 13. Yuklash tarixi
const runs = await call('GET', '/api/sync-runs?limit=1');
check('GET /sync-runs: tarix yozilmoqda', runs.status === 200 && runs.body?.items?.length > 0);

// 14. Nofaol qilish (yozuv o'chirilmaydi)
const removed = await call('DELETE', `/api/organisations/${id}`);
check(
  'DELETE /organisations/:id: state=0 bo\'ldi, yozuv saqlanib qoldi',
  removed.status === 200 && removed.body?.data?.state === 0,
  `status=${removed.status}`,
);

// 15. UI sahifa
const page = await fetch(base);
check('UI: bosh sahifa 200 qaytardi', page.status === 200, `status=${page.status}`);

// 16. Bo'sh qidiruv bilan yuborilgan forma sahifani buzmasligi kerak
const emptySearchPage = await fetch(`${base}/?q=&page=`);
const emptySearchHtml = await emptySearchPage.text();
check(
  "UI: bo'sh qidiruv sahifani buzmadi",
  emptySearchPage.status === 200 && !emptySearchHtml.includes('Bazaga ulanib bo'),
  `status=${emptySearchPage.status}`,
);

// Tozalash: ikkinchi test yozuvini ham nofaol qilamiz
const b = await call('GET', `/api/organisations/by-tin/${TIN_B}`);
if (b.body?.data?.id) await call('DELETE', `/api/organisations/${b.body.data.id}`);

console.log(`\nNatija: ${passed} ta muvaffaqiyatli, ${failed} ta xato`);
console.log(`Test yozuvlari (${TIN_A}, ${TIN_B}) nofaol holatda qoldi.`);
process.exit(failed ? 1 : 0);
