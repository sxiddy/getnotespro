// Every page: subject data, search (command bar), cart + pill, account + sign-in, status toasts.
// Motion lives in motion.js (String Tune); this file works without it.

import { markUpdated } from './updates.js';

const data = JSON.parse(document.getElementById('notix-data').textContent);
export const SUBJECTS = data.subjects;
export const REQUEST = data.request;

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const root = document.documentElement;
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const motionOn = () => root.classList.contains('st-on');
export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
export const byCode = (code) => SUBJECTS.find((s) => s.code === code);
// String Tune owns the scroll when it is running (smooth mode on laptops); fall back to the browser otherwise
export const scrollToEl = (el) => (window.notixScrollTo ? window.notixScrollTo(el) : el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));
const scrollTop = () => (window.notixScrollTo ? window.notixScrollTo(0) : window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

// a subject matches if every query word starts a word of its code, name, tag, nicknames or a module title
// (the code also matches anywhere, so "105" finds BACHY105; "cat" doesn't hit "communication")
const starts = (text, w) => norm(text).split(' ').some((t) => t.startsWith(w));
export function match(subj, q) {
  const words = norm(q).split(' ').filter(Boolean);
  if (!words.length) return { ok: true, mods: [] };
  const head = `${subj.code} ${subj.name} ${subj.tag} ${(subj.aka || []).join(' ')}`;
  const inHead = (w) => starts(head, w) || norm(subj.code).includes(w);
  const mods = subj.modules.filter(([, t]) => words.every((w) => starts(t, w)));
  const ok = words.every((w) => inHead(w) || subj.modules.some(([, t]) => starts(t, w)));
  return { ok, mods: mods.map(([n]) => n) };
}

// ---------------------------------------------------------------- status toasts: offline, back online, a script failing
const toast = $('#toast'), toastText = $('#toast-text'), toastBtn = $('#toast-btn'), toastLink = $('#toast-link');
let toastTimer = 0;
// link: { href, text } adds one link to the toast (Gift Pro's Share on WhatsApp)
export function say(text, { warn = false, reload = false, hold = false, ms = 4000, link = null } = {}) {
  clearTimeout(toastTimer);
  toastText.textContent = text; toastBtn.hidden = !reload;
  toastLink.hidden = !link; if (link) { toastLink.href = link.href; toastLink.textContent = link.text; }
  toast.classList.toggle('is-warn', warn); toast.hidden = false;
  if (!hold) toastTimer = setTimeout(() => { toast.hidden = true; }, ms);
}
toastBtn.addEventListener('click', () => location.reload());
const OFFLINE = "You're offline. Search still works; the notes open once you're back.";
addEventListener('offline', () => say(OFFLINE, { warn: true, hold: true }));
addEventListener('online', () => say('Back online.'));
if (!navigator.onLine) say(OFFLINE, { warn: true, hold: true });
// a failure in this page's own scripts (not extensions): keep the page usable and offer a reload
addEventListener('error', (e) => {
  if (e.filename && new URL(e.filename, location.href).origin === location.origin) say("Something on this page didn't load.", { warn: true, reload: true, hold: true });
});

// ---------------------------------------------------------------- cart + sticky pill (saved, so it survives a reload)
const CART_KEY = 'notix-cart';
export const cart = new Set((() => { try { return (JSON.parse(localStorage.getItem(CART_KEY)) || []).filter((c) => byCode(c)); } catch { return []; } })());
// the applied discount code (F10), kept with the cart: { code, pct, codes }
const OFFER_KEY = 'notix-code';
let offer = (() => { try { const o = JSON.parse(localStorage.getItem(OFFER_KEY)); return o && o.code && o.pct ? o : null; } catch { return null; } })();
try { localStorage.removeItem('notix-ref'); } catch { /* ignore */ } // the old referral link (feature removed 21-11-2026)
// Gift Pro (G2): the whole cart can be bought for a friend's VIT email (api/create-order { gift }). Kept with the cart,
// so it survives the sign-in step. In gift mode your own Pro doesn't matter (you can gift a subject you have), and codes
// still work (your one use).
const GIFT_KEY = 'notix-gift';
const gift = (() => { try { const g = JSON.parse(localStorage.getItem(GIFT_KEY)); if (g && g.on) return { on: true, email: String(g.email || '').slice(0, 120) }; } catch { /* ignore */ } return { on: false, email: '' }; })();
const saveGift = () => { try { gift.on ? localStorage.setItem(GIFT_KEY, JSON.stringify(gift)) : localStorage.removeItem(GIFT_KEY); } catch { /* storage blocked: it just won't persist */ } };
const giftEmail = () => gift.email.trim().toLowerCase();
// what is wrong with the friend's email, or '' (the server checks the same and decides)
function giftProblem() {
  const e = giftEmail(), dom = (S && S.domain) || 'vitstudent.ac.in';
  if (!e) return "Enter your friend's VIT email.";
  if (!new RegExp('^[a-z0-9._%+-]+@' + dom.replace(/\./g, '\\.') + '$').test(e)) return `Enter your friend's VIT student email (it ends in @${dom}).`;
  if (S && S.user && e === S.user) return "That's your own email. To buy for yourself, turn off This is a gift.";
  return '';
}
function giftMsg(text, warn) {
  const m = $('#gift-msg'); m.textContent = text || ''; m.hidden = !text; m.classList.toggle('is-warn', !!warn);
  $('#gift-in').setAttribute('aria-invalid', String(!!warn));
}
// subjects you own leave the cart, except in gift mode
function dropOwned() { if (S && !gift.on) for (const p of S.products) if (p.owned && cart.has(p.code)) setInCart(p.code, false); }
function setGift(on) {
  gift.on = on;
  saveGift(); giftMsg(''); dropOwned(); renderCart();
}
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify([...cart])); } catch { /* storage blocked: the cart just won't persist */ } };
const pill = $('#pill');
function setNum(el, v) {
  if (el.textContent === String(v)) return;
  el.textContent = v; el.classList.remove('is-roll'); void el.offsetWidth; el.classList.add('is-roll');
}
const cartTotal = () => quote([...cart]).total;
function renderCart() {
  const n = cart.size, badge = $('.cart__n');
  if (badge.textContent !== String(n) && n) { badge.classList.remove('is-pop'); void badge.offsetWidth; badge.classList.add('is-pop'); }
  badge.textContent = n; badge.hidden = n === 0;
  $('.cart').setAttribute('aria-label', `Cart, ${n} subject${n === 1 ? '' : 's'}`);
  setNum($('#pill-n'), n); $('#pill-word').textContent = n === 1 ? 'subject' : 'subjects';
  setNum($('#pill-sum'), cartTotal());
  pill.classList.toggle('is-show', n > 0); pill.inert = n === 0; pill.setAttribute('aria-hidden', String(n === 0));
  document.body.classList.toggle('has-cart', n > 0);
  saveCart();
  const bx = document.getElementById('cartbox'); if (bx && !bx.hidden) renderBox();
}

