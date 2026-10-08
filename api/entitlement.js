// GET /api/entitlement?product=<CODE>&email=<email>  ->  { paid: true|false }
// Called server-to-server by the subject sites to ask whether a student bought Pro for that subject here.
// Needs the header  Authorization: Bearer <STORE_SECRET>  (the same secret is set on the store and on each subject site).
const { send, env, safeEqual, normEmail, isProduct, isLive, handle } = require('./_lib');
const store = require('./_store');

module.exports = handle(async (req, res) => {
  const secret = env('STORE_SECRET');
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(got, secret)) return send(res, 401, { error: 'Not allowed.', dbg: { ss: secret.length } });
  const q = new URL(req.url, 'http://x').searchParams, code = q.get('product'), email = normEmail(q.get('email'));
  if (!isProduct(code) || !email) return send(res, 400, { error: 'Bad request.' });
  if (!store.configured()) return send(res, 200, { paid: false });
  const [rec] = await store.pipeline([['HGET', 'paid:' + code, email]]);
  send(res, 200, { paid: isLive(rec) });
});
