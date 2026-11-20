// Razorpay webhook "payment_link.paid" for the subject sites (bachy105.notix.in, baeee101.notix.in, ...), which sell
// Pro with Razorpay Payment Links. One webhook on notix.in covers every site, so a new site needs no schedule of its own.
// Nothing in the webhook body is trusted: the link and its payment are fetched from Razorpay with the secret key, and
// only a captured INR payment on a link whose notes say "<code>-notes" grants Pro. Pro is written into that site's own
// "paid" list in the shared database (each site prefixes its keys with "<code>:"; Chemistry, the first site, has none).
// A payment the site's owner removed on its /admin ("paidRevoked") never grants Pro again.
const { razorpay } = require('./_lib');
const store = require('./_store');

const PRODUCT = /^([a-z]{4,6}[0-9]{3})-notes$/; // e.g. bachy105-notes
const NO_PREFIX = new Set(['bachy105']); // sites whose keys have no prefix
const keyFor = (code, k) => (NO_PREFIX.has(code) ? '' : code + ':') + k;
const normEmail = (s) => String(s || '').trim().toLowerCase();

// -> { ok, site, email, paymentId } or { ok: false, why }
async function grantFromLink(linkId) {
  if (!/^plink_[A-Za-z0-9]+$/.test(String(linkId || ''))) return { ok: false, why: 'no payment link id' };
  const link = await razorpay('GET', '/payment_links/' + linkId);
  const n = link.notes || {}, m = PRODUCT.exec(n.product || '');
  if (!m) return { ok: false, why: 'not a subject-site link' };
  const site = m[1], email = normEmail(n.email);
  if (!/^[a-z0-9._%+-]+@vitstudent\.ac\.in$/.test(email)) return { ok: false, why: 'link has no student email' };
  if (link.status !== 'paid') return { ok: false, why: 'link is ' + link.status };
  let pid = ((link.payments || []).find((p) => p.status === 'captured') || {}).payment_id;
  if (!pid && link.order_id) pid = (((await razorpay('GET', '/orders/' + link.order_id + '/payments')).items || []).find((p) => p.status === 'captured') || {}).id;
  if (!pid) return { ok: false, why: 'no captured payment yet' };
  const p = await razorpay('GET', '/payments/' + pid);
  if (p.status !== 'captured' || p.currency !== 'INR' || !(p.amount >= 100)) return { ok: false, why: 'payment is ' + p.status };
  const [have, gone] = await store.pipeline([['HGET', keyFor(site, 'paid'), email], ['HGET', keyFor(site, 'paidRevoked'), email]]);
  if (gone && String(gone).split(',').includes(String(p.id))) return { ok: false, why: 'payment was removed by the owner' };
  if (have == null) {
    await store.pipeline([['HSET', keyFor(site, 'paid'), email, JSON.stringify({ id: p.id, at: new Date(p.created_at * 1000).toISOString(), amount: p.amount, via: 'webhook' })]]);
    console.log('[sitepay] Pro granted', site, email, p.id);
  }
  return { ok: true, site, email, paymentId: p.id, already: have != null };
}

module.exports = { grantFromLink, keyFor, PRODUCT };
