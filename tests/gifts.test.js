// Gift Pro (G2). Run: npm test
// Runs the real handlers (create-order, verify incl. the webhook, offers, session, admin reconcile/refund/lookup)
// against the in-memory store (tools/fakeredis.js, its own port) and a stand-in for Razorpay, like tests/referrals.test.js.
// Rules under test: a signed-in VIT student pays for Pro for a friend's VIT email. The friend must not already own the
// subject (the buyer's own Pro doesn't matter). Pro is recorded for the RECIPIENT only, with giftFrom = buyer, and only
// on a verified UPI payment, once. Discount codes work on gifts (the BUYER's one use is spent); the 50% referral reward
// does not. A gift never credits a referrer and is never the buyer's own first purchase.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.FAKEREDIS_PORT = '5393';
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5393';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ADMIN_KEY = 'test-admin';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'rzp-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'hook-secret';
for (const k of Object.keys(process.env)) if (/^PRICE_|^TELEGRAM_|^REVIEW_CODE$|^RESEND_/.test(k)) delete process.env[k];

const fakeStore = require('../tools/fakeredis.js');
const lib = require('../api/_lib.js');
const store = require('../api/_store.js');

// ------------------------------------------------------------------ Razorpay stand-in (as in referrals.test.js, plus refunds)
const realFetch = global.fetch;
const rz = { orders: {}, payments: {}, refunds: [], n: 0 };
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.razorpay.com/v1')) return realFetch(url, opts);
  const path = u.slice('https://api.razorpay.com/v1'.length), body = opts.body ? JSON.parse(opts.body) : null;
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
  let m;
  if (opts.method === 'POST' && path === '/orders') { const o = { id: 'order_G' + ++rz.n, amount: body.amount, currency: body.currency, notes: body.notes }; rz.orders[o.id] = o; return ok(o); }
  if ((m = path.match(/^\/orders\/([^/]+)\/payments$/))) return ok({ items: Object.values(rz.payments).filter((p) => p.order_id === m[1]) });
  if ((m = path.match(/^\/orders\/([^/]+)$/))) return ok(rz.orders[m[1]]);
  if ((m = path.match(/^\/payments\/([^/]+)\/capture$/))) { rz.payments[m[1]].status = 'captured'; return ok(rz.payments[m[1]]); }
  if (opts.method === 'POST' && (m = path.match(/^\/payments\/([^/]+)\/refund$/))) {
    const p = rz.payments[m[1]], amount = body.amount || p.amount, rf = { id: 'rfnd_G' + ++rz.n, payment_id: p.id, amount, status: 'processed', notes: body.notes };
    p.amount_refunded = (p.amount_refunded || 0) + amount; rz.refunds.push(rf); return ok(rf);
  }
  if ((m = path.match(/^\/payments\/([^/?]+)$/))) return ok(rz.payments[m[1]]);
  if (path.startsWith('/payments?')) return ok({ items: Object.values(rz.payments) });
  throw new Error('razorpay stub: no route for ' + opts.method + ' ' + path);
};
// the checkout's own payment notes copy the page's (product, item, email); the server must never trust them for the gift
function payOrder(orderId, method = 'upi') {
  const o = rz.orders[orderId], id = 'pay_G' + ++rz.n;
  rz.payments[id] = { id, order_id: orderId, amount: o.amount, currency: 'INR', method, status: 'captured', created_at: Math.floor(Date.now() / 1000), contact: '+919800000000', notes: { product: o.notes.product, item: o.notes.item, email: o.notes.email } };
  return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: crypto.createHmac('sha256', 'rzp-secret').update(orderId + '|' + id).digest('hex') };
}
async function call(file, { method = 'POST', body, email, cookie, admin, query = '', headers: extra } = {}) {
  const handler = require('../api/' + file + '.js');
  const headers = Object.assign({}, extra);
  if (email) headers.cookie = lib.userCookie(email).split(';')[0];
  if (cookie) headers.cookie = cookie;
  if (admin) headers['x-admin-key'] = admin;
  const req = { method, url: '/api/' + file + query, headers, body: body === undefined ? {} : body, socket: { remoteAddress: '10.0.2.' + (email ? 1 : 2) } };
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  await handler(req, res);
  return { status: res.statusCode, ...res.body };
}
const st = (n) => n + '.gift2026@vitstudent.ac.in';
const A = st('ana'), B = st('bo'), C = st('cy'), D = st('di'), E = st('ed'), F = st('flo'), G = st('gia'), H = st('hu');
const order = (email, products, extra) => call('create-order', { email, body: Object.assign({ products }, extra || {}) });
const verify = (email, orderId, method) => call('verify', { email, body: payOrder(orderId, method) });
const check = (email, orderId) => call('verify', { email, body: { action: 'check', orderId } });
const admin = (body) => call('admin', { admin: 'test-admin', body });
const paidRec = async (code, email) => { const [r] = await store.pipeline([['HGET', 'paid:' + code, email]]); return r && JSON.parse(r); };
const refundedRec = async (code, email) => { const [r] = await store.pipeline([['HGET', 'refunded:' + code, email]]); return r && JSON.parse(r); };
const owns = async (email) => lib.ownedBy(email);
const me = (email) => call('offers', { email, body: { action: 'ref-me' } });
async function webhook(event, payload) {
  const raw = JSON.stringify({ event, payload });
  const sig = crypto.createHmac('sha256', 'hook-secret').update(raw).digest('hex');
  return call('verify', { body: raw, headers: { 'x-razorpay-signature': sig } });
}

