// Referrals (G8): the rules, and where they are kept. Used by api/offers.js (ref-me + admin list), api/create-order.js
// (writes the friend's link into the order, prices a reward) and _lib.recordPurchase / recordRefund.
//
// Every signed-in VIT student has a link <site>/?ref=<token>. The token is random (it never shows the email):
//   ref:id   hash token -> email          ref:of   hash email -> token
// When a friend buys through the link, the student earns ONE reward: 50% off one purchase, which can be a whole cart.
// The friend pays the normal price (owner, 09-11-2026). A friend counts only if:
//   - it is not the student's own email, and both are VIT student emails;
//   - it is the friend's first purchase (no paid:* or refunded:* record from any other payment);
//   - the payment is a verified UPI payment (_lib.checkPayment, or admin reconcile for method 'upi');
//   - the friend has never credited anyone: each buyer credits at most one referrer, ever.
//   ref:by             hash buyer -> JSON { ref, payment, order, at, revoked? }   the one referrer this buyer credited
//   ref:friends:<ref>  hash buyer -> JSON { payment, at }   friends who bought = rewards earned (HLEN)
//   ref:used:<email>   hash payment id -> JSON { order, at }   rewards spent (HLEN), one per verified payment
// Rewards left = earned - spent. Like a discount code, a reward is checked when the order is made and spent only by a
// verified payment, so failed or abandoned payments cost nothing. Two reward orders paid at the same moment both get
// their discount (money taken = Pro given); the extra one is taken from the next reward earned.
// A full refund of the friend's crediting purchase takes that reward back (the friend still never credits again).
// One discount per order: a reward and a discount code cannot be combined.
const crypto = require('crypto');
const store = require('./_store');
const { PRODUCTS, isStudentEmail, normEmail } = require('./_lib');
const { priceCart } = require('./_offers');

const REWARD = 'REF50'; // the order-notes marker; also kept as "offer" on the paid record
const PCT = 50;
const TOKEN_RE = /^[A-Za-z0-9_-]{8,16}$/;
const friendsKey = (e) => 'ref:friends:' + e;
const usedKey = (e) => 'ref:used:' + e;
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const normToken = (t) => { t = String(t == null ? '' : t).trim(); return TOKEN_RE.test(t) ? t : ''; };

// 50% off every subject in the cart, rounded down to whole rupees, never below ₹1 (the discount-code rule)
const priceReward = (items, priceOf) => priceCart(items, priceOf, { pct: PCT, codes: [] });

