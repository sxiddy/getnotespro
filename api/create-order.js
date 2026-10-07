// POST /api/create-order { products: [codes] } (or { product }) -> ONE Razorpay order for those subjects (the cart), for the signed-in student.
// The student's email and the subject codes go into the order's notes (server-side), which is how the payment is tied to them.
const { send, body, razorpay, env, getUser, itemsOf, priceOf, ownedBy, handle } = require('./_lib');

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
  const amount = items.reduce((n, c) => n + priceOf(c), 0);
  const order = await razorpay('POST', '/orders', {
    amount, currency: 'INR', receipt: 'st_' + Date.now().toString(36),
    notes: { product: 'pro-store', item: items.join(','), email: u.e },
  });
  send(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env('RAZORPAY_KEY_ID'), email: u.e, product: items[0], products: items });
});
