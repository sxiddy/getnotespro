// Community (api/community.js): subject requests + upvotes (F2/N3), coming-soon + Notify me (F1), reviews approved in
// admin (G3), and Report a mistake from the subject sites (F7). Real handler against tools/fakeredis.js. Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.FAKEREDIS_PORT = '5394';
process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:5394';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
process.env.SALE_PCT = '50'; // the money tests price every subject at ₹10 (with the PRICE_ pins below)
process.env.SESSION_SECRET = 'test-session-secret';
process.env.ADMIN_KEY = 'test-admin';
process.env.TELEGRAM_BOT_TOKEN = 'tg-token';
process.env.TELEGRAM_CHAT_ID = '42';
delete process.env.REVIEW_CODE;

const fakeStore = require('../tools/fakeredis.js');
const lib = require('../api/_lib.js');
const store = require('../api/_store.js');

const realFetch = global.fetch;
const sent = []; // Telegram messages
global.fetch = async (url, opts = {}) => {
  if (String(url).startsWith('https://api.telegram.org/')) { sent.push(JSON.parse(opts.body)); return new Response('{"ok":true}', { status: 200 }); }
  return realFetch(url, opts);
};

let ip = 0;
async function call({ method = 'POST', body, email, admin, query = '', from } = {}) {
  const handler = require('../api/community.js');
  const headers = { 'x-forwarded-for': from || '10.1.0.' + (++ip % 250) };
  if (email) headers.cookie = lib.userCookie(email).split(';')[0];
  if (admin) headers['x-admin-key'] = admin;
  const req = { method, url: '/api/community' + query, headers, body: body || {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.body = s ? JSON.parse(s) : null; } };
  await handler(req, res);
  return { status: res.statusCode, headers: res.headers, ...res.body };
}
const A = 'a.student2026@vitstudent.ac.in', B = 'b.student2026@vitstudent.ac.in', C = 'c.student2026@vitstudent.ac.in';
const admin = (body) => call({ admin: 'test-admin', body });
const adminList = () => call({ method: 'GET', admin: 'test-admin', query: '?part=admin' });

test.after(() => fakeStore.close());

// ------------------------------------------------------------------ report a mistake (F7, subject sites)
test('report: open to any site (CORS), no sign-in, stored, sent to Telegram, listed in admin', async () => {
  const pre = await call({ method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['Access-Control-Allow-Origin'], '*');
  assert.match(pre.headers['Access-Control-Allow-Methods'], /POST/);

  const r = await call({ body: { action: 'report', code: 'BACHY105', where: 'Module 2 · Beer–Lambert', text: 'Units of ε are wrong <b>', email: 'x@gmail.com' } });
  assert.equal(r.status, 200); assert.equal(r.ok, true);
  assert.equal(r.headers['Access-Control-Allow-Origin'], '*', 'the subject site can read the answer');
  const msg = sent.at(-1);
  assert.equal(msg.chat_id, '42');
  assert.match(msg.text, /BACHY105/); assert.match(msg.text, /&lt;b&gt;/, 'typed text is escaped for Telegram');

  const list = await adminList();
  const rep = list.reports.find((x) => x.code === 'BACHY105');
  assert.equal(rep.where, 'Module 2 · Beer–Lambert'); assert.equal(rep.email, 'x@gmail.com'); assert.ok(rep.at);
  assert.equal((await call({ method: 'GET', query: '?part=admin' })).status, 401, 'the list needs the admin key');

  assert.equal((await admin({ action: 'rep-del', id: rep.id })).status, 200);
  assert.ok(!(await adminList()).reports.some((x) => x.id === rep.id));
});

test('report: refuses bad input', async () => {
  for (const b of [
    { code: 'NOPE999', text: 'wrong' },
    { code: 'BAEEE101', text: '' },
    { code: 'BAEEE101', text: 'ok fine', email: 'not-an-email' },
  ]) {
    const r = await call({ body: Object.assign({ action: 'report', where: 'x' }, b) });
    assert.equal(r.status, 400, JSON.stringify(b));
    assert.equal(r.headers['Access-Control-Allow-Origin'], '*', 'errors are readable cross-site too');
  }
  const long = await call({ body: { action: 'report', code: 'BAEEE101', where: 'w'.repeat(500), text: 't'.repeat(5000) } });
  assert.equal(long.status, 200);
  const rep = (await adminList()).reports.find((x) => x.code === 'BAEEE101');
  assert.ok(rep.text.length <= 1000 && rep.where.length <= 200, 'long text is cut, not refused');
});

test('report: one visitor is slowed down after 10 an hour', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await call({ from: '10.9.9.9', body: { action: 'report', code: 'BAENG101', where: 'M1', text: 'typo ' + i } });
  assert.equal(last.status, 429);
  assert.equal((await call({ from: '10.9.9.8', body: { action: 'report', code: 'BAENG101', where: 'M1', text: 'typo' } })).status, 200, 'other visitors are not affected');
});

