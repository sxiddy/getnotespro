// Referrals (G8). Run: npm test
// Runs the real handlers (offers ref-me, create-order, verify, admin reconcile/referrals) against the in-memory store
// (tools/fakeredis.js, its own port) and a stand-in for Razorpay, like tests/offers.test.js.
// Rules under test: a friend who buys through a student's link earns that student ONE 50% off reward (whole cart,
// never below ₹1 a subject); only on a verified UPI payment; no self-referral; each buyer credits at most one referrer,
// ever, and only on their first purchase; a reward is spent only by a verified payment, once; one discount per order.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.FAKEREDIS_PORT = '5392';
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5392';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
process.env.SALE_PCT = '50'; // the money tests price every subject at ₹10 (₹20 list, 50% sale)
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ADMIN_KEY = 'test-admin';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'rzp-secret';
for (const k of Object.keys(process.env)) if (/^PRICE_|^TELEGRAM_|^REVIEW_CODE$/.test(k)) delete process.env[k];

const fakeStore = require('../tools/fakeredis.js');
const lib = require('../api/_lib.js');
const R = require('../api/_referrals.js');

// ------------------------------------------------------------------ Razorpay stand-in (same as offers.test.js)
const realFetch = global.fetch;
const rz = { orders: {}, payments: {}, n: 0 };
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.razorpay.com/v1')) return realFetch(url, opts);
  const path = u.slice('https://api.razorpay.com/v1'.length), body = opts.body ? JSON.parse(opts.body) : null;
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
  let m;
  if (opts.method === 'POST' && path === '/orders') { const o = { id: 'order_R' + ++rz.n, amount: body.amount, currency: body.currency, notes: body.notes }; rz.orders[o.id] = o; return ok(o); }
  if ((m = path.match(/^\/orders\/([^/]+)\/payments$/))) return ok({ items: Object.values(rz.payments).filter((p) => p.order_id === m[1]) });
  if ((m = path.match(/^\/orders\/([^/]+)$/))) return ok(rz.orders[m[1]]);
  if ((m = path.match(/^\/payments\/([^/]+)\/capture$/))) { rz.payments[m[1]].status = 'captured'; return ok(rz.payments[m[1]]); }
  if ((m = path.match(/^\/payments\/([^/?]+)$/))) return ok(rz.payments[m[1]]);
  if (path.startsWith('/payments?')) return ok({ items: Object.values(rz.payments) });
  throw new Error('razorpay stub: no route for ' + opts.method + ' ' + path);
};
function payOrder(orderId, method = 'upi') {
  const o = rz.orders[orderId], id = 'pay_R' + ++rz.n;
  rz.payments[id] = { id, order_id: orderId, amount: o.amount, currency: 'INR', method, status: 'captured', created_at: Math.floor(Date.now() / 1000), notes: { ...o.notes } };
  return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: crypto.createHmac('sha256', 'rzp-secret').update(orderId + '|' + id).digest('hex') };
}
async function call(file, { method = 'POST', body, email, cookie, admin, query = '' } = {}) {
  const handler = require('../api/' + file + '.js');
  const headers = {};
  if (email) headers.cookie = lib.userCookie(email).split(';')[0];
  if (cookie) headers.cookie = cookie;
  if (admin) headers['x-admin-key'] = admin;
  const req = { method, url: '/api/' + file + query, headers, body: body || {}, socket: { remoteAddress: '10.0.1.' + (email ? 1 : 2) } };
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  await handler(req, res);
  return { status: res.statusCode, ...res.body };
}
const st = (n) => n + '.ref2026@vitstudent.ac.in';
const A = st('anna'), B = st('ben'), C = st('cara'), D = st('dev'), E = st('eli'), F = st('fay'), G = st('gus');
const me = (email) => call('offers', { email, body: { action: 'ref-me' } });
const order = (email, products, extra) => call('create-order', { email, body: Object.assign({ products }, extra || {}) });
const verify = (email, orderId, method) => call('verify', { email, body: payOrder(orderId, method) });
const paidRec = async (code, email) => { const [r] = await require('../api/_store.js').pipeline([['HGET', 'paid:' + code, email]]); return r && JSON.parse(r); };

test.after(() => fakeStore.close());

// ------------------------------------------------------------------ the link
test('ref-me: a signed-in student gets one stable link that does not reveal the email', async () => {
  assert.equal((await call('offers', { body: { action: 'ref-me' } })).status, 401, 'needs sign-in');
  const a1 = await me(A), a2 = await me(A), b = await me(B);
  assert.equal(a1.status, 200);
  assert.match(a1.token, /^[A-Za-z0-9_-]{8,16}$/);
  assert.equal(a2.token, a1.token, 'the same link every time');
  assert.notEqual(b.token, a1.token);
  assert.ok(!a1.token.toLowerCase().includes('anna'), 'the token is random, not the email');
  assert.deepEqual([a1.friends, a1.rewards, a1.used], [0, 0, 0]);
  assert.equal(await R.emailOf(a1.token), A);
});

