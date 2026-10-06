// POST /api/track { visit: true } -> +1 to today's visitors of the store (sent once per browser per day, nothing personal stored)
const { send, handle } = require('./_lib');
const store = require('./_store');

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (store.configured()) await store.pipeline([['HINCRBY', 'visits', store.today(), 1]]);
  send(res, 200, { ok: true });
});
