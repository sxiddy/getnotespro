// Payments made outside the website (admin action "offline"). Run: npm test
// A student who paid the owner directly (UPI, cash) gets Pro with no end date, and the amount counts as a payment
// and in money received. Razorpay can't refund it; Remove Pro takes it away.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FAKEREDIS_PORT = '5395';
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5395';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
process.env.SALE_PCT = '50'; // the money tests price every subject at ₹10 (₹20 list, 50% sale)
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ADMIN_KEY = 'test-admin';
for (const k of Object.keys(process.env)) if (/^PRICE_|^TELEGRAM_|^REVIEW_CODE$|^RESEND_/.test(k)) delete process.env[k];

const fakeStore = require('../tools/fakeredis.js');
const lib = require('../api/_lib.js');
const store = require('../api/_store.js');

async function admin(body, method = 'POST') {
  const handler = require('../api/admin.js');
  const req = { method, url: '/api/admin', headers: { 'x-admin-key': 'test-admin' }, body: body || {}, socket: { remoteAddress: '10.0.3.1' } };
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  await handler(req, res);
  return { status: res.statusCode, ...res.body };
}
const A = 'ana.off2026@vitstudent.ac.in', B = 'bo.off2026@vitstudent.ac.in';

test.after(() => fakeStore.close());

test('a payment outside the website gives Pro and counts in money received', async () => {
  const before = await admin(null, 'GET');
  const r = await admin({ action: 'offline', email: A, product: 'BAEEE101', rupees: '10', date: '2026-11-09', note: 'UPI ref 1234' });
  assert.equal(r.status, 200); assert.equal(r.amount, 1000);
  assert.equal((await lib.ownedBy(A)).BAEEE101, true);

  const snap = await admin(null, 'GET');
  assert.equal(snap.totals.revenue - before.totals.revenue, 1000);
  assert.equal(snap.totals.payments - before.totals.payments, 1);
  assert.equal(snap.totals.offline, 1); assert.equal(snap.totals.offlineRevenue, 1000);
  const p = snap.payments.find((x) => x.email === A);
  assert.equal(p.status, 'paid'); assert.equal(p.offline, true); assert.equal(p.note, 'UPI ref 1234'); assert.equal(p.at.slice(0, 10), '2026-11-09');

  // no second payment on top, and Razorpay can't refund it
  assert.equal((await admin({ action: 'offline', email: A, product: 'BAEEE101', rupees: 10 })).status, 400);
  const rf = await admin({ action: 'refund', email: A, product: 'BAEEE101' });
  assert.equal(rf.status, 400); assert.match(rf.error, /outside the website/);

  // Remove Pro takes it away (and it leaves the totals)
  assert.equal((await admin({ action: 'revoke', email: A, product: 'BAEEE101' })).status, 200);
  assert.equal((await lib.ownedBy(A)).BAEEE101, false);
  assert.equal((await admin(null, 'GET')).totals.revenue, before.totals.revenue);
});

test('a free manual grant can be turned into a payment; bad input is refused', async () => {
  assert.equal((await admin({ action: 'grant', email: B, product: 'BACHY105' })).status, 200);
  assert.equal((await admin({ action: 'offline', email: B, product: 'BACHY105', rupees: 15 })).status, 200);
  const [raw] = await store.pipeline([['HGET', 'paid:BACHY105', B]]);
  const x = JSON.parse(raw); assert.equal(x.manual, undefined); assert.equal(x.amount, 1500); assert.equal(x.offline, true);

  assert.equal((await admin({ action: 'offline', email: B, product: 'BAENG101', rupees: 0 })).status, 400);
  assert.equal((await admin({ action: 'offline', email: B, product: 'BAENG101', rupees: 'abc' })).status, 400);
  assert.equal((await admin({ action: 'offline', email: B, product: 'BAENG101', rupees: 10, date: 'not a date' })).status, 400);
  assert.equal((await admin({ action: 'offline', email: 'someone@gmail.com', product: 'BAENG101', rupees: 10 })).status, 400);
  assert.equal((await admin({ action: 'offline', email: B, product: 'NOPE', rupees: 10 })).status, 400);
});
