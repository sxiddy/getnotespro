// POST /api/donate { amount: rupees, from?: site } -> a Razorpay Payment Link for a donation of any amount (₹1 to ₹10,000).
// No sign-in needed. notes.product is 'donation', which every Pro poller ignores (they match '<code>-notes' only),
// so a donation never unlocks anything. The browser is sent to the hosted page (no website check, unlike checkout).
const { send, body, razorpay, handle } = require('./_lib');

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await body(req);
  const rupees = Math.round(Number(b.amount));
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 10000) return send(res, 400, { error: 'Pick an amount from ₹1 to ₹10,000.' });
  const from = String(b.from || 'notix').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'notix';
  const link = await razorpay('POST', '/payment_links', {
    amount: rupees * 100, currency: 'INR', accept_partial: false,
    description: 'Donation to Notix (thank you!)',
    notify: { sms: false, email: false }, reminder_enable: false,
    notes: { product: 'donation', from },
    callback_url: 'https://notix.in/donate?thanks=1', callback_method: 'get',
    expire_by: Math.floor(Date.now() / 1000) + 30 * 60,
  });
  send(res, 200, { url: link.short_url });
});
