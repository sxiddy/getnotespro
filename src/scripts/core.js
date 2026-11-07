// Every page: subject data, search (command bar), cart + pill, account + sign-in, status toasts.
// Motion lives in motion.js (String Tune); this file works without it.

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
const toast = $('#toast'), toastText = $('#toast-text'), toastBtn = $('#toast-btn');
let toastTimer = 0;
export function say(text, { warn = false, reload = false, hold = false } = {}) {
  clearTimeout(toastTimer);
  toastText.textContent = text; toastBtn.hidden = !reload;
  toast.classList.toggle('is-warn', warn); toast.hidden = false;
  if (!hold) toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
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
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify([...cart])); } catch { /* storage blocked: the cart just won't persist */ } };
const pill = $('#pill');
function setNum(el, v) {
  if (el.textContent === String(v)) return;
  el.textContent = v; el.classList.remove('is-roll'); void el.offsetWidth; el.classList.add('is-roll');
}
const cartTotal = () => [...cart].reduce((t, c) => t + byCode(c).price, 0);
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
}

// one function keeps every "Add Pro" for a subject in step (tile, search row, try-it card)
const touch = matchMedia('(pointer: coarse)').matches;
function paintAdd(code) {
  const on = cart.has(code);
  $$(`.tile__add[data-code="${code}"], .try__add[data-code="${code}"], .r-pro[data-code="${code}"]`).forEach((b) => {
    b.classList.toggle('is-in', on); b.setAttribute('aria-pressed', String(on));
    b.firstChild.textContent = on ? 'In cart ' : (b.classList.contains('r-pro') ? '+ Pro ' : 'Add Pro ');
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
$('.cart').addEventListener('click', () => {
  if (!cart.size) { const s = $('#subjects'); if (s) scrollToEl(s); else location.href = '/#subjects'; say('Your cart is empty. Add a subject first.'); return; }
  $('.pill__pay').focus();
});

// ---------------------------------------------------------------- account: session, sign-in window, sign out
let S = null; // /api/session: { user, products, keyId, googleClientId, domain, devLogin }
const acct = $('#acct'), dlg = $('#signin-dlg');
async function api(url, body) {
  const r = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j;
}
function renderAccount() {
  const u = S && S.user;
  acct.removeAttribute('aria-busy');
  $('.acct__skel', acct).hidden = true;
  $('#signin-btn').hidden = !!u;
  $('#acct-me').hidden = !u;
  if (u) { $('#acct-initial').textContent = u[0].toUpperCase(); $('#acct-who').textContent = u; $('#acct-btn').setAttribute('aria-label', `Account: ${u}`); }
  // the server's prices and ownership are the truth; owned subjects leave the cart
  if (S) for (const p of S.products) {
    const s = byCode(p.code); if (s) s.price = p.price / 100;
    if (p.owned && cart.has(p.code)) setInCart(p.code, false);
  }
  renderCart();
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
  try { await api('/api/login', { devEmail: $('#dev-email').value }); dlg.close(); await boot(); say('Signed in.'); }
  catch (err) { $('#dlg-msg').textContent = err.message; }
});
$('#signin-btn').addEventListener('click', () => openSignIn(null));
const menu = $('#acct-menu'), menuBtn = $('#acct-btn');
const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); if (open) $('[role=menuitem]', menu).focus(); };
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.acct__me')) setMenu(false); });
menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMenu(false); menuBtn.focus(); } });
$('#signout-btn').addEventListener('click', async () => { setMenu(false); await api('/api/login', { logout: true }).catch(() => {}); await boot(); say('Signed out.'); });

// Pay: Razorpay checkout for the whole cart is wired in Phase 2 (the existing api/create-order + api/verify).
$('.pill__pay').addEventListener('click', () => {
  if (!S || !S.user) { openSignIn([...cart][0] || null); return; }
  say('Checkout is being moved to the new site. It comes in the next build step.');
});

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
      const inCart = cart.has(s.code);
      return `<li role="option" id="opt-${i}" aria-selected="${i === sel}" style="--i:${i}"><a class="r-main" href="${esc(s.site)}" tabindex="-1">
        <span class="r-code">${s.code}</span><span class="r-name">${esc(s.name)}</span><span class="r-read">Read free ↗</span>
        ${hit ? `<span class="r-hit">Module ${hit[0]}: <mark>${esc(hit[1])}</mark></span>` : ''}</a>
        <button class="r-pro${inCart ? ' is-in' : ''}" type="button" tabindex="-1" data-code="${s.code}" aria-pressed="${inCart}">${inCart ? 'In cart' : '+ Pro'} <span>₹${s.price}</span></button></li>`;
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
try { const day = new Date().toISOString().slice(0, 10); if (localStorage.getItem('st_visit') !== day) { localStorage.setItem('st_visit', day); fetch('/api/track', { method: 'POST', body: '{"visit":true}', keepalive: true }).catch(() => {}); } } catch { /* ignore */ }

SUBJECTS.forEach((s) => paintAdd(s.code));
renderCart();
boot().then(() => {
  // back from Google with an error, or sent here from a subject site (?subject=CODE): open the sign-in window
  const qs = new URLSearchParams(location.search), err = qs.get('login_error'), want = (qs.get('subject') || '').toUpperCase();
  if (err) { openSignIn(want || null).then(() => { $('#dlg-msg').textContent = err; }); history.replaceState(null, '', location.pathname); }
  else if (want && byCode(want) && !(S && S.user)) openSignIn(want);
});
