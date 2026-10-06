// Signs a student in with their Google account (only @<STUDENT_DOMAIN>, default vitstudent.ac.in).
//   Full-page flow: Google POSTs a form { credential, g_csrf_token } here; we redirect to /?subject=<CODE>
//   (the subject the student came from is kept in the st_next cookie, set by the page before sign-in).
//   JSON flow: POST { credential | devEmail } -> { ok, email } (devEmail only with DEV_LOGIN=1, never on Vercel).
//   Sign out: POST { logout: true } -> clears the sign-in.
const { send, body, handle, verifyGoogle, isStudentEmail, normEmail, userCookie, clearUserCookie, safeEqual, isProduct, DOMAIN, REVIEW_EMAIL, reviewerCookie } = require('./_lib');

const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));

async function signIn(b) {
  let email;
  if (process.env.DEV_LOGIN === '1' && !process.env.VERCEL && b.devEmail) email = normEmail(b.devEmail);
  else {
    const g = await verifyGoogle(b.credential);
    if (g.hd && g.hd !== DOMAIN) throw Object.assign(new Error(`Please use your VIT student account (…@${DOMAIN}).`), { status: 403 });
    email = g.email;
  }
  if (!isStudentEmail(email)) throw Object.assign(new Error(`Only VIT student accounts (…@${DOMAIN}) can sign in. You signed in as ${email}.`), { status: 403 });
  const store = require('./_store'), now = new Date().toISOString();
  if (store.configured()) await store.pipeline([['HSETNX', 'userFirst', email, now], ['HSET', 'userLogin', email, now], ['HINCRBY', 'userLogins', email, 1]]).catch(() => {});
  return { email, cookie: userCookie(email) };
}

// Razorpay's website reviewer: POST { reviewUser, reviewCode } from /review.html. Only when REVIEW_CODE is set in Vercel,
// at most 10 tries an hour per address (30 an hour in total).
async function reviewSignIn(req, b) {
  const code = process.env.REVIEW_CODE;
  if (!code) return { status: 403, error: 'Reviewer sign-in is switched off.' };
  const store = require('./_store');
  if (store.configured()) {
    const ip = String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim().slice(0, 64);
    const [mine, , all] = await store.pipeline([['INCR', 'revtry:' + ip], ['EXPIRE', 'revtry:' + ip, 3600], ['INCR', 'revtry'], ['EXPIRE', 'revtry', 3600]]);
    if (mine > 10 || all > 30) return { status: 429, error: 'Too many tries. Please wait an hour and try again.' };
  }
  const user = String(b.reviewUser || '').trim().toLowerCase();
  if (user !== REVIEW_EMAIL || !safeEqual(String(b.reviewCode || ''), code)) return { status: 401, error: 'Wrong username or access code.' };
  return { status: 200, cookie: reviewerCookie() };
}

module.exports = handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const b = await body(req), c = cookies(req);
  if (b.logout || /[?&]out=1/.test(req.url || '')) return send(res, 200, { ok: true }, { 'Set-Cookie': clearUserCookie() });

  if (b.reviewCode !== undefined) {
    const r = await reviewSignIn(req, b);
    return r.cookie ? send(res, 200, { ok: true, email: REVIEW_EMAIL }, { 'Set-Cookie': r.cookie }) : send(res, r.status, { error: r.error });
  }

  if (b.g_csrf_token !== undefined) { // Google's full-page redirect
    const next = isProduct(c.st_next) ? '/?subject=' + c.st_next : '/';
    const back = (err, cookie) => {
      res.statusCode = 303;
      res.setHeader('Location', err ? (next.includes('?') ? next + '&' : '/?') + 'login_error=' + encodeURIComponent(err) : next);
      res.setHeader('Cache-Control', 'no-store');
      if (cookie) res.setHeader('Set-Cookie', cookie);
      res.end();
    };
    if (c.g_csrf_token && !safeEqual(c.g_csrf_token, b.g_csrf_token)) return back('Sign-in could not be checked. Please try again.');
    try { const r = await signIn(b); return back(null, r.cookie); }
    catch (e) { return back(e.message || 'Sign-in failed. Please try again.'); }
  }

  try { const r = await signIn(b); send(res, 200, { ok: true, email: r.email }, { 'Set-Cookie': r.cookie }); }
  catch (e) { send(res, e.status || 500, { error: e.message }); }
});
