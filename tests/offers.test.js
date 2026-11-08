// Discount codes (F10). Run: npm test
// Part 1 tests the pure rules in api/_offers.js. Part 2 runs the real handlers (offers, create-order, verify, admin
// reconcile) against the in-memory store (tools/fakeredis.js) and a stand-in for Razorpay, so the whole money path is
// checked: quote -> order at the discounted price -> a use is spent only on a verified UPI payment.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.FAKEREDIS_PORT = '5391';
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5391';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ADMIN_KEY = 'test-admin';
process.env.RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET = 'rzp-secret';
for (const k of Object.keys(process.env)) if (/^PRICE_|^TELEGRAM_/.test(k)) delete process.env[k];

const fakeStore = require('../tools/fakeredis.js');
const O = require('../api/_offers.js');
const lib = require('../api/_lib.js');

const DAY = 864e5;
const NOW = Date.UTC(2026, 10, 9, 12);
const offer = (o) => Object.assign({ code: 'EXAM20', pct: 20, max: 0, until: 0, codes: [], off: false, at: NOW }, o);

// ------------------------------------------------------------------ part 1: rules
test('makeOffer: cleans and checks what the admin typed', () => {
  const ok = O.makeOffer({ code: ' exam20 ', pct: '20', max: '50', days: '7', codes: ['baeee101'] }, NOW);
  assert.deepEqual(ok.offer, { code: 'EXAM20', pct: 20, max: 50, until: NOW + 7 * DAY, codes: ['BAEEE101'], off: false, at: NOW, note: '' });
  assert.equal(O.makeOffer({ code: 'EXAM20', pct: 20 }, NOW).offer.until, 0, 'no days = never expires');
  assert.equal(O.makeOffer({ code: 'EXAM20', pct: 20 }, NOW).offer.max, 0, 'no max = no limit');
  for (const bad of [
    { code: 'ab', pct: 20 }, // too short
    { code: 'HAS SPACE', pct: 20 },
    { code: 'X'.repeat(21), pct: 20 },
    { code: 'EXAM20', pct: 0 },
    { code: 'EXAM20', pct: 100 }, // free Pro is what Give Pro is for
    { code: 'EXAM20', pct: 12.5 },
    { code: 'EXAM20', pct: 20, max: -1 },
    { code: 'EXAM20', pct: 20, days: -2 },
    { code: 'EXAM20', pct: 20, codes: ['NOPE999'] },
  ]) assert.ok(O.makeOffer(bad, NOW).error, 'should refuse ' + JSON.stringify(bad));
});

test('priceCart: whole rupees, rounded down for the student, never below ₹1, only the subjects the code is for', () => {
  const price = () => 1000;
  assert.deepEqual(O.priceCart(['BAEEE101'], price, null), { lines: [{ code: 'BAEEE101', price: 1000, pay: 1000 }], total: 1000, discount: 0 });
  assert.equal(O.priceCart(['BAEEE101'], price, offer({ pct: 20 })).total, 800);
  assert.equal(O.priceCart(['BAEEE101'], price, offer({ pct: 15 })).total, 800, '₹8.50 rounds down to ₹8');
  assert.equal(O.priceCart(['BAEEE101'], price, offer({ pct: 99 })).total, 100, 'never below ₹1 a subject');
  const some = O.priceCart(['BAEEE101', 'BACHY105'], price, offer({ pct: 50, codes: ['BACHY105'] }));
  assert.deepEqual(some.lines.map((l) => l.pay), [1000, 500]);
  assert.equal(some.total, 1500); assert.equal(some.discount, 500);
});

