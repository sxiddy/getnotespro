// POST /api/create-order { products: [codes], code? } (or { product }) -> ONE Razorpay order for those subjects (the cart),
// for the signed-in student. The student's email and the subject codes go into the order's notes (server-side), which is
// how the payment is tied to them. With a discount code (F10, api/_offers.js) the amount is the discounted one, and the
// notes also carry the code and each subject's share, so verify records the right amounts and spends the use.
// Referrals (G8, api/_referrals.js): { ref } is the friend's link token from the page; it goes into the notes only if
// this buyer can still credit it. { reward: true } prices the whole cart with the student's own 50% reward (notes:
// reward 'REF50' + shares). One discount per order: a reward and a code together are refused.
const { send, body, razorpay, env, getUser, itemsOf, priceOf, ownedBy, handle } = require('./_lib');
const offers = require('./_offers');
const refs = require('./_referrals');

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const u = getUser(req);
  if (!u) return send(res, 401, { error: 'Please sign in with your VIT student account first.' });
  const b = await body(req);
  const list = Array.isArray(b.products) ? b.products.map(String) : [String(b.product || '')];
  const items = itemsOf(list.join(','));
  if (!items) return send(res, 400, { error: 'Unknown subject.' });
  const owned = await ownedBy(u.e);
  const have = items.filter((c) => owned[c]);
  if (have.length) return send(res, 409, { error: 'You already have Pro for ' + have.join(', ') + '.' });
  const notes = { product: 'pro-store', item: items.join(','), email: u.e };
  let amount = items.reduce((n, c) => n + priceOf(c), 0), offer = null, reward = false;
  const useReward = b.reward === true;
  if (useReward && offers.normCode(b.code)) return send(res, 400, { error: 'One discount per order: use your 50% reward or a code, not both.' });
  if (useReward) {
    if (!(await refs.rewardsOf(u.e)).rewards) return send(res, 400, { error: "You don't have a 50% reward to use.", badReward: true });
    const priced = refs.priceReward(items, priceOf);
    if (priced.discount > 0) {
      reward = true; amount = priced.total;
      Object.assign(notes, { reward: refs.REWARD, shares: priced.lines.map((l) => l.pay).join(',') });
    }
  } else if (offers.normCode(b.code)) {
    const r = await offers.apply(b.code, items, u.e, priceOf);
    if (r.error) return send(res, 400, { error: r.error, badOffer: true }); // the page drops the code and shows why
    if (r.priced.discount > 0) {
      offer = r.offer.code; amount = r.priced.total;
      Object.assign(notes, { offer, shares: r.priced.lines.map((l) => l.pay).join(',') });
    }
  }
  const ref = b.ref ? await refs.eligible(b.ref, u.e) : '';
  if (ref) notes.ref = ref;
  const order = await razorpay('POST', '/orders', { amount, currency: 'INR', receipt: 'st_' + Date.now().toString(36), notes });
  send(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env('RAZORPAY_KEY_ID'), email: u.e, product: items[0], products: items, offer, reward });
});
