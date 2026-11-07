// Community features, grouped in one Vercel function to stay under the 12-function limit.
// Announcements (G5 "Updated" badges and /updates). Requests, upvotes, notify-me and reviews join here later.
//   GET  /api/community?part=ann[&code=CODE] -> { items: [{ id, at, title, body, codes }] }  newest first, public.
//        Subject sites may read it too (CORS open, cached at the edge for a minute).
//   POST /api/community  header x-admin-key = ADMIN_KEY:
//     { action: 'ann-add', title, body, codes: ['BAEEE101', ...] }  codes empty = for the whole store
//     { action: 'ann-del', id }
// Text is stored as plain text; every page that shows it must escape it.
const crypto = require('crypto');
const { send, body, env, safeEqual, isProduct, handle } = require('./_lib');
const store = require('./_store');

const ANN = 'ann'; // hash: id -> JSON { id, at, title, body, codes }
const MAX_ANN = 100;
// browsers always ask again; Vercel's edge may answer from a copy up to a minute old (so a new update shows within a minute)
const PUBLIC = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=0, must-revalidate', 'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=300' };

// plain text only: no control characters (newlines kept in the body), squeezed spaces, length capped
const clean = (s, max, lines) => String(s == null ? '' : s)
  .replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

async function listAnn(code) {
  const [flat] = await store.pipeline([['HGETALL', ANN]]) || [[]];
  const out = [];
  for (let i = 1; flat && i < flat.length; i += 2) { const x = parse(flat[i]); if (x && x.id) out.push(x); }
  return out.filter((x) => !code || !x.codes.length || x.codes.includes(code)).sort((a, b) => b.at - a.at);
}

function isAdmin(req) {
  const key = String(req.headers['x-admin-key'] || '');
  let expected; try { expected = env('ADMIN_KEY'); } catch (e) { return false; }
  return !!key && safeEqual(key, expected);
}

module.exports = handle(async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (req.method === 'OPTIONS') return send(res, 204, {}, { ...PUBLIC, 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET' });

  if (req.method === 'GET') {
    if (q.get('part') !== 'ann') return send(res, 400, { error: 'Unknown part.' });
    const code = String(q.get('code') || '').toUpperCase();
    if (code && !isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
    if (!store.configured()) return send(res, 200, { items: [] }, PUBLIC);
    return send(res, 200, { items: await listAnn(code) }, PUBLIC);
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
  if (!isAdmin(req)) return send(res, 401, { error: 'Wrong admin key.' });
  if (!store.configured()) return send(res, 500, { error: 'The database is not connected.' });
  const b = await body(req);

  if (b.action === 'ann-add') {
    const title = clean(b.title, 90), text = clean(b.body, 600, true);
    const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map((c) => String(c).toUpperCase()))];
    if (!title) return send(res, 400, { error: 'Write a title.' });
    if (!codes.every(isProduct)) return send(res, 400, { error: 'Unknown subject in the list.' });
    const items = await listAnn('');
    if (items.length >= MAX_ANN) return send(res, 400, { error: 'There are ' + MAX_ANN + ' updates already. Delete some old ones first.' });
    const x = { id: crypto.randomBytes(6).toString('hex'), at: Date.now(), title, body: text, codes };
    await store.pipeline([['HSET', ANN, x.id, JSON.stringify(x)]]);
    return send(res, 200, { ok: true, item: x });
  }
  if (b.action === 'ann-del') {
    const id = String(b.id || '');
    if (!/^[a-f0-9]{12}$/.test(id)) return send(res, 400, { error: 'Bad id.' });
    const [n] = await store.pipeline([['HDEL', ANN, id]]);
    return send(res, 200, { ok: true, removed: +n || 0 });
  }
  return send(res, 400, { error: 'Unknown action.' });
});