// one function keeps every "Add Pro" for a subject in step (tile, search row, try-it card)
const touch = matchMedia('(pointer: coarse)').matches;
function paintAdd(code) {
  const on = cart.has(code);
  $$(`.tile__add[data-code="${code}"], .try__add[data-code="${code}"], .r-pro[data-code="${code}"]`).forEach((b) => {
    if (b.classList.contains('is-owned')) return; // "You have Pro" stays, even while the subject is in a gift cart
    b.classList.toggle('is-in', on); b.setAttribute('aria-pressed', String(on));
    b.firstChild.textContent = on ? 'In cart ' : (b.classList.contains('r-pro') ? '+ Pro ' : 'Add Pro ');
  });
}
// a subject the student already has: its Add Pro buttons become "You have Pro" (the tile's Read free opens it)
function paintOwned(code, owned) {
  $$(`.tile__add[data-code="${code}"], .try__add[data-code="${code}"], .r-pro[data-code="${code}"]`).forEach((b) => {
    b.disabled = owned; b.classList.toggle('is-owned', owned);
    if (owned) b.firstChild.textContent = 'You have Pro ';
    else if (b.firstChild.textContent === 'You have Pro ') paintAdd(code);
  });
}
export function setInCart(code, on, from) {
  if (!byCode(code)) return;
  on ? cart.add(code) : cart.delete(code);
  paintAdd(code);
  renderCart();
  if (on) {
    if (touch && navigator.vibrate && navigator.userActivation?.isActive) { try { navigator.vibrate(12); } catch { /* not allowed: fine */ } }
    if (from) emit('notix:add', { from, price: byCode(code).price });
  }
}
export const toggleCart = (code, from) => setInCart(code, !cart.has(code), from);
// every "Add Pro" on any page (tiles, try-it card, subject pages); search rows are handled in the command bar
document.addEventListener('click', (e) => {
  const b = e.target.closest('.tile__add, .try__add');
  if (b && b.dataset.code && !b.disabled) toggleCart(b.dataset.code, b);
});
// the cart button opens a small panel: each subject with Remove, the total, and Pay
const cartBtn = $('.cart'), box = $('#cartbox');
function renderBox() {
  const items = [...cart].map(byCode).filter(Boolean);
  $('#cartbox-list').innerHTML = items.map((s) => `<li><span class="cartbox__code mono">${esc(s.code)}</span><span class="cartbox__name">${esc(s.name)}</span><span class="cartbox__price mono">₹${s.price}</span><button class="cartbox__rm" type="button" data-rm="${esc(s.code)}" aria-label="Remove ${esc(s.name)}">×</button></li>`).join('');
  $('#cartbox-empty').hidden = items.length > 0;
  $('#cartbox-foot').hidden = items.length === 0;
  const q = quote([...cart]);
  $('#cartbox-sum').textContent = '₹' + q.total;
  $('#gift-on').checked = gift.on; $('#gift-box').hidden = !gift.on;
  const gin = $('#gift-in'); if (document.activeElement !== gin && gin.value !== gift.email) gin.value = gift.email;
  if (S && S.domain) gin.placeholder = 'friend@' + S.domain;
  $('#cartbox-pay').textContent = gift.on ? 'Pay for the gift by UPI' : 'Pay by UPI';
  $('#code-line').hidden = !offer;
  if (offer) {
    $('#code-name').textContent = offer.code;
    $('#code-pct').textContent = `· ${offer.pct}% off`;
    $('#code-amt').textContent = q.discount ? '−₹' + q.discount : '₹0';
    if (!q.discount && items.length) codeMsg('That code is only for ' + offer.codes.map((c) => byCode(c)?.name || c).join(', ') + '.', true);
    else if ($('#code-msg').classList.contains('is-warn')) codeMsg('');
  }
  $('#code-form').hidden = !!offer;
}
function codeMsg(text, warn) {
  const m = $('#code-msg'); m.textContent = text || ''; m.hidden = !text; m.classList.toggle('is-warn', !!warn);
}
function setBox(open) {
  if (open) renderBox();
  box.hidden = !open; cartBtn.setAttribute('aria-expanded', String(open));
  if (open) ($('.cartbox__rm', box) || $('#cartbox-pay')).focus?.();
}
cartBtn.addEventListener('click', (e) => { e.stopPropagation(); setBox(box.hidden); });
box.addEventListener('click', (e) => {
  e.stopPropagation();
  const rm = e.target.closest('[data-rm]');
  if (rm) { setInCart(rm.dataset.rm, false); renderBox(); if (!cart.size) $('#cartbox-empty').focus?.(); }
});
$('#cartbox-pay').addEventListener('click', () => { setBox(false); startBuy([...cart]); });
$('#gift-on').addEventListener('change', (e) => { setGift(e.target.checked); if (gift.on) $('#gift-in').focus(); });
$('#gift-in').addEventListener('input', (e) => { gift.email = e.target.value.slice(0, 120); saveGift(); if (!$('#gift-msg').hidden) giftMsg(''); });
// "Gift this subject" (subject pages): the subject goes in the cart, gift mode on, the cart opens at the email field.
// The rest of the cart stays; the panel says everything in it goes to the friend.
$$('[data-gift]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation();
  const code = b.dataset.gift; if (!byCode(code)) return;
  if (!gift.on) setGift(true);
  setInCart(code, true, b);
  setBox(true); $('#gift-in').focus();
  if (!cartBtn.getBoundingClientRect().bottom || cartBtn.getBoundingClientRect().bottom < 0) scrollTop();
}));
// discount code (F10): checked by the server (api/offers quote), then priced here the same way the server will price
// the order. The code is kept with the cart, so it survives a reload; a code that stopped working is dropped at Pay.
$('#code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inp = $('#code-in'), code = inp.value.trim().toUpperCase(), btn = $('.cartbox__apply');
  if (!code) { codeMsg('Type a code first.', true); inp.focus(); return; }
  btn.disabled = true; codeMsg('Checking…');
  try {
    const r = await api('/api/offers', { action: 'quote', code, products: [...cart] });
    setOffer(r.offer); inp.value = ''; codeMsg(`Code applied. You save ₹${quote([...cart]).discount}.`);
    $('#code-rm').focus();
  } catch (err) { codeMsg(err.message, true); inp.focus(); }
  btn.disabled = false;
});
$('#code-rm').addEventListener('click', () => { setOffer(null); codeMsg(''); $('#code-in').focus(); });
// one discount per order: turning the reward on takes off any code
document.addEventListener('click', () => { if (!box.hidden) setBox(false); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!box.hidden) { setBox(false); cartBtn.focus(); }
});