test('checkOffer: every reason a code can be refused', () => {
  const ctx = { items: ['BAEEE101'], now: NOW, uses: 0, usedByMe: false };
  assert.equal(O.checkOffer(offer(), ctx), null);
  assert.match(O.checkOffer(null, ctx), /isn't valid/);
  assert.match(O.checkOffer(offer({ off: true }), ctx), /isn't valid/, 'a paused code looks the same as an unknown one');
  assert.match(O.checkOffer(offer({ until: NOW - 1 }), ctx), /expired/);
  assert.match(O.checkOffer(offer({ max: 3 }), { ...ctx, uses: 3 }), /used up/);
  assert.equal(O.checkOffer(offer({ max: 3 }), { ...ctx, uses: 2 }), null);
  assert.match(O.checkOffer(offer(), { ...ctx, usedByMe: true }), /already used/);
  assert.match(O.checkOffer(offer({ codes: ['BACHY105'] }), ctx), /only for Applied Chemistry/);
});

// ------------------------------------------------------------------ part 2: the real handlers
const realFetch = global.fetch;
const rz = { orders: {}, payments: {}, n: 0 };
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.razorpay.com/v1')) return realFetch(url, opts);
  const path = u.slice('https://api.razorpay.com/v1'.length), body = opts.body ? JSON.parse(opts.body) : null;
  const ok = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
  let m;
  if (opts.method === 'POST' && path === '/orders') { const o = { id: 'order_T' + ++rz.n, amount: body.amount, currency: body.currency, notes: body.notes }; rz.orders[o.id] = o; return ok(o); }
  if ((m = path.match(/^\/orders\/([^/]+)\/payments$/))) return ok({ items: Object.values(rz.payments).filter((p) => p.order_id === m[1]) });
  if ((m = path.match(/^\/orders\/([^/]+)$/))) return ok(rz.orders[m[1]]);
  if ((m = path.match(/^\/payments\/([^/]+)\/capture$/))) { rz.payments[m[1]].status = 'captured'; return ok(rz.payments[m[1]]); }
  if ((m = path.match(/^\/payments\/([^/?]+)$/))) return ok(rz.payments[m[1]]);
  if (path.startsWith('/payments?')) return ok({ items: Object.values(rz.payments) });
  throw new Error('razorpay stub: no route for ' + opts.method + ' ' + path);
};
// a student pays the order in the checkout (UPI by default); Razorpay copies the checkout's notes onto the payment
function payOrder(orderId, method = 'upi') {
  const o = rz.orders[orderId], id = 'pay_T' + ++rz.n;
  rz.payments[id] = { id, order_id: orderId, amount: o.amount, currency: 'INR', method, status: 'captured', created_at: Math.floor(Date.now() / 1000), notes: { ...o.notes } };
  return { razorpay_order_id: orderId, razorpay_payment_id: id, razorpay_signature: crypto.createHmac('sha256', 'rzp-secret').update(orderId + '|' + id).digest('hex') };
}

async function call(file, { method = 'POST', body, email, admin, query = '' } = {}) {
  const handler = require('../api/' + file + '.js');
  const headers = {};
  if (email) headers.cookie = lib.userCookie(email).split(';')[0];
  if (admin) headers['x-admin-key'] = admin;
  const req = { method, url: '/api/' + file + query, headers, body: body || {}, socket: { remoteAddress: '10.0.0.' + (email ? 1 : 2) } };
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  await handler(req, res);
  return { status: res.statusCode, ...res.body };
}
const A = 'a.student2026@vitstudent.ac.in', B = 'b.student2026@vitstudent.ac.in', C = 'c.student2026@vitstudent.ac.in';
const addCode = (o) => call('offers', { admin: 'test-admin', body: Object.assign({ action: 'offer-add' }, o) });
const paidRec = async (code, email) => { const [r] = await require('../api/_store.js').pipeline([['HGET', 'paid:' + code, email]]); return r && JSON.parse(r); };

test.after(() => fakeStore.close());

test('admin: adding, listing, pausing and deleting codes needs the admin key', async () => {
  assert.equal((await call('offers', { admin: 'wrong', body: { action: 'offer-add', code: 'NOPE', pct: 10 } })).status, 401);
  assert.equal((await addCode({ code: 'exam20', pct: 20, max: 2 })).status, 200);
  assert.equal((await addCode({ code: 'EXAM20', pct: 30 })).status, 409, 'a code is never silently replaced');
  assert.equal((await addCode({ code: 'BAD', pct: 0 })).status, 400);
  const list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.find((x) => x.code === 'EXAM20').uses, 0);
  assert.equal((await call('offers', { method: 'GET', query: '?part=list' })).status, 401);
});