// ------------------------------------------------------------------ requests + upvotes (F2/N3)
test('requests: signed-in students ask and upvote, one vote each; the asker votes automatically', async () => {
  assert.equal((await call({ body: { action: 'req-add', name: 'Calculus' } })).status, 401, 'sign in to ask');
  const r = await call({ email: A, body: { action: 'req-add', name: '  Calculus   for Engineers ', note: 'BMAT101' } });
  assert.equal(r.status, 200);
  const id = r.item.id;
  assert.equal(r.item.name, 'Calculus for Engineers');

  const dup = await call({ email: B, body: { action: 'req-add', name: 'calculus for engineers' } });
  assert.equal(dup.status, 409); assert.equal(dup.id, id, 'a repeat points to the existing request');

  assert.equal((await call({ email: B, body: { action: 'req-vote', id, on: true } })).votes, 2);
  assert.equal((await call({ email: B, body: { action: 'req-vote', id, on: true } })).votes, 2, 'voting twice counts once');
  assert.equal((await call({ body: { action: 'req-vote', id, on: true } })).status, 401);

  const pub = await call({ method: 'GET', query: '?part=requests' });
  const item = pub.items.find((x) => x.id === id);
  assert.equal(item.votes, 2); assert.equal(item.status, 'open');
  assert.ok(!JSON.stringify(pub).includes('@'), 'no emails in the public list');
  assert.deepEqual((await call({ method: 'GET', email: B, query: '?part=requests' })).mine.votes, [id]);

  assert.equal((await call({ email: B, body: { action: 'req-vote', id, on: false } })).votes, 1, 'a vote can be taken back');
  assert.equal((await call({ email: B, body: { action: 'req-vote', id: 'ffffffffffff', on: true } })).status, 404);
  assert.equal((await call({ email: A, body: { action: 'req-add', name: 'ab' } })).status, 400, 'too short');
});

test('requests: a student can add at most 5 a day; the list is sorted by votes', async () => {
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await call({ email: C, body: { action: 'req-add', name: 'Subject number ' + i } })).item.id);
  assert.equal((await call({ email: C, body: { action: 'req-add', name: 'Subject number 4' } })).status, 200);
  assert.equal((await call({ email: C, body: { action: 'req-add', name: 'Subject number 5' } })).status, 429);
  await call({ email: A, body: { action: 'req-vote', id: ids[2], on: true } });
  await call({ email: B, body: { action: 'req-vote', id: ids[2], on: true } });
  const pub = await call({ method: 'GET', query: '?part=requests' });
  assert.equal(pub.items[0].id, ids[2]);
});