// links to things that aren't built yet, or that depend on the visitor's own email app, always say what happens,
// so a tap never seems to do nothing
const copyMail = () => { try { navigator.clipboard?.writeText(data.support).catch(() => {}); } catch { /* not allowed: the address is in the message anyway */ } };
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const href = a.getAttribute('href');
  if (href === '/help' || href === '/account') {
    e.preventDefault();
    const what = { '/help': 'The Help page', '/account': 'My subjects' }[href];
    copyMail();
    say(`${what} is coming soon. For now, email ${data.support} (copied) and we'll help.`, { ms: 9000 });
  } else if (href.startsWith('mailto:')) {
    copyMail();
    say(/subject%20request/i.test(href)
      ? `Requests are by email for now (voting on requests is coming soon). If no email app opens, write to ${data.support} (copied).`
      : `Opening your email app. If nothing opens, write to ${data.support} (copied).`, { ms: 9000 });
  }
});

// ---------------------------------------------------------------- account: session, sign-in window, sign out
let S = null; // /api/session: { user, products, keyId, googleClientId, domain, devLogin }
const acct = $('#acct'), dlg = $('#signin-dlg');
async function api(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Please try again.'), { status: r.status, data: j });
  return j;
}
// The launch sale (api/_lib.js SALE) ends by itself on the server; this brings a page built during the sale in line
// with it, so the struck price and "33% off" go away once the sale is over, even before the site is rebuilt.
function paintPrices() {
  for (const el of $$('.pz')) {
    const pick = el.dataset.pz ? [byCode(el.dataset.pz)].filter(Boolean) : SUBJECTS;
    if (!pick.length) continue;
    const s = pick.reduce((a, b) => (b.price < a.price ? b : a));
    $('.pz__now', el).textContent = '₹' + s.price;
    const was = $('.pz__was', el);
    if (was) { was.textContent = '₹' + s.list; was.hidden = !(s.list > s.price); }
  }
  const onSale = SUBJECTS.some((s) => s.list > s.price);
  for (const el of $$('[data-sale-note]')) el.hidden = !onSale;
}
function renderAccount() {
  const u = S && S.user;
  acct.removeAttribute('aria-busy');
  $('.acct__skel', acct).hidden = true;
  $('#signin-btn').hidden = !!u;
  $('#acct-me').hidden = !u;
  if (u) { $('#acct-initial').textContent = u[0].toUpperCase(); $('#acct-who').textContent = u; $('#acct-btn').setAttribute('aria-label', `Account: ${u}`); }
  // the server's prices and ownership are the truth; owned subjects leave the cart (unless it is a gift)
  if (S) for (const p of S.products) {
    const s = byCode(p.code); if (s) { s.price = p.price / 100; if (p.list) s.list = p.list / 100; }
    paintOwned(p.code, p.owned);
  }
  if (S) paintPrices();
  dropOwned();
  renderCart();
  showGifts(u ? S.gifts || [] : []);
}
// Gift Pro (G2), the friend's side: the account menu says who gave which subjects, and a toast says it once per gift
// (remembered on this device; the record itself is the only storage)
const SEEN_KEY = 'notix-gifts-seen';
function showGifts(gifts) {
  const el = $('#acct-gift'), by = {};
  gifts.forEach((g) => { (by[g.from] = by[g.from] || []).push(byCode(g.code)?.name || g.code); });
  const froms = Object.keys(by);
  el.hidden = !froms.length;
  el.innerHTML = froms.map((f) => `Gifted by <b>${esc(f)}</b>: ${esc(by[f].join(', '))}`).join('<br>');
  let seen = []; try { seen = JSON.parse(localStorage.getItem(SEEN_KEY)) || []; } catch { /* ignore */ }
  const fresh = gifts.filter((g) => !seen.includes(g.code + '|' + g.from + '|' + g.at));
  if (!fresh.length) return;
  const f = fresh[0].from, names = fresh.filter((g) => g.from === f).map((g) => byCode(g.code)?.name || g.code).join(', ');
  say(`${f} gifted you Pro for ${names}. Open the notes and sign in there with this account.`, { hold: true });
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((g) => g.code + '|' + g.from + '|' + g.at)].slice(-50))); } catch { /* ignore */ }
}
async function boot() {
  // the account slot shimmers until this answers; after 6 s it gives up quietly and shows "Sign in"
  const slow = setTimeout(() => { if (!S) { S = null; renderAccount(); } }, 6000);
  try { S = await api('/api/session'); } catch { S = null; }
  clearTimeout(slow);
  renderAccount();
}
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = bad; document.head.append(s); });
export async function openSignIn(code) {
  const nm = code && byCode(code) ? byCode(code).name : '';
  $('#dlg-title').textContent = nm ? `Sign in to unlock ${nm}` : 'Sign in to continue';
  $('#dlg-msg').textContent = '';
  try { document.cookie = 'st_next=' + (code && /^[A-Z0-9]+$/.test(code) ? code : '') + '; Path=/; Max-Age=600; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch { /* ignore */ }
  if (!dlg.open) dlg.showModal();
  if (!S) { try { S = await api('/api/session'); renderAccount(); } catch { $('#dlg-msg').textContent = "Couldn't reach Notix. Check your connection and try again."; return; } }
  if (S.devLogin) $('#dev-login').hidden = false;
  const box = $('#gsi');
  if (!S.googleClientId) { if (!S.devLogin) $('#dlg-msg').textContent = 'Sign-in is not set up yet. Please check back soon.'; return; }
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent)) {
    box.innerHTML = '<p class="dlg__inapp"><b>Open this page in Chrome or Safari.</b> Google does not allow signing in inside this app\'s built-in browser. Copy the link and paste it into your browser.</p>'; return;
  }
  if (box.dataset.ready) return;
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const g = window.google && window.google.accounts && window.google.accounts.id;
    if (!g) throw new Error('no gsi');
    g.initialize({ client_id: S.googleClientId, hd: S.domain, ux_mode: 'redirect', login_uri: location.origin + '/api/login', auto_select: false });
    g.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', width: 300 });
    box.dataset.ready = '1';
  } catch { $('#dlg-msg').textContent = 'Could not load Google sign-in. Check your connection and try again.'; }
}
$('#dev-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/api/login', { devEmail: $('#dev-email').value }); dlg.close(); await boot(); say('Signed in.'); if (pendingBuy) startBuy(pendingBuy); }
  catch (err) { $('#dlg-msg').textContent = err.message; }
});
$('#signin-btn').addEventListener('click', () => openSignIn(null));
const menu = $('#acct-menu'), menuBtn = $('#acct-btn');
const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); if (open) $('[role=menuitem]', menu).focus(); };
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.acct__me')) setMenu(false); });
menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); menuBtn.focus(); } });
$('#signout-btn').addEventListener('click', async () => { setMenu(false); await api('/api/login', { logout: true }).catch(() => {}); await boot(); say('Signed out.'); });