test('quote: a valid code prices the cart; a wrong one says why; guessing is slowed down', async () => {
  const q = await call('offers', { body: { action: 'quote', code: 'exam20', products: ['BAEEE101', 'BACHY105'] } });
  assert.equal(q.status, 200);
  assert.equal(q.total, 1600); assert.equal(q.discount, 400); assert.equal(q.offer.code, 'EXAM20'); assert.equal(q.offer.pct, 20);
  const bad = await call('offers', { body: { action: 'quote', code: 'NOTACODE', products: ['BAEEE101'] } });
  assert.equal(bad.status, 400); assert.match(bad.error, /isn't valid/);
  let last;
  for (let i = 0; i < 25; i++) last = await call('offers', { body: { action: 'quote', code: 'GUESS' + i, products: ['BAEEE101'] } });
  assert.equal(last.status, 429);
});

test('create-order: the server prices the order with the code and writes it into the order notes', async () => {
  const plain = await call('create-order', { email: A, body: { products: ['BAEEE101'] } });
  assert.equal(plain.status, 200); assert.equal(plain.amount, 1000);
  assert.equal(rz.orders[plain.orderId].notes.offer, undefined);

  const o = await call('create-order', { email: A, body: { products: ['BAEEE101', 'BACHY105'], code: 'exam20' } });
  assert.equal(o.status, 200); assert.equal(o.amount, 1600); assert.equal(o.offer, 'EXAM20');
  const n = rz.orders[o.orderId].notes;
  assert.equal(n.offer, 'EXAM20'); assert.equal(n.shares, '800,800'); assert.equal(n.item, 'BAEEE101,BACHY105');

  const bad = await call('create-order', { email: A, body: { products: ['BAEEE101'], code: 'NOTACODE' } });
  assert.equal(bad.status, 400); assert.equal(bad.badOffer, true);
});

test('verify: a failed payment spends no use; a verified UPI payment spends one and records each subject\'s share', async () => {
  const o = await call('create-order', { email: A, body: { products: ['BAEEE101', 'BACHY105'], code: 'EXAM20' } });
  const card = payOrder(o.orderId, 'card');
  assert.equal((await call('verify', { email: A, body: card })).status, 402, 'only UPI unlocks');
  let list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.find((x) => x.code === 'EXAM20').uses, 0, 'a refused payment does not burn a use');

  const o2 = await call('create-order', { email: A, body: { products: ['BAEEE101', 'BACHY105'], code: 'EXAM20' } });
  const v = await call('verify', { email: A, body: payOrder(o2.orderId) });
  assert.equal(v.status, 200);
  list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.find((x) => x.code === 'EXAM20').uses, 1);
  const rec = await paidRec('BACHY105', A);
  assert.equal(rec.amount, 800); assert.equal(rec.offer, 'EXAM20');
  assert.equal((await paidRec('BAEEE101', A)).amount, 800);

  // the same payment reported again (webhook, or Check my payment) spends nothing more
  assert.equal((await call('verify', { email: A, body: { action: 'check', orderId: o2.orderId } })).status, 200);
  list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.find((x) => x.code === 'EXAM20').uses, 1);
});

test('one use per student, and a code stops once its uses run out', async () => {
  const again = await call('create-order', { email: A, body: { products: ['BAENG101'], code: 'EXAM20' } });
  assert.equal(again.status, 400); assert.match(again.error, /already used/);

  const b = await call('create-order', { email: B, body: { products: ['BAENG101'], code: 'EXAM20' } });
  assert.equal((await call('verify', { email: B, body: payOrder(b.orderId) })).status, 200);
  const c = await call('create-order', { email: C, body: { products: ['BAENG101'], code: 'EXAM20' } });
  assert.equal(c.status, 400); assert.match(c.error, /used up/);
});

test('a code that ran out after the order was made still unlocks what was paid for', async () => {
  await addCode({ code: 'ONEONLY', pct: 50, max: 1 });
  const x = await call('create-order', { email: C, body: { products: ['BAENG101'], code: 'ONEONLY' } });
  const y = await call('create-order', { email: B, body: { products: ['BAEEE101'], code: 'ONEONLY' } });
  assert.equal((await call('verify', { email: C, body: payOrder(x.orderId) })).status, 200);
  assert.equal((await call('verify', { email: B, body: payOrder(y.orderId) })).status, 200, 'money taken = Pro given, even past the limit');
  assert.equal((await paidRec('BAEEE101', B)).amount, 500);
});

test('pause and delete', async () => {
  await addCode({ code: 'PAUSEME', pct: 10 });
  assert.equal((await call('offers', { admin: 'test-admin', body: { action: 'offer-pause', code: 'PAUSEME', off: true } })).status, 200);
  assert.match((await call('offers', { body: { action: 'quote', code: 'PAUSEME', products: ['BAEEE101'] }, email: C })).error, /isn't valid/);
  assert.equal((await call('offers', { admin: 'test-admin', body: { action: 'offer-pause', code: 'PAUSEME', off: false } })).status, 200);
  assert.equal((await call('offers', { body: { action: 'quote', code: 'PAUSEME', products: ['BAEEE101'] }, email: C })).status, 200);
  assert.equal((await call('offers', { admin: 'test-admin', body: { action: 'offer-del', code: 'PAUSEME' } })).status, 200);
  const list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.some((x) => x.code === 'PAUSEME'), false);
});

test('admin reconcile records a missed discounted payment with its real shares and spends the use', async () => {
  await addCode({ code: 'MISSED', pct: 50 });
  const D = 'd.student2026@vitstudent.ac.in';
  const o = await call('create-order', { email: D, body: { products: ['BAEEE101', 'BAENG101'], code: 'MISSED' } });
  payOrder(o.orderId); // paid, but the page closed and no webhook came
  const r = await call('admin', { admin: 'test-admin', body: { action: 'reconcile', days: 1 } });
  assert.equal(r.status, 200); assert.ok(r.added >= 1);
  assert.equal((await paidRec('BAENG101', D)).amount, 500);
  const list = await call('offers', { method: 'GET', admin: 'test-admin', query: '?part=list' });
  assert.equal(list.items.find((x) => x.code === 'MISSED').uses, 1);
});
