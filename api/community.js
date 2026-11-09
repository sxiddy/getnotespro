// Community features, grouped in one Vercel function to stay under the 12-function limit. Tests: tests/community.test.js
// Text is stored as plain text; every page that shows it must escape it. No email is ever in a public answer.
// Public / students (signed in = the st_user cookie, VIT emails only):
//   GET  ?part=ann[&code=CODE]          announcements (G5), newest first, CORS open, edge-cached a minute
//   GET  ?part=requests                 { items: [{ id, name, note, status: open|soon, votes, notify, at }], mine?: { votes, notify } }
//   GET  ?part=reviews&code=CODE        { items: [{ id, name, stars, text, at }], avg, count, mine? }  approved only
//   POST { action: 'req-add', name, note? }      ask for a subject (5 a day each; a repeat name -> 409 { id }); the asker votes
//   POST { action: 'req-vote', id, on }          upvote / take it back (F2/N3)
//   POST { action: 'req-notify', id, on }        "Notify me" on a coming-soon subject (F1)
//   POST { action: 'review', code, stars 1-5, text, name? }   Pro owners only; one per student per subject; an edit
//        goes back for approval; shown only after the admin approves it (G3)
//   POST { action: 'report', code, where, text, email? }      Report a mistake from any subject site (F7): no sign-in,
//        CORS open, 10 an hour per visitor, stored in hash "rep", sent to the owner's Telegram.
// Admin (header x-admin-key = ADMIN_KEY):
//   GET  ?part=admin  -> { requests (with by + notify emails), reviews (with email), reports }
//   POST ann-add { title, body, codes } | ann-del { id } | req-status { id, status: open|soon|done|hidden } | req-del { id }
//        rev-approve { id, on } | rev-del { id } | rep-del { id }
const crypto = require('crypto');
const { send, body, env, safeEqual, isProduct, handle, getUser, isStudentEmail, ownedBy, PRODUCTS } = require('./_lib');
const { telegram, esc } = require('./_notify');
const store = require('./_store');

const ANN = 'ann'; // hash: id -> JSON { id, at, title, body, codes }
const REQ = 'req', REV = 'rev', REP = 'rep'; // hashes: id -> JSON. Votes in set req:v:<id>, notify-me in set req:n:<id>
const MAX_ANN = 100, MAX_REQ = 300, MAX_REP = 1000, REQ_A_DAY = 5, REP_AN_HOUR = 10;
const STATUSES = ['open', 'soon', 'done', 'hidden'];
// browsers always ask again; Vercel's edge may answer from a copy up to a minute old (so a new update shows within a minute)
const PUBLIC = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=300' };
const CORS = { 'Access-Control-Allow-Origin': '*' };
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,100}\.[a-z]{2,}$/i;

// plain text only: no control characters (newlines kept in the body), squeezed spaces, length capped
const clean = (s, max, lines) => String(s == null ? '' : s)
  .replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const newId = () => crypto.randomBytes(6).toString('hex');
const okId = (id) => /^[a-f0-9]{12}$/.test(String(id || ''));
const revId = (code, email) => crypto.createHash('sha256').update(code + '|' + email).digest('hex').slice(0, 12);
const pubRev = (x) => ({ id: x.id, code: x.code, name: x.name || 'VIT student', stars: x.stars, text: x.text, at: x.at });
const student = (req) => { const u = getUser(req); return u && isStudentEmail(u.e) ? u.e : null; };

async function all(key) {
  const [flat] = await store.pipeline([['HGETALL', key]]) || [[]];
  const out = [];
  for (let i = 1; flat && i < flat.length; i += 2) { const x = parse(flat[i]); if (x && x.id) out.push(x); }
  return out;
}
async function one(key, id) {
  if (!okId(id)) return null;
  const [raw] = await store.pipeline([['HGET', key, String(id)]]);
  return parse(raw);
}
// counts one more against a limit; true when over it
async function over(key, max, secs) {
  const [n] = await store.pipeline([['INCR', key], ['EXPIRE', key, secs]]);
  return +n > max;
}

async function listAnn(code) {
  return (await all(ANN)).filter((x) => !code || !x.codes.length || x.codes.includes(code)).sort((a, b) => b.at - a.at);
}
// coming soon first, then most votes, then newest. Admin also gets hidden/done ones, who asked, and who to notify.
async function listReq(admin) {
  const items = (await all(REQ)).filter((x) => admin || x.status === 'open' || x.status === 'soon');
  if (!items.length) return [];
  const counts = await store.pipeline(items.flatMap((x) => [['SCARD', 'req:v:' + x.id], ['SCARD', 'req:n:' + x.id]]));
  const people = admin ? await store.pipeline(items.map((x) => ['SMEMBERS', 'req:n:' + x.id])) : [];
  return items.map((x, i) => {
    const o = { id: x.id, name: x.name, note: x.note || '', status: x.status, votes: +counts[2 * i] || 0, notify: +counts[2 * i + 1] || 0, at: x.at };
    if (admin) Object.assign(o, { by: x.by, notify: people[i] || [] });
    return o;
  }).sort((a, b) => (b.status === 'soon') - (a.status === 'soon') || b.votes - a.votes || b.at - a.at);
}

