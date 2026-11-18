// Scheduled jobs (Vercel Cron, see vercel.json). Vercel calls this with "Authorization: Bearer <CRON_SECRET>".
//   /api/cron?job=check    every day: is the store, its database, Razorpay and each subject site answering? Messages you only if not.
//   /api/cron?job=weekly   every Monday: a Telegram summary of the week, and an email with a full backup of the database.
// To try one by hand, open it with the header x-admin-key: <ADMIN_KEY> (or add &key=<ADMIN_KEY>).
const { send, safeEqual, env, PRODUCTS, razorpay, isLive, handle } = require('./_lib');
const store = require('./_store');
const { telegram, email, esc } = require('./_notify');

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
    // Can the site ask this store who bought it? A wrong STORE_SECRET/STORE_URL on the subject's Vercel project (EVS,
    // Nov 2026) keeps every buyer locked out and its admin page empty, with no error anywhere else.
    try {
      const r = await fetch(PRODUCTS[c].site + '/api/stats', { headers: { 'x-admin-key': env('ADMIN_KEY') }, signal: AbortSignal.timeout(15000) });
      const p = r.ok ? ((await r.json()).payments || {}) : null;
      if (!p) bad.push(c + ' admin stats answered ' + r.status + ' (is its ADMIN_KEY the same as the store\'s?)');
      else if (p.source !== 'notix') bad.push(c + ' is not linked to the store (set STORE_URL and STORE_SECRET on its Vercel project): buyers will not get Pro');
      else if (p.notixError) bad.push(c + ' cannot read its store sales (' + p.notixError + '): check STORE_SECRET on its Vercel project. Buyers will not get Pro');
    } catch (e) { bad.push(c + ' admin stats did not answer'); }
    // Paid but locked? The 5 newest buyers of this subject on the store must show as paid on its site.
    try {
      const [raw] = await store.pipeline([['HGETALL', 'paid:' + c]]);
      const buyers = Object.entries(flat(raw)).filter(([, v]) => isLive(v)).map(([e, v]) => [e, parse(v).at || '']).sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, 5).map((x) => x[0]);
      const locked = [];
      await Promise.all(buyers.map(async (em) => {
        const r = await fetch(PRODUCTS[c].site + '/api/stats', { method: 'POST', headers: { 'x-admin-key': env('ADMIN_KEY'), 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lookup', email: em }), signal: AbortSignal.timeout(15000) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && !j.paid && !j.free) locked.push(em);
      }));
      if (locked.length) bad.push(c + ': ' + locked.length + ' store ' + (locked.length === 1 ? 'buyer is' : 'buyers are') + ' still locked on the site (' + locked.join(', ') + ')');
    } catch (e) { /* the link check above already reports a broken site */ }
  }));
  try { if (store.configured()) await store.pipeline([['SET', 'health', JSON.stringify({ at: new Date().toISOString(), problems: bad })]]); } catch (e) { /* the admin page just shows the older result */ }
  if (bad.length) await telegram('🚨 <b>Notix check failed</b>\n\n' + bad.map((b) => '• ' + esc(b)).join('\n'));
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
    try { const r = await fetch(PRODUCTS[c].site + '/api/stats', { headers: { 'x-admin-key': env('ADMIN_KEY'), authorization: 'Bearer ' + env('STORE_SECRET') }, signal: AbortSignal.timeout(9000) }); const j = await r.json(); const v = j.visits || {}; return [c, days.reduce((n, d) => n + (+(v[d] && v[d].total != null ? v[d].total : v[d]) || 0), 0), (j.feedback || []).filter((f) => f.status === 'open').length]; }
    catch (e) { return [c, null, null]; }
  }));
  const subjects = Object.entries(per).sort((a, b) => b[1] - a[1]).map(([c, n]) => esc(PRODUCTS[c].name) + ' ' + n).join(' · ') || 'none yet';
  const lines = [
    '📊 <b>Notix weekly</b>',
    '<i>Last 7 days</i>',
    '',
    '💰 <b>' + rs(revenue) + '</b> from ' + sales + (sales === 1 ? ' sale' : ' sales'),
    ...(refunds.length ? ['↩️ Refunded ' + refunds.length + ' (' + rs(refunded) + ')'] : []),
    '📚 ' + subjects,
    '🙋 ' + newPeople + ' new ' + (newPeople === 1 ? 'sign-in' : 'sign-ins'),
    '',
    '👀 Store visits ' + storeV,
    '',
    '<b>Each subject</b> (sales · visits · open messages)',
    ...sites.map(([c, n, open]) => esc(c) + ': ' + (per[c] || 0) + ' · ' + (n == null ? '?' : n) + ' · ' + (open == null ? '?' : open) + (open ? ' ⚠️' : '')),
  ];
  const text = lines.join('\n');
  const sentWa = await telegram(text);
  const file = Buffer.from(JSON.stringify({ at: new Date().toISOString(), data }, null, 1)).toString('base64');
  const sentMail = await email('Notix weekly summary and backup', text.replace(/<[^>]+>/g, '') + '\n\nThe attached file is a full backup of the store database (payments, refunds, sign-ins). Keep it somewhere safe.', [{ filename: 'notix-backup-' + new Date().toISOString().slice(0, 10) + '.json', content: file }]);
  return { ok: true, summary: text.split('\n'), telegram: sentWa, email: sentMail };
}

// Browsers (and Vercel itself) sometimes deliver the same request twice. A job that already ran in the last two minutes is skipped, so you get one message.
async function firstRun(job) {
  if (!store.configured()) return true;
  try { const [r] = await store.pipeline([['SET', 'cronlock:' + job, '1', 'NX', 'EX', 120]]); return !!r; } catch (e) { return true; }
}

module.exports = handle(async (req, res) => {
  if (!authorised(req)) return send(res, 401, { error: 'Not allowed.' });
  const job = new URL(req.url, 'http://x').searchParams.get('job') || 'check';
  if ((job === 'check' || job === 'weekly') && !(await firstRun(job))) return send(res, 200, { ok: true, skipped: 'This job already ran in the last 2 minutes.' });
  if (job === 'check') return send(res, 200, await check());
  if (job === 'weekly') return send(res, 200, await weekly());
  send(res, 400, { error: 'Unknown job.' });
});