// ------------------------------------------------------------------ coming soon + notify me (F1), admin status
test('coming soon: admin marks a request; students ask to be told; hidden ones leave the public list', async () => {
  const id = (await call({ email: A, body: { action: 'req-add', name: 'Physics' } })).item.id;
  assert.equal((await call({ email: B, body: { action: 'req-notify', id, on: true } })).status, 409, 'only for coming-soon subjects');
  assert.equal((await call({ body: { action: 'req-status', id, status: 'soon' } })).status, 401, 'status needs the admin key');
  assert.equal((await admin({ action: 'req-status', id, status: 'bogus' })).status, 400);
  assert.equal((await admin({ action: 'req-status', id, status: 'soon' })).status, 200);

  assert.equal((await call({ email: B, body: { action: 'req-notify', id, on: true } })).status, 200);
  assert.equal((await call({ email: C, body: { action: 'req-notify', id, on: true } })).notify, 2);
  assert.equal((await call({ body: { action: 'req-notify', id, on: true } })).status, 401);
  assert.deepEqual((await call({ method: 'GET', email: B, query: '?part=requests' })).mine.notify, [id]);
  const pub = (await call({ method: 'GET', query: '?part=requests' })).items.find((x) => x.id === id);
  assert.equal(pub.status, 'soon');

  const a = (await adminList()).requests.find((x) => x.id === id);
  assert.deepEqual(a.notify.sort(), [B, C].sort(), 'admin sees who to tell'); assert.equal(a.by, A);

  await admin({ action: 'req-status', id, status: 'hidden' });
  assert.ok(!(await call({ method: 'GET', query: '?part=requests' })).items.some((x) => x.id === id));
  assert.equal((await call({ email: C, body: { action: 'req-vote', id, on: true } })).status, 404, 'no votes on hidden requests');
  assert.equal((await admin({ action: 'req-del', id })).status, 200);
  assert.ok(!(await adminList()).requests.some((x) => x.id === id));
});

// ------------------------------------------------------------------ reviews (G3)
test('reviews: only owners of the subject write one; shown only after admin approves; never the email', async () => {
  await store.pipeline([['HSET', 'paid:BAEEE101', A, JSON.stringify({ at: '2026-11-01' })], ['HSET', 'paid:BAEEE101', C, JSON.stringify({ at: '2026-11-01', until: 1 })]]);
  const rv = { action: 'review', code: 'BAEEE101', stars: 5, text: 'The op-amp tools made it click.', name: 'Asha' };
  assert.equal((await call({ body: rv })).status, 401);
  assert.equal((await call({ email: B, body: rv })).status, 403, 'has not bought it');
  assert.equal((await call({ email: C, body: rv })).status, 403, 'Pro ended');
  for (const bad of [{ stars: 0 }, { stars: 6 }, { stars: 4.5 }, { text: 'short' }, { code: 'NOPE999' }])
    assert.equal((await call({ email: A, body: Object.assign({}, rv, bad) })).status, 400, JSON.stringify(bad));

  const r = await call({ email: A, body: rv });
  assert.equal(r.status, 200); assert.equal(r.pending, true);
  let pub = await call({ method: 'GET', query: '?part=reviews&code=BAEEE101' });
  assert.equal(pub.items.length, 0, 'not shown before approval');
  assert.equal((await call({ method: 'GET', email: A, query: '?part=reviews&code=BAEEE101' })).mine.stars, 5, 'the writer sees their own');

  const id = (await adminList()).reviews.find((x) => x.email === A).id;
  assert.equal((await admin({ action: 'rev-approve', id, on: true })).status, 200);
  pub = await call({ method: 'GET', query: '?part=reviews&code=BAEEE101' });
  assert.equal(pub.items.length, 1); assert.equal(pub.items[0].name, 'Asha'); assert.equal(pub.avg, 5);
  assert.ok(!JSON.stringify(pub).includes('@'));

  // editing it sends it back for approval; still one per student per subject
  await call({ email: A, body: Object.assign({}, rv, { stars: 4, text: 'Good, but module 3 is thin.', name: '' }) });
  assert.equal((await call({ method: 'GET', query: '?part=reviews&code=BAEEE101' })).items.length, 0);
  const all = (await adminList()).reviews.filter((x) => x.email === A);
  assert.equal(all.length, 1); assert.equal(all[0].ok, false);
  await admin({ action: 'rev-approve', id, on: true });
  assert.equal((await call({ method: 'GET', query: '?part=reviews&code=BAEEE101' })).items[0].name, 'VIT student', 'no name given');

  assert.equal((await admin({ action: 'rev-del', id })).status, 200);
  assert.equal((await call({ method: 'GET', query: '?part=reviews&code=BAEEE101' })).items.length, 0);
});

test('announcements still work', async () => {
  assert.equal((await admin({ action: 'ann-add', title: 'New module', codes: ['BAEEE101'] })).status, 200);
  assert.equal((await call({ method: 'GET', query: '?part=ann' })).items[0].title, 'New module');
});
