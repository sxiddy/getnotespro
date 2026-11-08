// GET /api/session -> { user, products: [{code, name, site, price, owned}], rewards, keyId, googleClientId, domain, devLogin }
// rewards: the signed-in student's unspent 50% referral rewards (G8, api/_referrals.js), so the cart can offer one
const { send, getUser, ownedBy, PRODUCTS, priceOf, DOMAIN, handle } = require('./_lib');

module.exports = handle(async (req, res) => {
  const u = getUser(req);
  const [owned, refs] = await Promise.all([ownedBy(u ? u.e : null), require('./_referrals').rewardsOf(u ? u.e : null)]);
  send(res, 200, {
    user: u ? u.e : null,
    products: Object.keys(PRODUCTS).map((c) => ({ code: c, name: PRODUCTS[c].name, tag: PRODUCTS[c].tag || '', site: PRODUCTS[c].site, price: priceOf(c), owned: !!owned[c] })),
    keyId: process.env.RAZORPAY_KEY_ID || null,
    rewards: refs.rewards,
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    domain: DOMAIN,
    devLogin: process.env.DEV_LOGIN === '1' && !process.env.VERCEL,
  });
});
