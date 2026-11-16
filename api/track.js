// (own key: the database is shared with a notes site, whose "visits" must stay untouched)
// POST /api/track { visit: true } -> +1 to today's visitors of the store (sent once per browser per day, nothing personal stored)
// POST /api/track { soon: 'BAPHY105' } -> +1 to today's visitors of that coming-soon site (sent by the site's page, cross-origin)
const { send, handle, body } = require('./_lib');
const store = require('./_store');
const UPCOMING = new Set(require('./_upcoming').map((u) => u.code));
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST' };

module.exports = handle(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {}, CORS);
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' }, CORS);
  const b = await body(req);
  const soon = b && typeof b.soon === 'string' ? b.soon.toUpperCase() : '';
  if (store.configured()) {
    if (soon) { if (UPCOMING.has(soon)) await store.pipeline([['HINCRBY', 'soonVisits:' + soon, store.today(), 1]]); }
    else await store.pipeline([['HINCRBY', 'storeVisits', store.today(), 1]]);
  }
  send(res, 200, { ok: true }, CORS);
});