// ---------------------------------------------------------------- checkout: one UPI payment for the whole cart
// The server (api/create-order) sets the amount; quote() is only what the page shows, using the same rule as
// api/_offers.js priceCart: each subject the code covers costs pct less, rounded down to whole rupees, never below ₹1.
function setOffer(o) {
  offer = o ? { code: o.code, pct: o.pct, codes: o.codes || [] } : null;
  try { offer ? localStorage.setItem(OFFER_KEY, JSON.stringify(offer)) : localStorage.removeItem(OFFER_KEY); } catch { /* storage blocked: it just won't persist */ }
  renderCart();
}
export function quote(codes) {
  const o = offer;
  const lines = codes.map((c) => {
    const price = byCode(c).price, on = o && (!o.codes.length || o.codes.includes(c));
    return { code: c, label: byCode(c).name, price, amount: on ? Math.min(price, Math.max(1, Math.floor((price * (100 - o.pct)) / 100))) : price };
  });
  const total = lines.reduce((t, l) => t + l.amount, 0);
  return { lines, total, discount: lines.reduce((t, l) => t + l.price, 0) - total, offer: o };
}
let pendingBuy = null;
const isOwned = (code) => !!(S && S.products.some((p) => p.code === code && p.owned));
export async function startBuy(codes) {
  codes = codes.filter((c) => byCode(c) && (gift.on || !isOwned(c)));
  if (!codes.length) return;
  const why = gift.on && giftProblem();
  if (why) { setBox(true); giftMsg(why, true); $('#gift-in').focus(); return; }
  if (!S || !S.user) { pendingBuy = codes; openSignIn(codes[0]); return; }
  pendingBuy = null;
  const pay = $('.pill__pay'); pay.disabled = true; pay.classList.add('is-busy');
  const done = () => { pay.disabled = false; pay.classList.remove('is-busy'); };
  try {
    if (!window.Razorpay) await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const req = { products: codes };
    if (gift.on) req.gift = giftEmail();
    if (offer) req.code = offer.code;
    const o = await api('/api/create-order', req);
    try { localStorage.setItem('st_order', o.orderId); } catch { /* ignore */ }
    const names = codes.map((c) => byCode(c).name).join(', ');
    const rz = new window.Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'Notix', description: (o.gift ? 'Pro gift for ' : 'Pro for ') + names,
      // these notes are only labels in Razorpay; the server reads the order's own notes (who gets Pro, and the gift)
      prefill: { email: o.email }, notes: Object.assign({ product: 'pro-store', item: codes.join(','), email: o.email }, o.gift ? { gift: o.gift } : {}), theme: { color: '#2d5bff' },
      // UPI only: the server unlocks Pro for UPI payments alone (checkPayment), so other methods would take money and unlock nothing
      method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
      handler: async (r) => {
        try { const v = await api('/api/verify', r); await unlocked(codes, v.gift); }
        catch { await checkOrder(o.orderId); }
        done();
      },
      modal: { ondismiss: () => { done(); setTimeout(() => checkOrder(o.orderId, true), 4000); } },
    });
    rz.open();
  } catch (e) {
    done();
    if (e.data && e.data.badOffer) { // the code stopped working since it was applied: drop it, show the real price, let them choose
      setOffer(null);
      say(`${e.message} Your total is now ₹${cartTotal()}. Tap Pay again to buy at that price.`, { warn: true, hold: true });
      return;
    }
    if (gift.on && e.data && (e.data.badGift || e.status === 409)) { // the friend's email, or what they already own: say it by the field
      setBox(true); giftMsg(e.message, true); $('#gift-in').focus();
      return;
    }
    say(e.message, { warn: true });
    if (e.status === 401) { await boot(); openSignIn(codes[0]); }
    if (e.status === 409) await boot(); // already owned: the session refresh takes it out of the cart
  }
}
// to: the friend's email when the payment was a gift (from api/verify)
async function unlocked(codes, to) {
  codes.forEach((c) => setInCart(c, false));
  if (offer) setOffer(null); // each student can use a code once (a gift used the buyer's)
  if (to) { gift.on = false; gift.email = ''; saveGift(); }
  await boot();
  const names = codes.map((c) => byCode(c)?.name).filter(Boolean).join(', ');
  if (to) {
    const msg = `I got you Notix Pro for ${names}. Sign in at ${location.origin} with ${to} to use it.`;
    say(`Pro sent to ${to}. Tell them to sign in with that email.`, { hold: true, link: { href: 'https://wa.me/?text=' + encodeURIComponent(msg), text: 'Tell them on WhatsApp' } });
  } else say(`Pro unlocked for ${names}. Open the notes and sign in there with the same account.`, { hold: true });
  emit('notix:unlocked', { codes, gift: to || null });
}
// "the page lost the callback" (UPI apps often close the tab): ask the server to look the order up at Razorpay
async function checkOrder(orderId, quiet) {
  try {
    const r = await api('/api/verify', { action: 'check', orderId });
    if (r.ok) { await unlocked(r.items || [r.item], r.gift); return true; }
  } catch (e) { if (!quiet) say(e.message, { warn: true }); }
  return false;
}
// Check my payment (M3): in the account menu
$('#check-btn').addEventListener('click', async () => {
  setMenu(false);
  let id = null; try { id = localStorage.getItem('st_order'); } catch { /* ignore */ }
  if (!id) { say(`No recent payment on this device. Write to ${data.support} with your payment ID (it starts with pay_).`, { hold: true }); return; }
  say('Checking your last payment…', { hold: true });
  if (!(await checkOrder(id, true))) say('No completed payment on your last order yet. If money was taken, give it a few minutes and check again.', { hold: true });
});
$('.pill__pay').addEventListener('click', () => startBuy([...cart]));