test('ref-me: the review account (not a VIT student) gets no link', async () => {
  process.env.REVIEW_CODE = 'r';
  try {
    const r = await call('offers', { cookie: lib.reviewerCookie().split(';')[0], body: { action: 'ref-me' } });
    assert.equal(r.status, 403);
  } finally { delete process.env.REVIEW_CODE; }
});

// ------------------------------------------------------------------ earning
test('self-referral is ignored, at order time and at payment time', async () => {
  const { token } = await me(G);
  const o = await order(G, ['BAEEE101'], { ref: token });
  assert.equal(o.status, 200);
  assert.equal(rz.orders[o.orderId].notes.ref, undefined, 'own link is not written into the order');
  // even if an order somehow carried the buyer's own token, the payment credits nothing
  rz.orders[o.orderId].notes.ref = token;
  assert.equal((await verify(G, o.orderId)).status, 200);
  assert.equal((await me(G)).friends, 0);
});

test('unknown or malformed ref tokens are ignored, and the friend pays the normal price', async () => {
  const o = await order(F, ['BAEEE101'], { ref: 'nope-not-a-token!' });
  assert.equal(o.status, 200); assert.equal(o.amount, 1000);
  assert.equal(rz.orders[o.orderId].notes.ref, undefined);
  const o2 = await order(F, ['BAEEE101'], { ref: 'AAAAAAAA' }); // well-formed but nobody's
  assert.equal(rz.orders[o2.orderId].notes.ref, undefined);
});

test('a reward is earned only after a verified UPI payment by the friend', async () => {
  const { token } = await me(A);
  const o = await order(B, ['BAEEE101'], { ref: token });
  assert.equal(o.status, 200); assert.equal(o.amount, 1000, 'no friend discount');
  assert.equal(rz.orders[o.orderId].notes.ref, token);
  assert.equal((await me(A)).rewards, 0, 'making an order earns nothing');
  assert.equal((await verify(B, o.orderId, 'card')).status, 402, 'only UPI unlocks');
  assert.equal((await me(A)).rewards, 0, 'a refused payment earns nothing');

  const o2 = await order(B, ['BAEEE101'], { ref: token });
  assert.equal((await verify(B, o2.orderId)).status, 200);
  const a = await me(A);
  assert.equal(a.friends, 1); assert.equal(a.rewards, 1);
  // the same payment reported again (Check my payment / webhook) credits nothing more
  assert.equal((await call('verify', { email: B, body: { action: 'check', orderId: o2.orderId } })).status, 200);
  assert.equal((await me(A)).friends, 1);
});

test('a second purchase by the same buyer does not credit again', async () => {
  const { token } = await me(A);
  const o = await order(B, ['BACHY105'], { ref: token });
  assert.equal(rz.orders[o.orderId].notes.ref, undefined, 'a buyer who bought before is not a new referral');
  // two orders made before either is paid: only the first payment can credit
  const { token: tc } = await me(C);
  const x = await order(D, ['BAEEE101'], { ref: tc }), y = await order(D, ['BACHY105'], { ref: tc });
  assert.equal(rz.orders[y.orderId].notes.ref, tc);
  assert.equal((await verify(D, x.orderId)).status, 200);
  assert.equal((await verify(D, y.orderId)).status, 200);
  assert.equal((await me(C)).friends, 1);
  assert.equal((await me(A)).friends, 1);
});

test('a buyer can only ever credit one referrer', async () => {
  const ta = (await me(A)).token, tc = (await me(C)).token;
  const x = await order(E, ['BAEEE101'], { ref: ta }), y = await order(E, ['BAENG101'], { ref: tc });
  assert.equal((await verify(E, x.orderId)).status, 200);
  assert.equal((await verify(E, y.orderId)).status, 200);
  assert.equal((await me(A)).friends, 2);
  assert.equal((await me(C)).friends, 1, 'C got nothing from E');
  // the record of who E credited is enough on its own, even for a payment that looks like a first purchase
  assert.equal(await R.credit(tc, E, { id: 'pay_Rnew', order_id: 'order_Rnew', method: 'upi' }), false);
  assert.equal((await me(C)).friends, 1);
});

test('a purchase without a link, paid before the linked order, means the linked one is not a first purchase', async () => {
  const tc = (await me(C)).token, K = st('kim');
  const linked = await order(K, ['BAEEE101'], { ref: tc }); // made while K had bought nothing
  assert.equal(rz.orders[linked.orderId].notes.ref, tc);
  const plain = await order(K, ['BACHY105']);
  assert.equal((await verify(K, plain.orderId)).status, 200);
  assert.equal((await verify(K, linked.orderId)).status, 200);
  assert.equal((await me(C)).friends, 1, 'K had already bought, so C earns nothing');
  const later = await order(K, ['BAENG101'], { ref: tc });
  assert.equal(rz.orders[later.orderId].notes.ref, undefined, 'and later orders do not carry the link');
  // a refund of a payment that never credited anyone takes nothing from anyone (D credited C with its first order)
  const dPays = Object.values(rz.payments).filter((p) => p.notes.email === D && p.method === 'upi');
  const second = dPays[dPays.length - 1];
  await lib.recordRefund({ email: D, code: 'BACHY105', paymentId: second.id, refundId: 'rfnd_d2', amount: second.amount, full: true, by: 'admin' });
  assert.equal((await me(C)).friends, 1);
});

