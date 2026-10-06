// Owner-only admin API for the store. Send the ADMIN_KEY (Vercel env var) in the "x-admin-key" header.
//   GET  /api/admin -> { products, totals, payments, students, now }
//   POST /api/admin { action, ... }:
//     grant { email, product }      give Pro for one subject without a payment (recorded as manual)
//     revoke { email, product }     take Pro for one subject away
//     lookup { email }              everything about one student
//     reconcile { days? }           ask Razorpay for recent payments of this store and record any that are missing
const { send, body, env, safeEqual, normEmail, isStudentEmail, isProduct, PRODUCTS, priceOf, razorpay, recordPaid, DOMAIN, handle } = require('./_lib');
const store = require('./_store');

const codes = Object.keys(PRODUCTS);
const parse = (s) => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };

async function snapshot() {
  const res = await store.pipeline([...codes.map((c) => ['HGETALL', 'paid:' + c]), ['HGETALL', 'userFirst'], ['HGETALL', 'userLogin'], ['HGETALL', 'userLogins']]);
  const flat = (l) => { const o = {}; for (let i = 0; l && i < l.length; i += 2) o[l[i]] = l[i + 1]; return o; };
  const paid = {}; codes.forEach((c, i) => { paid[c] = flat(res[i]); });
  const first = flat(res[codes.length]), last = flat(res[codes.length + 1]), logins = flat(res[codes.length + 2]);
  const payments = [];
  const per = codes.map((c) => ({ code: c, name: PRODUCTS[c].name, price: priceOf(c), count: 0, manual: 0, revenue: 0 }));
  codes.forEach((c, i) => {
    for (const email in paid[c]) {
      const x = parse(paid[c][email]);
      payments.push({ email, product: c, id: x.id || '', at: x.at || '', amount: x.amount || 0, manual: !!x.manual });
      if (x.manual) per[i].manual++; else { per[i].count++; per[i].revenue += x.amount || 0; }
    }
  });
  payments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const emails = new Set([...Object.keys(first), ...Object.keys(last), ...codes.flatMap((c) => Object.keys(paid[c]))]);
  const students = [...emails].map((email) => ({
    email, first: first[email] || null, last: last[email] || null, logins: parseInt(logins[email], 10) || 0, owned: codes.filter((c) => email in paid[c]),
  })).sort((a, b) => String(b.last || b.first || '').localeCompare(String(a.last || a.first || ''))).slice(0, 3000);
  const real = per.reduce((n, p) => n + p.revenue, 0);
  return { products: per, totals: { revenue: real, payments: per.reduce((n, p) => n + p.count, 0), manual: per.reduce((n, p) => n + p.manual, 0), students: emails.size }, payments: payments.slice(0, 1000), students };
}

async function reconcile(days) {
  const from = Math.floor(Date.now() / 1000) - Math.min(Math.max(days || 30, 1), 90) * 86400;
  let found = 0, added = 0, skipped = 0;
  for (let skip = 0; skip < 500; skip += 100) {
    const r = await razorpay('GET', `/payments?count=100&skip=${skip}&from=${from}`);
    const items = r.items || [];
    for (const p of items) {
      const n = p.notes || {};
      if (n.product !== 'pro-store' || !isProduct(n.item) || p.status !== 'captured') continue;
      found++;
      const email = normEmail(n.email);
      if (!isStudentEmail(email)) { skipped++; continue; }
      const [has] = await store.pipeline([['HEXISTS', 'paid:' + n.item, email]]);
      if (has === 1 || has === '1') continue;
      await recordPaid(email, n.item, p); added++;
    }
    if (items.length < 100) break;
  }
  return { found, added, skipped };
}

module.exports = handle(async (req, res) => {
  const key = String(req.headers['x-admin-key'] || '');
  let expected; try { expected = env('ADMIN_KEY'); } catch (e) { return send(res, 500, { error: 'ADMIN_KEY is not set on the server yet.' }); }
  if (!key || !safeEqual(key, expected)) return send(res, 401, { error: 'Wrong admin key.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });

  if (req.method === 'GET') return send(res, 200, Object.assign(await snapshot(), { now: new Date().toISOString(), domain: DOMAIN }));
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });

  const b = await body(req), a = b.action;
  if (a === 'reconcile') return send(res, 200, Object.assign({ ok: true }, await reconcile(parseInt(b.days, 10))));
  const email = normEmail(b.email);
  if (!isStudentEmail(email)) return send(res, 400, { error: `Enter a student email (…@${DOMAIN}).` });
  if (a === 'lookup') {
    const s = (await snapshot()).students.find((x) => x.email === email) || { email, first: null, last: null, logins: 0, owned: [] };
    const pays = (await snapshot()).payments.filter((p) => p.email === email);
    return send(res, 200, { ok: true, student: s, payments: pays });
  }
  if (!isProduct(b.product)) return send(res, 400, { error: 'Pick a subject.' });
  if (a === 'grant') {
    await store.pipeline([['HSET', 'paid:' + b.product, email, JSON.stringify({ id: 'manual', at: new Date().toISOString(), amount: 0, manual: true })]]);
    return send(res, 200, { ok: true });
  }
  if (a === 'revoke') { await store.pipeline([['HDEL', 'paid:' + b.product, email]]); return send(res, 200, { ok: true }); }
  send(res, 400, { error: 'Unknown action.' });
});