// ---------------------------------------------------------------- command bar
const input = $('#cmd-input'), drop = $('#cmd-drop'), listEl = $('#cmd-list'), label = $('#cmd-label'), hl = $('.cmd__hl');
let results = [], sel = -1;
const RECENT_KEY = 'notix-recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } };
const remember = (code) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...recent().filter((c) => c !== code)].slice(0, 4))); } catch { /* storage blocked: fine */ } };

function placeHl() {
  const li = sel >= 0 && $(`#opt-${sel}`);
  if (!li) { hl.style.opacity = 0; return; }
  hl.style.opacity = 1;
  hl.style.setProperty('--hy', `${li.offsetTop - listEl.scrollTop + listEl.offsetTop}px`);
  hl.style.setProperty('--hh', `${li.offsetHeight}px`);
}
function openList(q) {
  const qq = q.trim();
  if (qq) {
    results = SUBJECTS.map((s) => ({ s, m: match(s, qq) })).filter((x) => x.m.ok);
    label.textContent = results.length ? `${results.length} match${results.length === 1 ? '' : 'es'}` : 'No match';
  } else {
    const r = recent().map(byCode).filter(Boolean);
    const rest = SUBJECTS.filter((s) => !r.includes(s));
    results = [...r, ...rest].map((s) => ({ s, m: { mods: [] } }));
    label.textContent = r.length ? 'Recent, then all subjects' : 'All subjects';
  }
  sel = results.length ? 0 : -1;
  listEl.innerHTML = results.length
    ? results.map(({ s, m }, i) => {
      const hit = m.mods.length ? s.modules.find(([n]) => n === m.mods[0]) : null;
      const inCart = cart.has(s.code), own = isOwned(s.code);
      return `<li role="option" id="opt-${i}" aria-selected="${i === sel}" style="--i:${i}"><a class="r-main" href="${esc(s.site)}" tabindex="-1">
        <span class="r-code">${s.code}</span><span class="r-name">${esc(s.name)}</span><span class="r-read">Read free ↗</span>
        ${hit ? `<span class="r-hit">Module ${hit[0]}: <mark>${esc(hit[1])}</mark></span>` : ''}</a>
        <button class="r-pro${inCart ? ' is-in' : ''}${own ? ' is-owned' : ''}" type="button" tabindex="-1" data-code="${s.code}" aria-pressed="${inCart}"${own ? ' disabled' : ''}>${own ? 'You have Pro' : inCart ? 'In cart' : '+ Pro'} <span>₹${s.price}</span></button></li>`;
    }).join('')
    : `<li class="r-empty">Nothing for “${esc(qq)}” yet. <a href="${REQUEST}">Request a subject →</a></li>`;
  drop.hidden = false; input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-activedescendant', sel >= 0 ? `opt-${sel}` : '');
  document.body.classList.add('is-searching');
  placeHl();
}
function closeList() {
  drop.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  document.body.classList.remove('is-searching');
}
function select(i) {
  sel = i;
  $$('[role=option]', listEl).forEach((li, j) => li.setAttribute('aria-selected', String(j === sel)));
  input.setAttribute('aria-activedescendant', `opt-${sel}`);
  $(`#opt-${sel}`).scrollIntoView({ block: 'nearest' });
  placeHl();
}
const move = (d) => results.length && select((sel + d + results.length) % results.length);
function choose(i) {
  // the row opens the subject's notes (Phase 2: /<code>, with the notes one tap away)
  const s = results[i].s;
  remember(s.code); closeList(); input.blur();
  location.href = s.site;
}

