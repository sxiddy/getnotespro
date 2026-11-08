// Discount codes (F10): the rules, and where they are kept. Used by api/offers.js (quote + admin), api/create-order.js
// (prices the order) and _lib.recordPurchase (spends a use once a payment is verified).
//
// A code is { code, pct, max, until, codes, off, at, note }:
//   pct    percent off, 1-99 (free Pro is what the admin's Give Pro is for)
//   max    how many students can use it; 0 = no limit
//   until  ms time it stops working; 0 = never
//   codes  the subjects it works on; [] = all
//   off    paused by the admin (looks the same as an unknown code to students)
// Each student can use a code once. A use is spent only when a payment is verified, so a failed or abandoned payment
// costs nothing. The limit is checked when the order is made, so two students paying at the same moment can take it
// one past its limit: they have paid, so they always get Pro.
//
// Prices: each subject the code covers costs pct less, rounded DOWN to whole rupees, and never below ₹1 (Razorpay's
// smallest payment). The page shows the same sum (src/scripts/core.js quote()), but the order's amount comes only from
// the server, and the order's notes carry the code and each subject's share ("shares"), which is what gets recorded.
const { PRODUCTS, isProduct } = require('./_lib');
const store = require('./_store');

const KEY = 'offers'; // hash: CODE -> JSON offer
const usedKey = (code) => 'offer-used:' + code; // hash: email -> JSON { payment, order, at }
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,19}$/; // 4-20 letters, digits or dashes
const DAY = 864e5;

const normCode = (s) => String(s == null ? '' : s).trim().toUpperCase();
const intOr = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v));

// what the admin typed -> { offer } or { error }
function makeOffer(b, now = Date.now()) {
  const code = normCode(b.code);
  if (!CODE_RE.test(code)) return { error: 'A code is 4 to 20 letters, digits or dashes, with no spaces.' };
  const pct = Number(b.pct);
  if (!Number.isInteger(pct) || pct < 1 || pct > 99) return { error: 'Percent off must be a whole number from 1 to 99.' };
  const max = intOr(b.max, 0);
  if (!Number.isInteger(max) || max < 0 || max > 100000) return { error: 'Number of students must be 0 (no limit) or more.' };
  const days = intOr(b.days, 0);
  if (!Number.isFinite(days) || days < 0 || days > 366) return { error: 'Days must be 0 (never ends) up to 366.' };
  const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map(normCode))];
  if (!codes.every(isProduct)) return { error: 'Unknown subject in the list.' };
  const note = String(b.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
  return { offer: { code, pct, max, until: days ? now + Math.round(days * DAY) : 0, codes, off: false, at: now, note } };
}

const payFor = (price, pct) => Math.max(100, Math.floor((price * (100 - pct)) / 100 / 100) * 100);
const covers = (offer, code) => !offer.codes.length || offer.codes.includes(code);

// items: subject codes; priceOf(code) -> paise; offer may be null
function priceCart(items, priceOf, offer) {
  const lines = items.map((code) => {
    const price = priceOf(code);
    return { code, price, pay: offer && covers(offer, code) ? Math.min(price, payFor(price, offer.pct)) : price };
  });
  const total = lines.reduce((n, l) => n + l.pay, 0);
  return { lines, total, discount: lines.reduce((n, l) => n + l.price, 0) - total };
}

// null when the code can be used on these items, otherwise what to tell the student
function checkOffer(offer, { items, now = Date.now(), uses = 0, usedByMe = false }) {
  if (!offer || offer.off) return "That code isn't valid. Check the spelling.";
  if (offer.until && now >= offer.until) return 'That code has expired.';
  if (offer.max && uses >= offer.max) return 'That code has been used up.';
  if (usedByMe) return "You've already used that code.";
  if (!items.some((c) => covers(offer, c))) return 'That code is only for ' + offer.codes.map((c) => PRODUCTS[c].name).join(', ') + '.';
  return null;
}

// ---------------------------------------------------------------- storage
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

// { offer, uses, usedByMe } for one code (email may be empty: then usedByMe is false)
async function load(code, email) {
  code = normCode(code);
  if (!CODE_RE.test(code) || !store.configured()) return { offer: null, uses: 0, usedByMe: false };
  const [raw, uses, mine] = await store.pipeline([['HGET', KEY, code], ['HLEN', usedKey(code)], ['HEXISTS', usedKey(code), email || '-']]);
  return { offer: raw ? parse(raw) : null, uses: +uses || 0, usedByMe: !!email && +mine === 1 };
}
// the whole check for a cart: { offer, priced } or { error }
async function apply(code, items, email, priceOf, now = Date.now()) {
  const st = await load(code, email);
  const error = checkOffer(st.offer, { items, now, uses: st.uses, usedByMe: st.usedByMe });
  return error ? { error } : { offer: st.offer, priced: priceCart(items, priceOf, st.offer) };
}
// a verified payment used this code; true if this was a new use (the same payment can be reported more than once)
async function spend(code, email, info) {
  const [n] = await store.pipeline([['HSETNX', usedKey(normCode(code)), email, JSON.stringify(info)]]);
  return +n === 1;
}
async function list() {
  const [flat] = await store.pipeline([['HGETALL', KEY]]) || [[]];
  const items = [];
  for (let i = 1; flat && i < flat.length; i += 2) { const x = parse(flat[i]); if (x && x.code) items.push(x); }
  const counts = items.length ? await store.pipeline(items.map((x) => ['HLEN', usedKey(x.code)])) : [];
  return items.map((x, i) => Object.assign(x, { uses: +counts[i] || 0 })).sort((a, b) => b.at - a.at);
}
async function add(offer) {
  const [n] = await store.pipeline([['HSETNX', KEY, offer.code, JSON.stringify(offer)]]);
  return +n === 1;
}
async function setOff(code, off) {
  const st = await load(code, '');
  if (!st.offer) return false;
  await store.pipeline([['HSET', KEY, st.offer.code, JSON.stringify(Object.assign(st.offer, { off: !!off }))]]);
  return true;
}
// deleting also forgets who used it, so the same code can be made again from zero (each payment record keeps its code)
async function remove(code) {
  code = normCode(code);
  const [n] = await store.pipeline([['HDEL', KEY, code], ['DEL', usedKey(code)]]);
  return +n === 1;
}

module.exports = { normCode, makeOffer, priceCart, checkOffer, load, apply, spend, list, add, setOff, remove };
