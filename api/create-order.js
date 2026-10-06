// POST /api/create-order { product } -> Razorpay order for that subject at its current price, for the signed-in student.
// The student's email and the subject go into the order's notes (server-side), which is how the payment is tied to them.
const { send, body, razorpay, env, getUser, isProduct, priceOf, ownedBy, handle } = require('./_lib');

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const u = getUser(req);
  if (!u) return send(res, 401, { error: 'Please sign in with your VIT student account first.' });
  const b = await body(req), code = String(b.product || '');
  if (!isProduct(code)) return send(res, 400, { error: 'Unknown subject.' });
  if ((await ownedBy(u.e))[code]) return send(res, 409, { error: 'You already have Pro for this subject.' });
  const price = priceOf(code);
  const order = await razorpay('POST', '/orders', {
    amount: price, currency: 'INR', receipt: 'st_' + Date.now().toString(36),
    notes: { product: 'pro-store', item: code, email: u.e },
  });
  send(res, 200, { orderId: order.id, amount: order.amount, currency: order.currency, keyId: env('RAZORPAY_KEY_ID'), email: u.e, product: code });
});
