// GET /api/entitlement?product=<CODE>&email=<email>  ->  { paid: true|false }
// Called server-to-server by the subject sites to ask whether a student bought Pro for that subject here.
// Needs the header  Authorization: Bearer <STORE_SECRET>  (the same secret is set on the store and on each subject site).
//
// GET /api/entitlement?product=<CODE>&sales=1[&email=<email>]  ->  that subject's sales, for the subject site's admin page
//   { product, totals: { count, revenue, manual, refunds, refunded }, payments: [...], refunds: [...] }  (amounts in paise)
//   Counted exactly like the Notix admin page (api/admin.js snapshot): a subject bought in a cart counts its own share,
//   access given by hand is not revenue, and a fully refunded payment moves from "paid" to "refunded".
//
// POST /api/notify (rewritten here) { code, kind, topic?, tab?, text, email?, contact? }  a subject site got a Help?/idea
//   message: Telegram the owner. Same Bearer STORE_SECRET. At most 30 a subject per hour.
const { send, body, env, safeEqual, normEmail, isProduct, isLive, handle } = require('./_lib');
const { telegram, esc } = require('./_notify');
const KINDS = { mistake: 'Mistake in the notes', suggestion: 'Suggestion', bug: "Something isn't working", other: 'Other', idea: 'Idea' };
const store = require('./_store');

const parse = (s) => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
const pairs = (l) => { const o = {}; for (let i = 0; l && i < l.length; i += 2) o[l[i]] = l[i + 1]; return o; };

async function sales(code, only) {
  const [p, r, rf] = await store.pipeline([['HGETALL', 'paid:' + code], ['HGETALL', 'refunded:' + code], ['HGETALL', 'refunds']]);
  const paid = pairs(p), refd = pairs(r), payments = [];
  const totals = { count: 0, revenue: 0, manual: 0, refunds: 0, refunded: 0 };
  for (const email in paid) {
    const x = parse(paid[email]), live = isLive(paid[email]);
    if (x.manual) { if (live) totals.manual++; } else { totals.count++; totals.revenue += x.amount || 0; }
    payments.push({ email, id: x.id || '', at: x.at || '', amount: x.amount || 0, manual: !!x.manual, bundle: !!x.bundle, until: x.until || 0, status: x.manual ? (live ? 'manual' : 'expired') : 'paid' });
  }
  for (const email in refd) {
    const x = parse(refd[email]);
    payments.push({ email, id: x.id || '', at: x.at || '', amount: x.amount || 0, manual: false, bundle: !!x.bundle, until: 0, status: 'refunded', refundedAt: x.refundedAt || '' });
  }
  const refunds = Object.values(pairs(rf)).map(parse).filter((x) => x.product === code)
    .map((x) => ({ email: x.email || '', payment: x.payment || '', amount: x.amount || 0, full: !!x.full, at: x.at || '', reason: x.reason || '' }));
  refunds.forEach((x) => { totals.refunds++; totals.refunded += x.amount; });
  payments.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  refunds.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const mine = (l) => (only ? l.filter((x) => x.email === only) : l);
  return { product: code, totals, payments: mine(payments).slice(0, 3000), refunds: mine(refunds).slice(0, 500) };
}

module.exports = handle(async (req, res) => {
  const secret = env('STORE_SECRET');
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(got, secret)) return send(res, 401, { error: 'Not allowed.' });
  if (req.method === 'POST') {
    const b = await body(req), code = String(b.code || '');
    if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
    if (store.configured()) {
      const k = 'rl:notify:' + code + ':' + new Date().toISOString().slice(0, 13);
      const [n] = await store.pipeline([['INCR', k], ['EXPIRE', k, 3600]]);
      if (n > 30) return send(res, 200, { ok: true, skipped: true });
    }
    const where = b.topic ? ' · ' + esc(String(b.topic).slice(0, 60)) + (b.tab ? ' › ' + esc(String(b.tab).slice(0, 120)) : '') : '';
    const who = [b.email, b.contact].filter(Boolean).map((x) => esc(String(x).slice(0, 120))).join(' · ') || 'no email';
    const sent = await telegram((b.kind === 'idea' ? '💡' : '📩') + ' <b>' + esc(code) + '</b> · ' + esc(KINDS[b.kind] || 'Message') + where + '\n' + who + '\n\n' + esc(String(b.text || '').slice(0, 1500)) + '\n\n<i>Answer it in Notix admin → Inbox</i>');
    return send(res, 200, { ok: true, sent });
  }
  const q = new URL(req.url, 'http://x').searchParams, code = q.get('product'), email = normEmail(q.get('email'));
  if (q.get('sales')) {
    if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject code.' });
    if (!store.configured()) return send(res, 503, { error: 'The Notix store has no database connected.' });
    return send(res, 200, await sales(code, email || null));
  }
  if (!isProduct(code) || !email) return send(res, 400, { error: 'Bad request.' });
  if (!store.configured()) return send(res, 200, { paid: false });
  const [rec] = await store.pipeline([['HGET', 'paid:' + code, email]]);
  send(res, 200, { paid: isLive(rec) });
});
