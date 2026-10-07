// Scheduled jobs (Vercel Cron, see vercel.json). Vercel calls this with "Authorization: Bearer <CRON_SECRET>".
//   /api/cron?job=check    every day: is the store, its database, Razorpay and each subject site answering? Messages you only if not.
//   /api/cron?job=weekly   every Monday: a Telegram summary of the week, and an email with a full backup of the database.
// To try one by hand, open it with the header x-admin-key: <ADMIN_KEY> (or add &key=<ADMIN_KEY>).
const { send, safeEqual, env, PRODUCTS, razorpay, handle } = require('./_lib');
const store = require('./_store');
const { telegram, email } = require('./_notify');

const codes = Object.keys(PRODUCTS);
const rs = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const parse = (s) => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
const flat = (a) => { const o = {}; for (let i = 0; a && i < a.length; i += 2) o[a[i]] = a[i + 1]; return o; };

function authorised(req) {
  const h = String(req.headers.authorization || ''), cs = process.env.CRON_SECRET;
  if (cs && safeEqual(h, 'Bearer ' + cs)) return true;
  const ak = process.env.ADMIN_KEY, given = String(req.headers['x-admin-key'] || new URL(req.url, 'http://x').searchParams.get('key') || '');
  return !!(ak && given && safeEqual(given, ak));
}

async function check() {
  const bad = [];
  try { if (store.configured()) { const [p] = await store.pipeline([['HLEN', 'storeVisits']]); if (p == null) bad.push('database did not answer'); } else bad.push('database is not set up'); } catch (e) { bad.push('database: ' + e.message); }
  try { await razorpay('GET', '/orders?count=1'); } catch (e) { bad.push('Razorpay: ' + e.message); }
  await Promise.all(codes.map(async (c) => {
    try { const r = await fetch(PRODUCTS[c].site + '/', { signal: AbortSignal.timeout(9000) }); if (!r.ok) bad.push(c + ' site answered ' + r.status); }
    catch (e) { bad.push(c + ' site did not answer'); }
  }));
  if (bad.length) await telegram('Notix check failed:\n- ' + bad.join('\n- '));
  return { ok: !bad.length, problems: bad };
}

// the last 7 days, counted in Indian time like the visit counters
const IST = 5.5 * 3600e3;
const lastDays = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() + IST - i * 864e5).toISOString().slice(0, 10));

async function weekly() {
  if (!store.configured()) return { ok: false, error: 'database is not set up' };
  const keys = [...codes.map((c) => 'paid:' + c), ...codes.map((c) => 'refunded:' + c), 'refunds', 'userFirst', 'userLogin', 'userLogins', 'storeVisits'];
  const res = await store.pipeline(keys.map((k) => ['HGETALL', k]));
  const data = {}; keys.forEach((k, i) => { data[k] = flat(res[i]); });
  const since = Date.now() - 7 * 864e5, days = lastDays(7);
  let sales = 0, revenue = 0; const per = {};
  codes.forEach((c) => { Object.values(data['paid:' + c]).forEach((raw) => { const x = parse(raw); if (x.manual || !x.at || Date.parse(x.at) < since) return; sales++; revenue += x.amount || 0; per[c] = (per[c] || 0) + 1; }); });
  const refunds = Object.values(data.refunds).map(parse).filter((x) => Date.parse(x.at) >= since), refunded = refunds.reduce((n, x) => n + (x.amount || 0), 0);
  const newPeople = Object.values(data.userFirst).filter((v) => Date.parse(v) >= since).length;
  const storeV = days.reduce((n, d) => n + (+data.storeVisits[d] || 0), 0);
  const sites = await Promise.all(codes.map(async (c) => {
    try { const r = await fetch(PRODUCTS[c].site + '/api/stats', { headers: { 'x-admin-key': env('ADMIN_KEY') }, signal: AbortSignal.timeout(9000) }); const j = await r.json(); const v = j.visits || {}; return [c, days.reduce((n, d) => n + (+(v[d] && v[d].total != null ? v[d].total : v[d]) || 0), 0)]; }
    catch (e) { return [c, null]; }
  }));
  const top = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([c, n]) => PRODUCTS[c].name + ' ' + n).join(', ') || 'none';
  const lines = [
    'Notix, last 7 days',
    'Pro sold: ' + sales + ' (' + rs(revenue) + ')' + (refunds.length ? ', refunded ' + refunds.length + ' (' + rs(refunded) + ')' : ''),
    'By subject: ' + top,
    'New students signed in on the store: ' + newPeople,
    'Visits: store ' + storeV + (sites.length ? ', ' + sites.map(([c, n]) => c + ' ' + (n == null ? '?' : n)).join(', ') : ''),
  ];
  const text = lines.join('\n');
  const sentWa = await telegram(text);
  const file = Buffer.from(JSON.stringify({ at: new Date().toISOString(), data }, null, 1)).toString('base64');
  const sentMail = await email('Notix weekly summary and backup', text + '\n\nThe attached file is a full backup of the store database (payments, refunds, sign-ins). Keep it somewhere safe.', [{ filename: 'notix-backup-' + new Date().toISOString().slice(0, 10) + '.json', content: file }]);
  return { ok: true, summary: lines, telegram: sentWa, email: sentMail };
}

module.exports = handle(async (req, res) => {
  if (!authorised(req)) return send(res, 401, { error: 'Not allowed.' });
  const job = new URL(req.url, 'http://x').searchParams.get('job') || 'check';
  if (job === 'check') return send(res, 200, await check());
  if (job === 'weekly') return send(res, 200, await weekly());
  send(res, 400, { error: 'Unknown job.' });
});