input.addEventListener('focus', () => openList(input.value));
input.addEventListener('input', () => openList(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); choose(sel); }
  else if (e.key === 'Escape') { closeList(); input.blur(); }
});
input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeList(); }, 120));
listEl.addEventListener('mousedown', (e) => { if (e.target.closest('.r-pro, .r-main')) e.preventDefault(); }); // keep the box open
listEl.addEventListener('click', (e) => {
  const pro = e.target.closest('.r-pro');
  if (pro) { e.preventDefault(); toggleCart(pro.dataset.code, pro); return; }
  const a = e.target.closest('.r-main'); if (a) { e.preventDefault(); choose(Number(a.closest('[role=option]').id.slice(4))); }
});
listEl.addEventListener('mousemove', (e) => { const li = e.target.closest('[role=option]'); if (li) { const i = Number(li.id.slice(4)); if (i !== sel) select(i); } });
listEl.addEventListener('scroll', placeHl, { passive: true });
$('.scrim').addEventListener('click', () => { closeList(); input.blur(); });

// "/" focuses the search from anywhere (G11), and the key cap presses down
const kbdEl = $('.cmd__kbd');
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t.closest && t.closest('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  kbdEl.classList.add('is-press'); setTimeout(() => kbdEl.classList.remove('is-press'), 160);
  input.focus();
});
$$('[data-focus-search]').forEach((b) => b.addEventListener('click', () => { input.focus({ preventScroll: true }); scrollTop(); }));