test.after(() => fakeStore.close());

// ------------------------------------------------------------------ making a gift order
test('a gift needs a signed-in VIT student, and goes to a VIT email that is not the buyer\'s', async () => {
  assert.equal((await call('create-order', { body: { products: ['BAEEE101'], gift: B } })).status, 401, 'needs sign-in');
  for (const bad of ['friend@gmail.com', 'nobody', 'x@vitstudent.ac.in.evil.com', B + ',' + C, '<b>' + B]) {
    const r = await order(A, ['BAEEE101'], { gift: bad });
    assert.equal(r.status, 400, 'should refuse ' + bad); assert.equal(r.badGift, true);
  }
  for (const self of [A, '  ' + A.toUpperCase() + ' ']) {
    const r = await order(A, ['BAEEE101'], { gift: self });
    assert.equal(r.status, 400, 'gift to self: ' + self); assert.match(r.error, /yourself/);
  }
  process.env.REVIEW_CODE = 'r';
  try {
    const r = await call('create-order', { cookie: lib.reviewerCookie().split(';')[0], body: { products: ['BAEEE101'], gift: B } });
    assert.equal(r.status, 403, 'the review account cannot send gifts');
  } finally { delete process.env.REVIEW_CODE; }
  assert.equal(Object.keys(rz.orders).length, 0, 'no Razorpay order was made for any refused gift');
});

test('an empty gift field is an ordinary purchase', async () => {
  const r = await order(H, ['BAEEE101'], { gift: '   ' });
  assert.equal(r.status, 200); assert.equal(r.gift, null);
  assert.equal(rz.orders[r.orderId].notes.gift, undefined);
});

test('the order carries the recipient next to the buyer; the email is normalised', async () => {
  const r = await order(A, ['BAEEE101', 'BACHY105'], { gift: '  ' + B.toUpperCase() + ' ' });
  assert.equal(r.status, 200); assert.equal(r.amount, 2000, 'full price'); assert.equal(r.gift, B);
  const n = rz.orders[r.orderId].notes;
  assert.equal(n.email, A); assert.equal(n.gift, B); assert.equal(n.item, 'BAEEE101,BACHY105');
});