test('admin reconcile credits a missed UPI payment, but never a card one', async () => {
  const tg = (await me(G)).token, H = st('hal'), I = st('ivy');
  const h = await order(H, ['BAEEE101'], { ref: tg }), i = await order(I, ['BAEEE101'], { ref: tg });
  payOrder(h.orderId, 'upi'); payOrder(i.orderId, 'card'); // page closed, no webhook
  const r = await call('admin', { admin: 'test-admin', body: { action: 'reconcile', days: 1 } });
  assert.equal(r.status, 200);
  assert.ok(await paidRec('BAEEE101', H));
  assert.equal((await me(G)).friends, 1, 'only the UPI payment counts');
});

// ------------------------------------------------------------------ spending
test('the reward prices the whole cart at 50%, never below ₹1 a subject', async () => {
  const price = (c) => ({ BAEEE101: 1000, BACHY105: 1500, BAENG101: 150 })[c];
  const p = R.priceReward(['BAEEE101', 'BACHY105', 'BAENG101'], price);
  assert.deepEqual(p.lines.map((l) => l.pay), [500, 700, 100], '₹7.50 rounds down to ₹7; ₹0.75 is raised to ₹1');
  assert.equal(p.total, 1300);
  assert.equal(R.priceReward(['BAENG101'], () => 100).discount, 0, 'a ₹1 subject stays ₹1');
});

test('one discount per order: a reward and a code cannot be combined; no reward = refused', async () => {
  await call('offers', { admin: 'test-admin', body: { action: 'offer-add', code: 'STACK10', pct: 10 } });
  const both = await order(A, ['BAEEE101'], { reward: true, code: 'STACK10' });
  assert.equal(both.status, 400); assert.match(both.error, /not both/);
  const none = await order(F, ['BACHY105'], { reward: true });
  assert.equal(none.status, 400); assert.equal(none.badReward, true);
});

test('a failed payment does not spend the reward; a verified one spends it once', async () => {
  process.env.PRICE_BAENG101 = '150';
  try {
    const o = await order(A, ['BAEEE101', 'BAENG101'], { reward: true });
    assert.equal(o.status, 200); assert.equal(o.amount, 600); assert.equal(o.reward, true);
    const n = rz.orders[o.orderId].notes;
    assert.equal(n.reward, 'REF50'); assert.equal(n.shares, '500,100'); assert.equal(n.offer, undefined);
    assert.equal((await verify(A, o.orderId, 'card')).status, 402);
    assert.equal((await me(A)).rewards, 2, 'a failed payment keeps the reward');

    const o2 = await order(A, ['BAEEE101', 'BAENG101'], { reward: true });
    assert.equal((await verify(A, o2.orderId)).status, 200);
    assert.equal((await call('verify', { email: A, body: { action: 'check', orderId: o2.orderId } })).status, 200);
    const a = await me(A);
    assert.equal(a.used, 1, 'spent once even though the payment was reported twice');
    assert.equal(a.rewards, 1);
    assert.equal((await paidRec('BAENG101', A)).amount, 100);
    assert.equal((await paidRec('BAEEE101', A)).offer, 'REF50');
  } finally { delete process.env.PRICE_BAENG101; }
});

test('a full refund of the friend\'s purchase takes the unspent reward back; their purchase still never credits again', async () => {
  const tc = (await me(C)).token, J = st('jo');
  const o = await order(J, ['BAEEE101'], { ref: tc });
  const p = payOrder(o.orderId);
  await call('verify', { email: J, body: p });
  assert.equal((await me(C)).friends, 2);
  await lib.recordRefund({ email: J, code: 'BAEEE101', paymentId: p.razorpay_payment_id, refundId: 'rfnd_1', amount: 1000, full: true, by: 'admin' });
  assert.equal((await me(C)).friends, 1);
  const again = await order(J, ['BAEEE101'], { ref: tc });
  assert.equal(rz.orders[again.orderId].notes.ref, undefined);
});

// ------------------------------------------------------------------ admin
test('admin: referrals list needs the key and shows referrers, buyers and rewards', async () => {
  assert.equal((await call('offers', { method: 'GET', query: '?part=referrals' })).status, 401);
  const r = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=referrals' });
  assert.equal(r.status, 200);
  const a = r.top.find((x) => x.email === A);
  assert.deepEqual([a.friends, a.used, a.rewards], [2, 1, 1]);
  assert.equal(r.top[0].email, A, 'sorted by friends');
  assert.ok(r.buyers.some((x) => x.buyer === B && x.ref === A));
  assert.ok(r.buyers.some((x) => x.buyer === st('jo') && x.revoked));
  assert.equal(r.totals.used, 1);
});