function isAdmin(req) {
  const key = String(req.headers['x-admin-key'] || '');
  let expected; try { expected = env('ADMIN_KEY'); } catch (e) { return false; }
  return !!key && safeEqual(key, expected);
}

async function get(req, res, q) {
  const part = q.get('part');
  if (part === 'ann') {
    const code = String(q.get('code') || '').toUpperCase();
    if (code && !isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
    if (!store.configured()) return send(res, 200, { items: [] }, PUBLIC);
    return send(res, 200, { items: await listAnn(code) }, PUBLIC);
  }
  if (part === 'requests') { // per-visitor answer (mine): not cached
    if (!store.configured()) return send(res, 200, { items: [] });
    const items = await listReq(false), me = student(req), out = { items };
    if (me) {
      const r = items.length ? await store.pipeline(items.flatMap((x) => [['SISMEMBER', 'req:v:' + x.id, me], ['SISMEMBER', 'req:n:' + x.id, me]])) : [];
      out.mine = { votes: items.filter((x, i) => +r[2 * i]).map((x) => x.id), notify: items.filter((x, i) => +r[2 * i + 1]).map((x) => x.id) };
    }
    return send(res, 200, out);
  }
  if (part === 'reviews') {
    const code = String(q.get('code') || '').toUpperCase();
    if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
    if (!store.configured()) return send(res, 200, { items: [], avg: 0, count: 0 });
    const list = (await all(REV)).filter((x) => x.code === code);
    const items = list.filter((x) => x.ok).sort((a, b) => b.at - a.at).map(pubRev);
    const out = { items, count: items.length, avg: items.length ? Math.round(items.reduce((t, x) => t + x.stars, 0) / items.length * 10) / 10 : 0 };
    const me = student(req);
    if (me) { const m = list.find((x) => x.email === me); if (m) out.mine = Object.assign(pubRev(m), { name: m.name, ok: !!m.ok }); }
    return send(res, 200, out);
  }
  if (part === 'admin') {
    if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin key.' });
    if (!store.configured()) return send(res, 200, { requests: [], reviews: [], reports: [] });
    const newest = (l) => l.sort((a, b) => b.at - a.at);
    return send(res, 200, { requests: await listReq(true), reviews: newest(await all(REV)), reports: newest(await all(REP)) });
  }
  return send(res, 400, { error: 'Unknown part.' });
}

// Report a mistake (F7): any subject site posts here, so every answer carries the CORS header.
async function report(req, res, b) {
  const code = String(b.code || '').toUpperCase(), text = clean(b.text, 1000, true), where = clean(b.where, 200), email = clean(b.email, 120);
  if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject.' }, CORS);
  if (text.length < 3) return send(res, 400, { error: 'Please say what is wrong.' }, CORS);
  if (email && !EMAIL_RE.test(email)) return send(res, 400, { error: 'That email does not look right. You can leave it empty.' }, CORS);
  if (!store.configured()) return send(res, 500, { error: 'Could not save it right now. Try again later.' }, CORS);
  const hour = new Date().toISOString().slice(0, 13);
  if (await over('rl:rep:' + store.ipHash(req) + ':' + hour, REP_AN_HOUR, 3700)) return send(res, 429, { error: 'Thanks! That is a lot of reports at once. Try again in an hour.' }, CORS);
  const [n] = await store.pipeline([['HLEN', REP]]);
  if (+n >= MAX_REP) return send(res, 503, { error: 'Too many open reports right now. Try again later.' }, CORS);
  const x = { id: newId(), at: Date.now(), code, where, text, email };
  await store.pipeline([['HSET', REP, x.id, JSON.stringify(x)]]);
  await telegram('📝 <b>Mistake reported</b> · ' + code + (where ? '\n<i>' + esc(where) + '</i>' : '') + '\n' + esc(text) + (email ? '\nFrom: ' + esc(email) : ''));
  return send(res, 200, { ok: true }, CORS);
}

async function studentAction(req, res, b) {
  const me = student(req);
  if (!me) return send(res, 401, { error: 'Sign in with your VIT account first.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });

  if (b.action === 'req-add') {
    const name = clean(b.name, 60), note = clean(b.note, 140);
    if (name.length < 3) return send(res, 400, { error: 'Write the subject name (3 letters or more).' });
    const items = await all(REQ), key = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const same = items.find((x) => key(x.name) === key(name) && x.status !== 'hidden');
    if (same) return send(res, 409, { error: 'Someone asked for this already. Upvote it instead.', id: same.id });
    if (items.length >= MAX_REQ) return send(res, 400, { error: 'The request list is full right now.' });
    if (await over('rl:req:' + me + ':' + store.today(), REQ_A_DAY, 90000)) return send(res, 429, { error: 'You can ask for ' + REQ_A_DAY + ' subjects a day. Try again tomorrow.' });
    const x = { id: newId(), at: Date.now(), name, note, by: me, status: 'open' };
    await store.pipeline([['HSET', REQ, x.id, JSON.stringify(x)], ['SADD', 'req:v:' + x.id, me]]);
    return send(res, 200, { ok: true, item: { id: x.id, name, note, status: 'open', votes: 1, notify: 0, at: x.at } });
  }
  if (b.action === 'req-vote' || b.action === 'req-notify') {
    const x = await one(REQ, b.id), vote = b.action === 'req-vote';
    if (!x || !['open', 'soon'].includes(x.status)) return send(res, 404, { error: 'That request is gone.' });
    if (!vote && x.status !== 'soon') return send(res, 409, { error: 'Notify me is only for subjects marked coming soon.' });
    const set = (vote ? 'req:v:' : 'req:n:') + x.id;
    const [, n] = await store.pipeline([[b.on === false ? 'SREM' : 'SADD', set, me], ['SCARD', set]]);
    return send(res, 200, vote ? { ok: true, votes: +n } : { ok: true, notify: +n });
  }
  // review (G3)
  const code = String(b.code || '').toUpperCase(), stars = Number(b.stars), text = clean(b.text, 500, true), name = clean(b.name, 30);
  if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return send(res, 400, { error: 'Pick 1 to 5 stars.' });
  if (text.length < 10) return send(res, 400, { error: 'Write a little more (10 letters or more).' });
  if (!(await ownedBy(me))[code]) return send(res, 403, { error: 'Only students with Pro for ' + PRODUCTS[code].name + ' can review it.' });
  const x = { id: revId(code, me), at: Date.now(), code, email: me, name, stars, text, ok: false };
  await store.pipeline([['HSET', REV, x.id, JSON.stringify(x)]]);
  return send(res, 200, { ok: true, pending: true });
}

async function adminAction(req, res, b) {
  if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin key.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });

  if (b.action === 'ann-add') {
    const title = clean(b.title, 90), text = clean(b.body, 600, true);
    const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map((c) => String(c).toUpperCase()))];
    if (!title) return send(res, 400, { error: 'Write a title.' });
    if (!codes.every(isProduct)) return send(res, 400, { error: 'Unknown subject in the list.' });
    const items = await listAnn('');
    if (items.length >= MAX_ANN) return send(res, 400, { error: 'There are ' + MAX_ANN + ' updates already. Delete some old ones first.' });
    const x = { id: newId(), at: Date.now(), title, body: text, codes };
    await store.pipeline([['HSET', ANN, x.id, JSON.stringify(x)]]);
    return send(res, 200, { ok: true, item: x });
  }
  if (b.action === 'req-status' || b.action === 'rev-approve') {
    const isReq = b.action === 'req-status', key = isReq ? REQ : REV;
    if (isReq && !STATUSES.includes(b.status)) return send(res, 400, { error: 'Status must be one of ' + STATUSES.join(', ') + '.' });
    const x = await one(key, b.id);
    if (!x) return send(res, 404, { error: 'Not found.' });
    if (isReq) x.status = b.status; else x.ok = b.on !== false;
    await store.pipeline([['HSET', key, x.id, JSON.stringify(x)]]);
    return send(res, 200, { ok: true });
  }
  const key = { 'ann-del': ANN, 'req-del': REQ, 'rev-del': REV, 'rep-del': REP }[b.action];
  if (key) {
    const id = String(b.id || '');
    if (!okId(id)) return send(res, 400, { error: 'Bad id.' });
    const cmds = [['HDEL', key, id]];
    if (key === REQ) cmds.push(['DEL', 'req:v:' + id, 'req:n:' + id]);
    const [n] = await store.pipeline(cmds);
    return send(res, 200, { ok: true, removed: +n || 0 });
  }
  return send(res, 400, { error: 'Unknown action.' });
}

module.exports = handle(async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'OPTIONS') return send(res, 204, {}, { ...PUBLIC, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST' });
  if (req.method === 'GET') return get(req, res, q);
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  const b = await body(req);
  if (b.action === 'report') return report(req, res, b);
  if (['req-add', 'req-vote', 'req-notify', 'review'].includes(b.action)) return studentAction(req, res, b);
  return adminAction(req, res, b);
});