// ------------------------------------------------------------------ paying for it
test('Pro lands on the recipient only after a verified UPI payment, never on the buyer', async () => {
  const o = await order(A, ['BAEEE101', 'BACHY105'], { gift: B });
  assert.deepEqual(await owns(B), { BACHY105: false, BAEEE101: false, BAENG101: false }, 'making the order gives nothing');
  assert.equal((await verify(A, o.orderId, 'card')).status, 402, 'only UPI unlocks');
  assert.equal(await paidRec('BAEEE101', B), null, 'a refused payment gives nothing');

  const p = payOrder(o.orderId);
  assert.equal((await call('verify', { email: B, body: p })).status, 403, 'the recipient cannot claim the buyer\'s checkout callback');
  const v = await call('verify', { email: A, body: p });
  assert.equal(v.status, 200); assert.equal(v.gift, B); assert.deepEqual(v.items, ['BAEEE101', 'BACHY105']);
  const r1 = await paidRec('BAEEE101', B), r2 = await paidRec('BACHY105', B);
  assert.equal(r1.giftFrom, A); assert.equal(r2.giftFrom, A);
  assert.equal(r1.id, p.razorpay_payment_id);
  assert.equal(r1.amount + r2.amount, 2000, 'each subject keeps its share');
  assert.equal(await paidRec('BAEEE101', A), null, 'the buyer gets nothing');
  assert.equal(await paidRec('BACHY105', A), null);
  const own = await owns(B); assert.ok(own.BAEEE101 && own.BACHY105 && !own.BAENG101);
});

test('the same gift payment reported again (check, webhook) records nothing new', async () => {
  const o = await order(C, ['BAENG101'], { gift: D });
  const p = payOrder(o.orderId);
  assert.equal((await call('verify', { email: C, body: p })).status, 200);
  const first = await paidRec('BAENG101', D);
  const c = await check(C, o.orderId);
  assert.equal(c.status, 200); assert.equal(c.gift, D);
  assert.equal((await call('verify', { email: C, body: p })).status, 200);
  const w = await webhook('payment.captured', { payment: { entity: rz.payments[p.razorpay_payment_id] } });
  assert.equal(w.status, 200); assert.equal(w.unlocked, true);
  assert.deepEqual(await paidRec('BAENG101', D), first, 'same record');
  assert.equal(await paidRec('BAENG101', C), null);
  assert.equal((await check(D, o.orderId)).status, 402, 'the recipient cannot look up the buyer\'s order');
});

test('a tampered order (gift to the buyer, or to a non-VIT email) unlocks nothing', async () => {
  const o = await order(E, ['BAEEE101'], { gift: F });
  rz.orders[o.orderId].notes.gift = 'someone@gmail.com';
  assert.equal((await verify(E, o.orderId)).status, 402);
  const o2 = await order(E, ['BAEEE101'], { gift: F });
  rz.orders[o2.orderId].notes.gift = E;
  assert.equal((await verify(E, o2.orderId)).status, 402);
  assert.equal(await paidRec('BAEEE101', E), null); assert.equal(await paidRec('BAEEE101', F), null);
});

// ------------------------------------------------------------------ who owns what
test('a friend who already owns a subject: 409 naming it; the buyer owning it does not matter', async () => {
  // B owns BAEEE101 + BACHY105 (gift from A above)
  const r = await order(C, ['BACHY105', 'BAENG101', 'BAEEE101'], { gift: B });
  assert.equal(r.status, 409);
  assert.match(r.error, /Applied Chemistry/); assert.match(r.error, /Basic Engineering/); assert.doesNotMatch(r.error, /Technical English/);
  assert.deepEqual(r.owned.sort(), ['BACHY105', 'BAEEE101']);
  // B owns BAEEE101; B can still gift it to someone who doesn't have it
  const g = await order(B, ['BAEEE101'], { gift: E });
  assert.equal(g.status, 200);
  assert.equal((await verify(B, g.orderId)).status, 200);
  assert.equal((await paidRec('BAEEE101', E)).giftFrom, B);
  assert.equal((await paidRec('BAEEE101', B)).giftFrom, A, 'the buyer\'s own record is untouched');
  // and an ordinary purchase of something you own is still refused
  assert.equal((await order(B, ['BAEEE101'])).status, 409);
});

test('if the friend got the subject between the order and the payment, their own record is not overwritten', async () => {
  const gift = await order(G, ['BAENG101'], { gift: H });
  const own = await order(H, ['BAENG101']);
  const pOwn = payOrder(own.orderId);
  assert.equal((await call('verify', { email: H, body: pOwn })).status, 200);
  assert.equal((await verify(G, gift.orderId)).status, 200, 'the gift payment is still accepted (money was taken)');
  const rec = await paidRec('BAENG101', H);
  assert.equal(rec.id, pOwn.razorpay_payment_id, 'H keeps the record of their own payment, so it can still be refunded');
  assert.equal(rec.giftFrom, undefined);
});