// the student's token, made on first ask
async function tokenFor(email) {
  const [have] = await store.pipeline([['HGET', 'ref:of', email]]);
  if (have) return have;
  for (let i = 0; i < 5; i++) {
    const t = crypto.randomBytes(6).toString('base64url'); // 8 characters
    const [n] = await store.pipeline([['HSETNX', 'ref:id', t, email]]);
    if (+n !== 1) continue; // taken (very unlikely): try another
    const [m, now] = await store.pipeline([['HSETNX', 'ref:of', email, t], ['HGET', 'ref:of', email]]);
    if (+m !== 1) await store.pipeline([['HDEL', 'ref:id', t]]); // another request made one at the same moment: keep that one
    return now;
  }
  throw Object.assign(new Error("Couldn't make your link. Try again."), { status: 500 });
}
async function emailOf(token) {
  token = normToken(token);
  if (!token || !store.configured()) return null;
  const [e] = await store.pipeline([['HGET', 'ref:id', token]]);
  return e || null;
}
// has this email bought (or been given) any subject, other than by this payment?
async function boughtBefore(email, exceptPayment) {
  const codes = Object.keys(PRODUCTS);
  const res = await store.pipeline(codes.flatMap((c) => [['HGET', 'paid:' + c, email], ['HGET', 'refunded:' + c, email]]));
  return res.some((r) => r != null && !(exceptPayment && (parse(r) || {}).id === exceptPayment));
}
// create-order: the token to write into the order, or '' when this buyer can't credit it
async function eligible(token, buyer) {
  token = normToken(token); buyer = normEmail(buyer);
  if (!token || !store.configured() || !isStudentEmail(buyer)) return '';
  const [ref, by] = await store.pipeline([['HGET', 'ref:id', token], ['HEXISTS', 'ref:by', buyer]]);
  if (!ref || ref === buyer || !isStudentEmail(ref) || +by === 1) return '';
  return (await boughtBefore(buyer)) ? '' : token;
}
// a verified payment by a first-time buyer whose order carried a link (recordPurchase checks "first time" before it
// records the payment). True if this was a new credit; safe to call again for the same payment.
async function credit(token, buyer, payment) {
  const ref = await emailOf(token);
  if (!ref || ref === buyer || !isStudentEmail(ref) || !isStudentEmail(buyer) || payment.method !== 'upi') return false;
  const at = new Date().toISOString();
  const [, cur] = await store.pipeline([['HSETNX', 'ref:by', buyer, JSON.stringify({ ref, payment: payment.id, order: payment.order_id || '', at })], ['HGET', 'ref:by', buyer]]);
  const x = parse(cur);
  if (!x || x.ref !== ref || x.payment !== payment.id || x.revoked) return false; // this buyer already credited someone
  const [n] = await store.pipeline([['HSETNX', friendsKey(ref), buyer, JSON.stringify({ payment: payment.id, at })]]);
  return +n === 1;
}
// a verified payment for a reward order spends one reward (once per payment)
async function spendReward(email, payment) {
  const [n] = await store.pipeline([['HSETNX', usedKey(email), payment.id, JSON.stringify({ order: payment.order_id || '', at: new Date().toISOString() })]]);
  return +n === 1;
}
// recordRefund after a full refund: if that was the buyer's crediting purchase and nothing from it is still paid,
// the referrer loses that reward
async function onRefund(buyer, paymentId) {
  if (!store.configured()) return false;
  const [cur] = await store.pipeline([['HGET', 'ref:by', buyer]]);
  const x = parse(cur);
  if (!x || x.payment !== paymentId || x.revoked) return false;
  const still = await store.pipeline(Object.keys(PRODUCTS).map((c) => ['HGET', 'paid:' + c, buyer]));
  if (still.some((r) => (parse(r) || {}).id === paymentId)) return false;
  await store.pipeline([['HSET', 'ref:by', buyer, JSON.stringify(Object.assign(x, { revoked: new Date().toISOString() }))], ['HDEL', friendsKey(x.ref), buyer]]);
  return true;
}
async function rewardsOf(email) {
  if (!email || !store.configured()) return { friends: 0, used: 0, rewards: 0 };
  const [f, u] = await store.pipeline([['HLEN', friendsKey(email)], ['HLEN', usedKey(email)]]);
  return { friends: +f || 0, used: +u || 0, rewards: Math.max(0, (+f || 0) - (+u || 0)) };
}
// admin: every credited buyer, and each referrer's friends / spent / left
async function adminList() {
  const [flat, links] = await store.pipeline([['HGETALL', 'ref:by'], ['HLEN', 'ref:of']]);
  const buyers = [];
  for (let i = 0; flat && i + 1 < flat.length; i += 2) { const x = parse(flat[i + 1]); if (x && x.ref) buyers.push({ buyer: flat[i], ref: x.ref, payment: x.payment, at: x.at, revoked: x.revoked || null }); }
  buyers.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const refs = [...new Set(buyers.map((b) => b.ref))];
  const counts = refs.length ? await store.pipeline(refs.flatMap((e) => [['HLEN', friendsKey(e)], ['HLEN', usedKey(e)]])) : [];
  const top = refs.map((email, i) => {
    const friends = +counts[2 * i] || 0, used = +counts[2 * i + 1] || 0;
    return { email, friends, used, rewards: Math.max(0, friends - used) };
  }).sort((a, b) => b.friends - a.friends || b.used - a.used || a.email.localeCompare(b.email));
  const sum = (k) => top.reduce((n, x) => n + x[k], 0);
  return { totals: { links: +links || 0, credited: sum('friends'), used: sum('used'), left: sum('rewards') }, top: top.slice(0, 100), buyers: buyers.slice(0, 300) };
}

module.exports = { REWARD, PCT, normToken, priceReward, tokenFor, emailOf, boughtBefore, eligible, credit, spendReward, onRefund, rewardsOf, adminList };
