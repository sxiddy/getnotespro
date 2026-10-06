// Shared helpers for the store's functions (files starting with _ are not deployed as endpoints).
const crypto = require('crypto');

const DOMAIN = (process.env.STUDENT_DOMAIN || 'vitstudent.ac.in').toLowerCase(); // only these Google accounts sign in
// Razorpay's website reviewer signs in on /review.html with this username and the REVIEW_CODE the owner sets in
// Vercel (unset = reviewer sign-in is off). The reviewer can see the store and go through the UPI checkout.
const REVIEW_EMAIL = 'review@getnotespro';
const reviewOn = () => !!process.env.REVIEW_CODE;
const USER_COOKIE = 'st_user'; // signed-in student: { e: email }
const MAX_AGE = 400 * 24 * 3600; // browsers cap cookies at 400 days

// One entry per subject site (add a line here, a blurb in app/js/store.js INFO, and the subject appears on the store;
// 'tag' is an optional label that search also matches; the first three subjects show by default, the rest are found by searching. Price is in paise; set PRICE_<CODE> in Vercel to change it (minimum 100 = ₹1).
const PRODUCTS = {
  BACHY105: { name: 'Applied Chemistry', tag: 'Chemistry', site: 'https://bachy105.vercel.app', price: 1000 },
  BAEEE101: { name: 'Basic Engineering', tag: 'Engineering', site: 'https://baeee101.vercel.app', price: 1000 },
  BAENG101: { name: 'Technical English', tag: 'English', site: 'https://baeng101.vercel.app', price: 1000 },
};
function priceOf(code) {
  const n = parseInt(process.env['PRICE_' + code] || '', 10);
  return Number.isInteger(n) && n >= 100 ? n : PRODUCTS[code].price;
}
const isProduct = (c) => Object.prototype.hasOwnProperty.call(PRODUCTS, String(c));

function env(name) {
  const v = process.env[name];
  if (!v) throw Object.assign(new Error(`Server is missing ${name}. Set it in Vercel → Settings → Environment Variables.`), { status: 500 });
  return v;
}
function send(res, status, obj, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (headers) for (const k in headers) res.setHeader(k, headers[k]);
  res.end(JSON.stringify(obj));
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) { const chunks = []; for await (const c of req) chunks.push(c); raw = Buffer.concat(chunks).toString('utf8'); }
  if (/application\/x-www-form-urlencoded/.test(req.headers['content-type'] || '')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- signed cookies
function sign(obj) {
  const payload = b64u(JSON.stringify({ ...obj, t: Math.floor(Date.now() / 1000) }));
  return payload + '.' + b64u(hmac(env('SESSION_SECRET'), payload));
}
function readSigned(req, name) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(name.length + 1).split('.');
  if (!payload || !sig) return null;
  let secret;
  try { secret = env('SESSION_SECRET'); } catch (e) { return null; }
  if (!safeEqual(sig, b64u(hmac(secret, payload)))) return null;
  try { return JSON.parse(unb64u(payload).toString('utf8')); } catch (e) { return null; }
}
function cookie(name, value, maxAge) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
const userCookie = (email) => cookie(USER_COOKIE, sign({ e: email }), MAX_AGE);
const clearUserCookie = () => cookie(USER_COOKIE, '', 0);
const reviewerCookie = () => cookie(USER_COOKIE, sign({ e: REVIEW_EMAIL, r: 1 }), 7 * 24 * 3600);

const normEmail = (s) => String(s || '').trim().toLowerCase();
const isStudentEmail = (e) => new RegExp('^[a-z0-9._%+-]+@' + DOMAIN.replace(/\./g, '\\.') + '$').test(normEmail(e));
function getUser(req) {
  const u = readSigned(req, USER_COOKIE);
  if (u && u.r === 1 && u.e === REVIEW_EMAIL) return reviewOn() ? u : null; // clearing REVIEW_CODE signs the reviewer out everywhere
  return u && isStudentEmail(u.e) ? u : null;
}

// ---------------------------------------------------------------- Google sign-in
let JWKS = null, JWKS_AT = 0;
async function googleKeys() {
  if (JWKS && Date.now() - JWKS_AT < 3600e3) return JWKS;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw Object.assign(new Error('Could not reach Google to check the sign-in. Try again.'), { status: 502 });
  JWKS = (await r.json()).keys || []; JWKS_AT = Date.now();
  return JWKS;
}
async function verifyGoogle(token) {
  const bad = (m) => Object.assign(new Error(m || 'Google sign-in could not be verified. Try again.'), { status: 401 });
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw bad();
  let hdr, c;
  try { hdr = JSON.parse(unb64u(parts[0])); c = JSON.parse(unb64u(parts[1])); } catch (e) { throw bad(); }
  if (hdr.alg !== 'RS256') throw bad();
  let jwk = (await googleKeys()).find((k) => k.kid === hdr.kid);
  if (!jwk) { JWKS = null; jwk = (await googleKeys()).find((k) => k.kid === hdr.kid); }
  if (!jwk) throw bad();
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), unb64u(parts[2]));
  if (!ok) throw bad();
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) throw bad();
  if (c.aud !== env('GOOGLE_CLIENT_ID')) throw bad();
  if (!(c.exp * 1000 > Date.now())) throw bad('That sign-in expired. Please sign in again.');
  if (!c.email_verified) throw bad('Your Google email is not verified.');
  return { email: normEmail(c.email), hd: c.hd ? String(c.hd).toLowerCase() : null, name: c.name || '' };
}