// ------------------------------------------------------------------ discounts
test('a discount code works on a gift and spends the BUYER\'s one use, not the friend\'s', async () => {
  await call('offers', { admin: 'test-admin', body: { action: 'offer-add', code: 'GIFT20', pct: 20 } });
  const K = st('kai'), L = st('lu');
  const o = await order(K, ['BAEEE101'], { gift: L, code: 'GIFT20' });
  assert.equal(o.status, 200); assert.equal(o.amount, 800); assert.equal(o.offer, 'GIFT20');
  const n = rz.orders[o.orderId].notes;
  assert.equal(n.offer, 'GIFT20'); assert.equal(n.shares, '800'); assert.equal(n.gift, L);
  assert.equal((await verify(K, o.orderId)).status, 200);
  const rec = await paidRec('BAEEE101', L);
  assert.equal(rec.amount, 800); assert.equal(rec.offer, 'GIFT20'); assert.equal(rec.giftFrom, K);
  const [usedK, usedL] = await store.pipeline([['HEXISTS', 'offer-used:GIFT20', K], ['HEXISTS', 'offer-used:GIFT20', L]]);
  assert.equal(+usedK, 1); assert.equal(+usedL, 0);
  assert.equal((await order(K, ['BACHY105'], { code: 'GIFT20' })).status, 400, 'the buyer has used it');
  assert.equal((await order(L, ['BACHY105'], { code: 'GIFT20' })).status, 200, 'the friend can still use it for themselves');
});

test('the 50% referral reward cannot be spent on a gift, and a refused gift spends nothing', async () => {
  const M = st('mo'), N = st('ned'), P = st('pia');
  const { token } = await me(M);
  const o = await order(N, ['BAEEE101'], { ref: token });
  assert.equal((await verify(N, o.orderId)).status, 200);
  assert.equal((await me(M)).rewards, 1);
  const r = await order(M, ['BACHY105'], { gift: P, reward: true });
  assert.equal(r.status, 400); assert.match(r.error, /reward/); assert.notEqual(r.badReward, true, 'the page must not think the reward is gone');
  assert.equal((await me(M)).rewards, 1, 'still there for their own purchase');
  // even an order that somehow carried both is recorded at its paid price without spending a reward
  const g = await order(M, ['BACHY105'], { gift: P });
  rz.orders[g.orderId].notes.reward = 'REF50';
  assert.equal((await verify(M, g.orderId)).status, 200);
  assert.equal((await me(M)).rewards, 1);
  assert.equal((await paidRec('BACHY105', P)).offer, undefined);
});

// ------------------------------------------------------------------ referrals
test('a gift never credits a referrer and is not the buyer\'s first purchase', async () => {
  const R1 = st('ray'), Q = st('qin'), S = st('sol');
  const { token } = await me(R1);
  const g = await order(Q, ['BAEEE101'], { gift: S, ref: token });
  assert.equal(g.status, 200);
  assert.equal(rz.orders[g.orderId].notes.ref, undefined, 'the link is not written into a gift order');
  rz.orders[g.orderId].notes.ref = token; // and even if it were
  assert.equal((await verify(Q, g.orderId)).status, 200);
  assert.equal((await me(R1)).friends, 0, 'no credit for a gift');
  const [by] = await store.pipeline([['HEXISTS', 'ref:by', Q]]);
  assert.equal(+by, 0, 'the buyer has not used up their one referrer');
  // the buyer's own first purchase through the link still counts
  const own = await order(Q, ['BAEEE101'], { ref: token });
  assert.equal(rz.orders[own.orderId].notes.ref, token, 'a gift is not the buyer\'s first purchase');
  assert.equal((await verify(Q, own.orderId)).status, 200);
  assert.equal((await me(R1)).friends, 1);
  // the recipient was "given" a subject, which the referral rules (api/_referrals.js) treat like buying one
  const later = await order(S, ['BACHY105'], { ref: token });
  assert.equal(rz.orders[later.orderId].notes.ref, undefined);
});

