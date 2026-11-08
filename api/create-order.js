// POST /api/create-order { products: [codes], code? } (or { product }) -> ONE Razorpay order for those subjects (the cart),
// for the signed-in student. The student's email and the subject codes go into the order's notes (server-side), which is
// how the payment is tied to them. With a discount code (F10, api/_offers.js) the amount is the discounted one, and the
// notes also carry the code and each subject's share, so verify records the right amounts and spends the use.
const { send, body, razorpay, env, getUser, itemsOf, priceOf, ownedBy, handle } = require('./_lib');
const offers = require('./_offers');

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
  let amount = items.reduce((n, c) => n + priceOf(c), 0), offer = null;
  if (offers.normCode(b.code)) {
    const r = await offers.apply(b.code, items, u.e, priceOf);
    if (r.error) return send(res, 400, { error: r.error, badOffer: true }); // the page drops the code and shows why
    if (r.priced.discount > 0) {
      offer = r.offer.code; amount = r.priced.total;
      Object.assign(notes, { offer, shares: r.priced.lines.map((l) => l.pay).join(',') });
    }
  }
  const order = await razorpay('POST', '/orders', { amount, currency: 'INR', receipt: 'st_' + Date.now().toString(36), notes });
  send(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env('RAZORPAY_KEY_ID'), email: u.e, product: items[0], products: items, offer });
});
