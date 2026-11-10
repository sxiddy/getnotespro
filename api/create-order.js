// POST /api/create-order { products: [codes], code? } (or { product }) -> ONE Razorpay order for those subjects (the cart),
// for the signed-in student. The student's email and the subject codes go into the order's notes (server-side), which is
// how the payment is tied to them. With a discount code (F10, api/_offers.js) the amount is the discounted one, and the
// notes also carry the code and each subject's share, so verify records the right amounts and spends the use.
// Referrals (G8, api/_referrals.js): { ref } is the friend's link token from the page; it goes into the notes only if
// this buyer can still credit it. { reward: true } prices the whole cart with the student's own 50% reward (notes:
// reward 'REF50' + shares). One discount per order: a reward and a code together are refused.
// Gift Pro (G2): { gift: email } buys the cart for a friend. Rules:
//   - only a signed-in VIT student can send one (not the review account); the friend's email is trimmed and lower-cased
//     and must be a VIT student email that is not the buyer's own (400, badGift: true, so the page points at the field)
//   - the FRIEND must not already own any of the subjects (409 naming them, owned: [codes]); the buyer's own Pro
//     doesn't matter (you can gift a subject you have)
//   - notes: email = the buyer (who pays and checks the payment), gift = the friend (who gets Pro, see _lib.orderInfo)
//   - a discount code works and spends the BUYER's one use; the 50% reward does not (400: it is for the student's own
//     purchase); the friend's link (ref) is never written, so a gift credits nobody and is not the buyer's first purchase
// An empty gift field is an ordinary purchase.
const { send, body, razorpay, env, getUser, itemsOf, priceOf, ownedBy, normEmail, isStudentEmail, PRODUCTS, DOMAIN, handle } = require('./_lib');
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
  const gift = b.gift == null ? '' : normEmail(typeof b.gift === 'string' ? b.gift : '[bad]');
  if (gift) {
    if (!isStudentEmail(u.e)) return send(res, 403, { error: 'Gifts are for VIT student accounts.' });
    if (!isStudentEmail(gift)) return send(res, 400, { error: "Enter your friend's VIT student email (it ends in @" + DOMAIN + ').', badGift: true });
    if (gift === u.e) return send(res, 400, { error: "That's your own email. A gift goes to a friend; to buy for yourself, turn off This is a gift.", badGift: true });
    if (b.reward === true) return send(res, 400, { error: 'Your 50% reward is for your own purchase, not gifts. A discount code still works.' });
  }
  const owner = gift || u.e;
  const owned = await ownedBy(owner);
  const have = items.filter((c) => owned[c]);
  if (have.length) {
    const names = have.map((c) => PRODUCTS[c].name).join(', ');
    return send(res, 409, gift ? { error: `Your friend already has Pro for ${names}. Take it out of the cart to send the rest.`, owned: have } : { error: 'You already have Pro for ' + have.join(', ') + '.', owned: have });
  }
  const notes = { product: 'pro-store', item: items.join(','), email: u.e };
  if (gift) notes.gift = gift;
  let amount = items.reduce((n, c) => n + priceOf(c), 0), offer = null, reward = false;
  const useReward = b.reward === true;
  // the 50% reward was replaced by Rs 3 cash a friend (owner, 10-11-2026): no new reward orders
  if (useReward) return send(res, 400, { error: 'The 50% reward is now ₹3 cash for every friend. See Invite friends.', badReward: true });
  if (useReward && offers.normCode(b.code)) return send(res, 400, { error: 'One discount per order: use your 50% reward or a code, not both.' });
  if (useReward) {
    if (!(await refs.rewardsOf(u.e)).rewards) return send(res, 400, { error: "You don't have a 50% reward to use.", badReward: true });
    const priced = refs.priceReward(items, priceOf);
    if (priced.discount > 0) {
      reward = true; amount = priced.total;
      Object.assign(notes, { reward: refs.REWARD, shares: priced.lines.map((l) => l.pay).join(',') });
    }
  } else if (offers.normCode(b.code)) {
    const r = await offers.apply(b.code, items, u.e, priceOf); // the buyer's use, also for a gift
    if (r.error) return send(res, 400, { error: r.error, badOffer: true }); // the page drops the code and shows why
    if (r.priced.discount > 0) {
      offer = r.offer.code; amount = r.priced.total;
      Object.assign(notes, { offer, shares: r.priced.lines.map((l) => l.pay).join(',') });
    }
  }
  const ref = b.ref && !gift ? await refs.eligible(b.ref, u.e) : '';
  if (ref) notes.ref = ref;
  const order = await razorpay('POST', '/orders', { amount, currency: 'INR', receipt: 'st_' + Date.now().toString(36), notes });
  send(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env('RAZORPAY_KEY_ID'), email: u.e, product: items[0], products: items, offer, reward, gift: gift || null });
});