// ------------------------------------------------------------------ admin
test('admin reconcile records a missed gift to the recipient, once', async () => {
  const T = st('tia'), U = st('uma');
  const o = await order(T, ['BAEEE101'], { gift: U });
  payOrder(o.orderId); // page closed, no webhook
  const r = await admin({ action: 'reconcile', days: 1 });
  assert.equal(r.status, 200);
  assert.equal((await paidRec('BAEEE101', U)).giftFrom, T);
  assert.equal(await paidRec('BAEEE101', T), null);
  const again = await admin({ action: 'reconcile', days: 1 });
  assert.equal(again.added, 0, 'nothing new the second time');
});

test('admin refund of a gift: found by the recipient or the buyer; a full refund ends the recipient\'s Pro', async () => {
  const V = st('vi'), W = st('wes'), X = st('xia');
  const o = await order(V, ['BAEEE101', 'BACHY105'], { gift: W });
  const p = payOrder(o.orderId);
  await call('verify', { email: V, body: p });
  // by the recipient's email: refunds that subject's share
  const r = await admin({ action: 'refund', email: W, product: 'BAEEE101', reason: 'test' });
  assert.equal(r.ok, true, JSON.stringify(r)); // (the answer's own "status" is Razorpay's refund status)
  assert.equal(r.refund.amount, 1000); assert.equal(r.refund.email, W);
  assert.equal(await paidRec('BAEEE101', W), null);
  assert.equal((await refundedRec('BAEEE101', W)).giftFrom, V);
  assert.ok((await owns(W)).BACHY105, 'the other subject stays');
  // by the buyer's email: the admin page can find the gift they gave
  const r2 = await admin({ action: 'refund', email: V, product: 'BACHY105', reason: 'test' });
  assert.equal(r2.ok, true, JSON.stringify(r2)); assert.equal(r2.refund.email, W);
  assert.equal(await paidRec('BACHY105', W), null);
  // two gifts of the same subject from one buyer: the admin must pick the recipient
  const o1 = await order(X, ['BAENG101'], { gift: V }), o2 = await order(X, ['BAENG101'], { gift: W });
  await verify(X, o1.orderId); await verify(X, o2.orderId);
  const amb = await admin({ action: 'refund', email: X, product: 'BAENG101' });
  assert.equal(amb.status, 409); assert.match(amb.error, new RegExp(V.replace(/\./g, '\\.')));
});

test('a refund made in Razorpay (webhook) ends the recipient\'s Pro, not the buyer\'s', async () => {
  const Y = st('yu'), Z = st('zed');
  const own = await order(Y, ['BAEEE101']); await verify(Y, own.orderId);
  const o = await order(Y, ['BAEEE101'], { gift: Z });
  const p = payOrder(o.orderId);
  await call('verify', { email: Y, body: p });
  const pay = rz.payments[p.razorpay_payment_id]; pay.amount_refunded = pay.amount;
  const w = await webhook('refund.processed', { refund: { entity: { id: 'rfnd_web1', payment_id: pay.id, amount: pay.amount } }, payment: { entity: pay } });
  assert.equal(w.status, 200); assert.equal(w.refunded, true);
  assert.equal(await paidRec('BAEEE101', Z), null);
  assert.ok(await refundedRec('BAEEE101', Z));
  assert.ok((await owns(Y)).BAEEE101, 'the buyer\'s own Pro stays');
});

test('admin lookup shows gifts both ways; the recipient\'s session says who sent them', async () => {
  const given = await admin({ action: 'lookup', email: A });
  assert.equal(given.status, 200);
  assert.ok(given.gifts.given.some((x) => x.to === B && x.product === 'BAEEE101'));
  const got = await admin({ action: 'lookup', email: B });
  assert.ok(got.gifts.received.some((x) => x.from === A && x.product === 'BACHY105'));
  assert.ok(got.payments.some((x) => x.giftFrom === A));
  const snap = await call('admin', { method: 'GET', admin: 'test-admin' });
  assert.ok(snap.payments.some((x) => x.email === B && x.giftFrom === A));

  const s = await call('session', { method: 'GET', email: B });
  assert.deepEqual(s.gifts.map((x) => x.code + ':' + x.from).sort(), ['BACHY105:' + A, 'BAEEE101:' + A]);
  assert.deepEqual((await call('session', { method: 'GET', email: A })).gifts, []);
  assert.deepEqual((await call('session', { method: 'GET' })).gifts, []);
});
