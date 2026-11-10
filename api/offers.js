// Discount codes (F10). The rules and storage are in api/_offers.js.
//   POST /api/offers { action: 'quote', code, products: [codes] } -> { offer: { code, pct, codes }, lines, total, discount }
//        Anyone (signed in = also checks "already used"). Wrong guesses are limited per visitor: 20 an hour.
//   Referrals (G8, rules in api/_referrals.js; they live here because Vercel allows 12 functions):
//   POST { action: 'ref-me' } -> { token, friends, used, rewards: 0, per, min, earned, withdrawn, balance, withdrawals }
//        signed-in VIT student; the link is <site>/?ref=<token>; money in paise (Rs 3 a friend, withdraw at Rs 15)
//   POST { action: 'ref-withdraw', upi } -> { ok, id, amount, ...ref-me numbers }   whole balance to that UPI ID
//   Admin (header x-admin-key = ADMIN_KEY):
//     GET  /api/offers?part=list -> { items: [{ code, pct, max, until, codes, off, at, note, uses }] }
//     POST { action: 'offer-add', code, pct, max?, days?, codes?, note? }   409 if the code already exists
//     POST { action: 'offer-pause', code, off: true|false }
//     POST { action: 'offer-del', code }   also forgets who used it
//     GET  /api/offers?part=referrals -> { totals: { links, credited, used, left }, top: [{ email, friends, used, rewards }],
//                                         buyers: [{ buyer, ref, payment, at, revoked }], pending: [{ id, email, amount, upi, at }] }
//     POST { action: 'ref-paid', id }   the owner has paid that withdrawal
const { send, body, env, safeEqual, getUser, isStudentEmail, itemsOf, priceOf, handle } = require('./_lib');
const store = require('./_store');
const offers = require('./_offers');
const refs = require('./_referrals');

const MAX_MISSES = 20; // wrong codes per visitor per hour

function isAdmin(req) {
  const key = String(req.headers['x-admin-key'] || '');
  let expected; try { expected = env('ADMIN_KEY'); } catch (e) { return false; }
  return !!key && safeEqual(key, expected);
}
const hour = () => Math.floor(Date.now() / 3600e3);

module.exports = handle(async (req, res) => {
  if (req.method === 'GET') {
    if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin key.' });
    const part = new URL(req.url, 'http://x').searchParams.get('part');
    if (part === 'referrals') return send(res, 200, store.configured() ? await refs.adminList() : { totals: {}, top: [], buyers: [] });
    if (part !== 'list') return send(res, 400, { error: 'Unknown part.' });
    if (!store.configured()) return send(res, 200, { items: [] });
    return send(res, 200, { items: await offers.list(), now: Date.now() });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
  const b = await body(req);

  if (b.action === 'quote') {
    const items = itemsOf((Array.isArray(b.products) ? b.products : []).map(String).join(','));
    if (!items) return send(res, 400, { error: 'Your cart is empty.' });
    if (!offers.normCode(b.code)) return send(res, 400, { error: 'Type a code first.' });
    if (!store.configured()) return send(res, 503, { error: "Codes can't be checked right now. Try again later." });
    const missKey = 'offer-miss:' + store.ipHash(req) + ':' + hour();
    const [misses] = await store.pipeline([['GET', missKey]]);
    if (+misses >= MAX_MISSES) return send(res, 429, { error: 'Too many wrong codes. Try again in an hour.' });
    const u = getUser(req);
    const r = await offers.apply(b.code, items, u ? u.e : '', priceOf);
    if (r.error) {
      await store.pipeline([['INCR', missKey], ['EXPIRE', missKey, 3700]]);
      return send(res, 400, { error: r.error });
    }
    const { code, pct, codes } = r.offer;
    return send(res, 200, Object.assign({ offer: { code, pct, codes } }, r.priced));
  }

  if (b.action === 'ref-me') {
    const u = getUser(req);
    if (!u) return send(res, 401, { error: 'Please sign in with your VIT student account first.' });
    if (!isStudentEmail(u.e)) return send(res, 403, { error: 'Invite links are for VIT student accounts.' });
    if (!store.configured()) return send(res, 503, { error: "Invite links aren't available right now. Try again later." });
    return send(res, 200, Object.assign({ token: await refs.tokenFor(u.e) }, await refs.rewardsOf(u.e)));
  }

  if (b.action === 'ref-withdraw') {
    const u = getUser(req);
    if (!u) return send(res, 401, { error: 'Please sign in with your VIT student account first.' });
    if (!isStudentEmail(u.e)) return send(res, 403, { error: 'Referral cash is for VIT student accounts.' });
    if (!store.configured()) return send(res, 503, { error: "Withdrawals aren't available right now. Try again later." });
    const r = await refs.withdraw(u.e, b.upi);
    if (r.error) return send(res, r.status || 400, { error: r.error });
    return send(res, 200, Object.assign(await refs.rewardsOf(u.e), r));
  }

  if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin key.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });
  if (b.action === 'ref-paid') {
    if (!(await refs.markPaid(b.id))) return send(res, 404, { error: 'No such pending withdrawal.' });
    return send(res, 200, { ok: true });
  }
  if (b.action === 'offer-add') {
    const r = offers.makeOffer(b);
    if (r.error) return send(res, 400, { error: r.error });
    if (!(await offers.add(r.offer))) return send(res, 409, { error: 'That code already exists. Delete it first, or pick another.' });
    return send(res, 200, { ok: true, item: r.offer });
  }
  if (b.action === 'offer-pause') {
    if (!(await offers.setOff(b.code, !!b.off))) return send(res, 404, { error: 'No such code.' });
    return send(res, 200, { ok: true });
  }
  if (b.action === 'offer-del') {
    if (!(await offers.remove(b.code))) return send(res, 404, { error: 'No such code.' });
    return send(res, 200, { ok: true });
  }
  return send(res, 400, { error: 'Unknown action.' });
});