// the bar morphs into a floating pill once the page scrolls (motion.js drives this with String Tune when it runs)
const bar = $('#bar');
const io = new IntersectionObserver(([en]) => { if (!motionOn()) bar.classList.toggle('is-stuck', !en.isIntersecting); }, { rootMargin: '24px 0px 0px 0px' });
const sentinel = document.createElement('div'); sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px';
document.body.prepend(sentinel); io.observe(sentinel);

// count this browser once a day (anonymous: just a number per day), as the old home page did
// every page load is a visit ("load"); the first one of the day in this browser is also a visitor ("visit")
try { const day = new Date().toISOString().slice(0, 10), first = localStorage.getItem('st_visit') !== day; if (first) localStorage.setItem('st_visit', day); fetch('/api/track', { method: 'POST', body: first ? '{"visit":true,"load":true}' : '{"load":true}', keepalive: true }).catch(() => {}); } catch { /* ignore */ }

SUBJECTS.forEach((s) => paintAdd(s.code));
renderCart();
markUpdated(); // G5 badges, only fetches when the page has subject slots
boot().then(() => {
  // back from Google with an error, or sent here from a subject site (?subject=CODE): open the sign-in window
  const qs = new URLSearchParams(location.search), err = qs.get('login_error'), want = (qs.get('subject') || '').toUpperCase();
  if (err) { openSignIn(want || null).then(() => { $('#dlg-msg').textContent = err; }); history.replaceState(null, '', location.pathname); }
  else if (want && byCode(want) && !(S && S.user)) openSignIn(want);
  // a shared link with ?code=EXAM20 applies the code (checked against the cart, or every subject if the cart is empty)
  const link = (qs.get('code') || '').trim().toUpperCase();
  if (link) {
    qs.delete('code'); history.replaceState(null, '', location.pathname + (qs.size ? '?' + qs : '') + location.hash);
    api('/api/offers', { action: 'quote', code: link, products: cart.size ? [...cart] : SUBJECTS.map((x) => x.code).slice(0, 10) })
      .then((r) => { setOffer(r.offer); say(`Code ${r.offer.code} applied: ${r.offer.pct}% off${cart.size ? '' : '. Add Pro on a subject to use it'}.`); })
      .catch((err) => say(err.message, { warn: true }));
  }
});