// ---------------------------------------------------------------- Razorpay
async function razorpay(method, path, data) {
  const auth = Buffer.from(env('RAZORPAY_KEY_ID') + ':' + env('RAZORPAY_KEY_SECRET')).toString('base64');
  const r = await fetch('https://api.razorpay.com/v1' + path, {
    method, headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.description) || 'Razorpay request failed'), { status: r.status === 401 ? 401 : 500 });
  return j;
}

// Confirms a payment is real, UPI, on one of the store's orders, and captured (captures it if only authorized).
// The order's notes (set server-side in create-order) carry the student's email and the subject code.
async function checkPayment(paymentId, orderId) {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId || '')) return { ok: false, why: 'That does not look like a Razorpay payment ID (it starts with pay_).' };
  let p = await razorpay('GET', '/payments/' + paymentId);
  if (orderId && p.order_id !== orderId) return { ok: false, why: 'Payment does not belong to this order.' };
  if (p.method !== 'upi') return { ok: false, why: 'Only UPI payments unlock Pro.' };
  if (p.currency !== 'INR' || !(p.amount >= 100)) return { ok: false, why: 'Payment amount does not match.' };
  const order = p.order_id ? await razorpay('GET', '/orders/' + p.order_id) : null;
  const n = (order && order.notes) || {};
  if (!order || n.product !== 'pro-store' || !isProduct(n.item)) return { ok: false, why: 'Payment was not for a Pro unlock.' };
  if (p.status === 'authorized') p = await razorpay('POST', `/payments/${paymentId}/capture`, { amount: p.amount, currency: 'INR' });
  if (p.status !== 'captured') return { ok: false, why: `Payment is ${p.status}, not completed.` };
  return { ok: true, payment: p, order, email: normEmail(n.email), item: n.item };
}

// Pro access is kept in one hash per subject (paid:<CODE>), email -> payment details.
async function recordPaid(email, code, p) {
  const store = require('./_store');
  if (!store.configured()) throw Object.assign(new Error('Storage is not set up, so access cannot be saved.'), { status: 500 });
  await store.pipeline([['HSET', 'paid:' + code, email, JSON.stringify({ id: p.id, at: new Date(p.created_at * 1000).toISOString(), amount: p.amount, order: p.order_id || '', method: p.method || '', contact: p.contact || '' })]]);
}
// a manual grant can end by itself: record.until is a time in ms
const isLive = (raw) => { if (raw == null) return false; try { const x = JSON.parse(raw) || {}; return !(x.until && x.until <= Date.now()); } catch (e) { return true; } };

async function ownedBy(email) {
  const store = require('./_store');
  const out = {};
  const codes = Object.keys(PRODUCTS);
  if (!email || !store.configured()) { codes.forEach((c) => { out[c] = false; }); return out; }
  const res = await store.pipeline(codes.map((c) => ['HGET', 'paid:' + c, email]));
  codes.forEach((c, i) => { out[c] = isLive(res[i]); });
  return out;
}

// A refund is logged in hash "refunds". A full refund also ends Pro for that subject: the record moves from
// paid:<CODE> to refunded:<CODE> (so the history is kept) and the entitlement check says no from then on.
async function recordRefund(o) {
  const store = require('./_store');
  const log = { id: o.refundId, payment: o.paymentId, email: o.email, product: o.code, amount: o.amount, full: !!o.full, at: o.at || new Date().toISOString(), reason: o.reason || '', by: o.by || 'razorpay' };
  await store.pipeline([['HSETNX', 'refunds', o.refundId, JSON.stringify(log)]]);
  if (o.full) {
    const [rec] = await store.pipeline([['HGET', 'paid:' + o.code, o.email]]);
    if (rec == null) return log; // already moved (the admin page and the Razorpay webhook can both report the same refund)
    let x = {}; try { x = JSON.parse(rec || '{}') || {}; } catch (e) { /* ignore */ }
    await store.pipeline([['HSET', 'refunded:' + o.code, o.email, JSON.stringify(Object.assign(x, { refundedAt: log.at, refundId: o.refundId }))], ['HDEL', 'paid:' + o.code, o.email]]);
  }
  return log;
}

function handle(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { send(res, e.status || 500, { error: e.message || 'Something went wrong' }); }
  };
}

module.exports = {
  isLive,
  DOMAIN, PRODUCTS, priceOf, isProduct, env, send, body, hmac, safeEqual, normEmail, isStudentEmail, getUser, userCookie, clearUserCookie, REVIEW_EMAIL, reviewOn, reviewerCookie,
  verifyGoogle, razorpay, checkPayment, recordPaid, recordRefund, ownedBy, handle,
};
