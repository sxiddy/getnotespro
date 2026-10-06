// Owner-only admin API for the store. Send the ADMIN_KEY (Vercel env var) in the "x-admin-key" header.
//   GET  /api/admin -> { products, totals, payments, students, now }
//   POST /api/admin { action, ... }:
//   GET  /api/admin?part=visits -> { sites: [{ code, name, ok, error?, visits: {day: n}, funnel }] }  visitors counted by each notes website itself (store visits are not counted)
//     grant { email, product }      give Pro for one subject without a payment (recorded as manual)
//     revoke { email, product }     take Pro for one subject away
//     lookup { email }              everything about one student
//     refund { email, product, amount? (paise; empty = full), reason }   refund through Razorpay; a full refund ends Pro
//     reconcile { days? }           ask Razorpay for recent payments of this store, record any that are missing and fill in missing phone numbers
const { send, body, env, safeEqual, normEmail, isStudentEmail, isProduct, PRODUCTS, priceOf, razorpay, recordPaid, recordRefund, DOMAIN, handle } = require('./_lib');
const store = require('./_store');

const codes = Object.keys(PRODUCTS);

// each notes website counts its own visitors; ask each one for its numbers with the shared admin key
async function siteVisits() {
  return Promise.all(codes.map(async (code) => {
    const p = PRODUCTS[code], out = { code, name: p.name, ok: false, visits: {}, funnel: null };
    try {
      const r = await fetch(p.site + '/api/stats', { headers: { 'x-admin-key': env('ADMIN_KEY') }, signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { out.error = r.status === 401 ? 'That site has a different ADMIN_KEY.' : (j.error || 'HTTP ' + r.status); return out; }
      out.ok = true; out.visits = j.visits || {}; out.funnel = j.funnel || null;
    } catch (e) { out.error = 'Could not reach the site.'; }
    return out;
  }));
}
const parse = (s) => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };

async function snapshot() {
  const res = await store.pipeline([...codes.map((c) => ['HGETALL', 'paid:' + c]), ['HGETALL', 'userFirst'], ['HGETALL', 'userLogin'], ['HGETALL', 'userLogins'], ...codes.map((c) => ['HGETALL', 'refunded:' + c]), ['HGETALL', 'refunds']]);
  const flat = (l) => { const o = {}; for (let i = 0; l && i < l.length; i += 2) o[l[i]] = l[i + 1]; return o; };
  const paid = {}; codes.forEach((c, i) => { paid[c] = flat(res[i]); });
  const first = flat(res[codes.length]), last = flat(res[codes.length + 1]), logins = flat(res[codes.length + 2]);
  const refd = {}; codes.forEach((c, i) => { refd[c] = flat(res[codes.length + 3 + i]); });
  const refunds = Object.values(flat(res[codes.length * 2 + 3])).map(parse).sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const payments = [];
  const per = codes.map((c) => ({ code: c, name: PRODUCTS[c].name, price: priceOf(c), count: 0, manual: 0, revenue: 0 }));
  codes.forEach((c, i) => {
    for (const email in paid[c]) {
      const x = parse(paid[c][email]);
      payments.push({ email, product: c, id: x.id || '', at: x.at || '', amount: x.amount || 0, manual: !!x.manual, order: x.order || '', method: x.method || '', contact: x.contact || '', status: x.manual ? 'manual' : 'paid' });
      if (x.manual) per[i].manual++; else { per[i].count++; per[i].revenue += x.amount || 0; }
    }
  });
  codes.forEach((c) => {
    for (const email in refd[c]) { const x = parse(refd[c][email]); payments.push({ email, product: c, id: x.id || '', at: x.at || '', amount: x.amount || 0, manual: false, order: x.order || '', method: x.method || '', contact: x.contact || '', status: 'refunded', refundedAt: x.refundedAt || '' }); }
  });
  payments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const emails = new Set([...Object.keys(first), ...Object.keys(last), ...codes.flatMap((c) => Object.keys(paid[c]))]);
  const students = [...emails].map((email) => ({
    email, first: first[email] || null, last: last[email] || null, logins: parseInt(logins[email], 10) || 0, owned: codes.filter((c) => email in paid[c]),
  })).sort((a, b) => String(b.last || b.first || '').localeCompare(String(a.last || a.first || ''))).slice(0, 3000);
  const real = per.reduce((n, p) => n + p.revenue, 0);
  return { products: per, totals: { revenue: real, payments: per.reduce((n, p) => n + p.count, 0), manual: per.reduce((n, p) => n + p.manual, 0), students: emails.size, refunded: refunds.reduce((n, r) => n + (r.amount || 0), 0), refunds: refunds.length }, payments: payments.slice(0, 1500), refunds: refunds.slice(0, 500), students };
}

async function reconcile(days) {
  const from = Math.floor(Date.now() / 1000) - Math.min(Math.max(days || 30, 1), 90) * 86400;
  let found = 0, added = 0, skipped = 0, filled = 0;
  for (let skip = 0; skip < 500; skip += 100) {
    const r = await razorpay('GET', `/payments?count=100&skip=${skip}&from=${from}`);
    const items = r.items || [];
    for (const p of items) {
      const n = p.notes || {};
      if (n.product !== 'pro-store' || !isProduct(n.item)) continue;
      if ((p.amount_refunded || 0) > 0) { // refunded in Razorpay: a full refund ends Pro here too
        await recordRefund({ email: normEmail(n.email), code: n.item, paymentId: p.id, refundId: 'rf_' + p.id, amount: p.amount_refunded, full: p.amount_refunded >= p.amount, reason: 'refund in Razorpay', by: 'razorpay' });
        continue;
      }
      if (p.status !== 'captured') continue;
      found++;
      const email = normEmail(n.email);
      if (!isStudentEmail(email)) { skipped++; continue; }
      const [has, rec] = await store.pipeline([['HEXISTS', 'paid:' + n.item, email], ['HGET', 'paid:' + n.item, email]]);
      if (has === 1 || has === '1') { // already recorded: just add the phone number if it was saved without one
        const x = parse(rec);
        if (!x.contact && p.contact) { x.contact = p.contact; await store.pipeline([['HSET', 'paid:' + n.item, email, JSON.stringify(x)]]); filled++; }
        continue;
      }
      await recordPaid(email, n.item, p); added++;
    }
    if (items.length < 100) break;
  }
  return { found, added, skipped, filled };
}

module.exports = handle(async (req, res) => {
  const key = String(req.headers['x-admin-key'] || '');
  let expected; try { expected = env('ADMIN_KEY'); } catch (e) { return send(res, 500, { error: 'ADMIN_KEY is not set on the server yet.' }); }
  if (!key || !safeEqual(key, expected)) return send(res, 401, { error: 'Wrong admin key.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });

  if (req.method === 'GET' && new URL(req.url, 'http://x').searchParams.get('part') === 'visits') return send(res, 200, { sites: await siteVisits(), now: new Date().toISOString() });
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
  if (a === 'refund') {
    const [rec] = await store.pipeline([['HGET', 'paid:' + b.product, email]]);
    if (rec == null) return send(res, 404, { error: 'No active payment for that student and subject (already refunded, or never paid).' });
    const x = parse(rec);
    if (x.manual || !/^pay_/.test(x.id || '')) return send(res, 400, { error: 'That access was given manually, so there is no payment to refund. Use Remove Pro.' });
    const paise = parseInt(b.amount, 10), full = !(paise > 0) || paise >= x.amount;
    if (!full && paise < 100) return send(res, 400, { error: 'A partial refund must be at least ₹1.' });
    const reason = String(b.reason || '').slice(0, 200);
    const rf = await razorpay('POST', '/payments/' + x.id + '/refund', Object.assign({ notes: { reason, by: 'admin', product: 'pro-store', email } }, full ? {} : { amount: paise }));
    const log = await recordRefund({ email, code: b.product, paymentId: x.id, refundId: rf.id, amount: rf.amount || (full ? x.amount : paise), full, reason, by: 'admin' });
    return send(res, 200, { ok: true, refund: log, status: rf.status });
  }
  if (a === 'grant') {
    await store.pipeline([['HSET', 'paid:' + b.product, email, JSON.stringify({ id: 'manual', at: new Date().toISOString(), amount: 0, manual: true })]]);
    return send(res, 200, { ok: true });
  }
  if (a === 'revoke') { await store.pipeline([['HDEL', 'paid:' + b.product, email]]); return send(res, 200, { ok: true }); }
  send(res, 400, { error: 'Unknown action.' });
});
