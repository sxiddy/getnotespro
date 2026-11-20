// POST /api/verify (also /api/verify-payment). Three ways in:
//   { razorpay_order_id, razorpay_payment_id, razorpay_signature }  the checkout's own "paid" callback.
//   { action: 'check', orderId }  the page lost the callback (UPI apps often close the tab): ask Razorpay for that
//       order's payments and record a captured or authorized one.
//   Razorpay webhook (header x-razorpay-signature, secret RAZORPAY_WEBHOOK_SECRET): payment.authorized,
//       payment.captured and order.paid unlock the student named in the order even if they closed the page.
// Gift Pro (G2): the buyer is the one who checks the payment (the order's email); Pro is recorded for the friend
// (_lib.recordPurchase), and the answer carries gift: <friend's email> so the page can say where it went.
const crypto = require('crypto');
const { send, body, hmac, safeEqual, env, razorpay, checkPayment, orderInfo, recordPurchase, recordRefund, getUser, itemsOf, handle } = require('./_lib');

async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function unlockOrder(orderId, email) {
  const order = await razorpay('GET', '/orders/' + orderId);
  const n = order.notes || {};
  if (n.product !== 'pro-store' || !itemsOf(n.item)) return { ok: false, why: 'That order is not a Pro unlock.' };
  if (email && n.email !== email) return { ok: false, why: 'That order belongs to a different account.' };
  const pays = ((await razorpay('GET', `/orders/${orderId}/payments`)).items || []).filter((p) => p.status === 'captured' || p.status === 'authorized');
  if (!pays.length) return { ok: false, pending: true, why: 'No completed payment on this order yet.' };
  const chk = await checkPayment(pays[0].id, orderId);
  if (!chk.ok) return { ok: false, why: chk.why };
  await recordPurchase(chk);
  return { ok: true, paymentId: chk.payment.id, item: chk.item, items: chk.items, gift: chk.gift || null };
}

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  const sig = req.headers['x-razorpay-signature'];
  if (sig) {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return send(res, 200, { ok: true, ignored: 'no webhook secret set' });
    const raw = await rawBody(req);
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (!safeEqual(expected, String(sig))) return send(res, 400, { error: 'Bad signature.' });
    let ev = {}; try { ev = JSON.parse(raw); } catch (e) { /* ignore */ }
    const p = ((ev.payload || {}).payment || {}).entity || {};
    // a subject site's Payment Link was paid: grant Pro on that site (api/_sitepay.js re-checks everything with Razorpay)
    if (ev.event === 'payment_link.paid') {
      try {
        const linkId = (((ev.payload || {}).payment_link || {}).entity || {}).id;
        const r = await require('./_sitepay').grantFromLink(linkId);
        return send(res, 200, { ok: true, granted: !!r.ok, why: r.why });
      } catch (e) { return send(res, 500, { error: e.message }); } // Razorpay retries on errors
    }
    // a refund made from the Razorpay dashboard (or by the admin page): a full one ends Pro for that subject
    if (/^(refund\.(processed|created)|payment\.refunded)$/.test(ev.event || '')) {
      try {
        const rf = ((ev.payload || {}).refund || {}).entity || {};
        const paymentId = rf.payment_id || p.id;
        if (!paymentId) return send(res, 200, { ok: true, ignored: 'no payment id' });
        const pay = await razorpay('GET', '/payments/' + paymentId);
        const order = pay.order_id ? await razorpay('GET', '/orders/' + pay.order_id) : null, n = (order && order.notes) || {};
        const info = orderInfo(order), its = info.items; // a gift's Pro is under the friend's email (info.to)
        if (!order || n.product !== 'pro-store' || !its) return send(res, 200, { ok: true, ignored: 'not a store payment' });
        const full = (pay.amount_refunded || 0) >= pay.amount;
        for (const code of its) await recordRefund({ email: info.to, code, paymentId, refundId: (rf.id || ('rf_' + paymentId)) + (its.length > 1 ? '_' + code : ''), amount: rf.amount || pay.amount_refunded || 0, full, reason: 'refund in Razorpay', by: 'razorpay' });
        return send(res, 200, { ok: true, refunded: true, full });
      } catch (e) { return send(res, 500, { error: e.message }); }
    }
    const orderId = p.order_id || (((ev.payload || {}).order || {}).entity || {}).id;
    if (!/^(payment\.(authorized|captured)|order\.paid)$/.test(ev.event || '') || !orderId) return send(res, 200, { ok: true, ignored: ev.event || 'unknown' });
    try { const r = await unlockOrder(orderId, null); return send(res, 200, { ok: true, unlocked: !!r.ok }); }
    catch (e) { return send(res, 500, { error: e.message }); } // Razorpay retries on errors
  }

  const u = getUser(req);
  if (!u) return send(res, 401, { error: 'Please sign in with your VIT student account first.' });
  const b = await body(req);

  if (b.action === 'check') {
    const orderId = String(b.orderId || '');
    if (!/^order_[A-Za-z0-9]+$/.test(orderId)) return send(res, 400, { error: 'Bad order id.' });
    const r = await unlockOrder(orderId, u.e);
    if (r.ok) return send(res, 200, { ok: true, paymentId: r.paymentId, item: r.item, items: r.items, gift: r.gift });
    return send(res, r.pending ? 202 : 402, { ok: false, pending: !!r.pending, error: r.why });
  }

  const { razorpay_order_id: o, razorpay_payment_id: p, razorpay_signature: s } = b;
  if (!o || !p || !s) return send(res, 400, { error: 'Missing payment details.' });
  const expected = hmac(env('RAZORPAY_KEY_SECRET'), o + '|' + p).toString('hex');
  if (!safeEqual(expected, s)) return send(res, 400, { error: 'Payment signature did not match.' });
  const chk = await checkPayment(p, o);
  if (!chk.ok) return send(res, 402, { error: chk.why });
  if (chk.email !== u.e) return send(res, 403, { error: 'This payment was made from a different account.' });
  await recordPurchase(chk); // chk.email is u.e (checked just above)
  send(res, 200, { ok: true, paymentId: p, item: chk.item, items: chk.items, gift: chk.gift || null });
});
