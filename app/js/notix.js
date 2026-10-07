/* Notix store: sign-in, subject cards, cart, one-payment UPI checkout (Razorpay), live previews, page motion. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  const TAU = Math.PI * 2;
  const DEMOS = window.NX_DEMOS || [], COLS = window.NX_COL || {};
  const INFO = {
    BACHY105: { blurb: 'Applied chemistry for VIT: batteries, fuel cells, solar cells, semiconductors, nanomaterials, spectroscopy and more.', points: ['Every interactive model (Nernst, Beer–Lambert, Bragg and more) and the Lab bench', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers to every practice question and model answers for the CAT papers', 'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper', 'Night-before revision pack and formula sheet', 'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
    BAEEE101: { blurb: 'Basic engineering for VIT: electrical circuits, machines, electronics, communication, graphics, CAD and manufacturing.', points: ['Every interactive model of circuits, amplifiers and mechanisms, plus the Lab bench', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers and explanations for every practice question and model answers for the CAT and FAT papers', 'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper', 'Night-before revision pack and formula sheet', 'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
    BAENG101: { blurb: 'Technical English for VIT: technical writing, grammar, reading and communication, rebuilt as short tabbed notes.', points: ['Every interactive writing and communication tool in the Practice lab', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers to every practice question and model answers for the CAT-2 papers', 'Rules and templates page', 'Progress sync, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
  };
  // the two best animations per subject, best first (add a line when a new subject gets previews)
  const BEST = { BACHY105: ['temp', 'battery'], BAEEE101: ['charger', 'motor'], BAENG101: ['grammar'] };
  const COLOR = { BACHY105: 'var(--cat)', BAEEE101: 'var(--e)', BAENG101: 'var(--an)' }, PAL = ['var(--good)', '#ff8fa3', '#6fd6d0', '#f5d76e', '#9fb4ff', '#ffa06b'];
  const colorOf = (p, i) => COLOR[p.code] || PAL[Math.max(0, i - 3) % PAL.length];
  // a subject with no entry in INFO still gets a sensible card
  const GENERIC = (p) => ({ blurb: 'Pro study tools for ' + p.name + '. The notes stay free to read.', points: ['Interactive models and the Lab bench', 'Flashcards, quizzes and weak-spot quiz', 'Answers to every practice question', 'Mock exams, night-before pack and formula sheet', 'Progress sync, bookmarks and My notes'] });
  const FEATURED = 3; // three subjects show by default; the rest are found by searching a code or name
  const want = (new URLSearchParams(location.search).get('subject') || '').toUpperCase();
  let S = null, pending = null, query = '', cart = [];
  try { cart = JSON.parse(sessionStorage.getItem('nx_cart') || '[]'); } catch (e) { cart = []; }

  const api = async (path, data) => {
    const r = await fetch(path, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong.'); e.status = r.status; e.body = j; throw e; }
    return j;
  };
  const toast = (t) => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 4200); };
  const rs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const prod = (c) => S && S.products.find((p) => p.code === c);
  const saveCart = () => { try { sessionStorage.setItem('nx_cart', JSON.stringify(cart)); } catch (e) { /* ignore */ } };
  const cleanCart = () => { cart = cart.filter((c) => { const p = prod(c); return p && !p.owned; }); saveCart(); };

  // ---------------------------------------------------------------- previews (canvas)
  const tiles = new Set();
  function Tile(el, demo, big) {
    const t = { el, d: demo, big: !!big, cv: $('canvas', el), vals: {}, on: false, vis: false, W: 0, H: 0, t0: performance.now() };
    t.g = t.cv.getContext('2d'); demo.ctrl.forEach((c) => { t.vals[c.k] = c.val; });
    t.size = () => { const r = t.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; t.W = r.width; t.H = r.height; t.cv.width = t.W * dpr; t.cv.height = t.H * dpr; t.g.setTransform(dpr, 0, 0, dpr, 0, 0); t.paint(1.2); };
    t.paint = (sec) => { if (!t.W) return; t.g.clearRect(0, 0, t.W, t.H); try { demo.draw.call(demo, t.g, t.W, t.H, sec, t.vals); } catch (e) { /* ignore */ } };
    if ('ResizeObserver' in window) new ResizeObserver(t.size).observe(t.cv);
    t.vis = true; // tiles are only created once they are near the screen, and only animate while hovered or open
    tiles.add(t); t.size();
    return t;
  }
  let raf = 0;
  function loop(now) {
    let any = false;
    tiles.forEach((t) => { if (!t.el.isConnected) { tiles.delete(t); return; } if (t.on && t.vis) { any = true; t.paint(reduce ? 1.2 : (now - t.t0) / 1000); } });
    raf = any ? requestAnimationFrame(loop) : 0;
  }
  const play = (t, on) => { t.on = !!on && !reduce; t.el.classList.toggle('playing', t.on); if (t.on && !raf) { t.t0 = performance.now() - 1200; raf = requestAnimationFrame(loop); } if (!on) t.paint(1.2); };
  function wireTile(el, d) {
    // the canvas is set up only when its tile first scrolls near the screen, so the page loads and scrolls light
    const start = () => {
    const t = Tile(el, d, false);
    if (fine) { el.addEventListener('pointerenter', () => play(t, true)); el.addEventListener('pointerleave', () => play(t, false)); }
    el.addEventListener('focusin', () => play(t, true)); el.addEventListener('focusout', () => play(t, false));
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-open]')) return;
      if (!fine) { const was = t.on; tiles.forEach((o) => { if (o !== t && o.on && !o.big) play(o, false); }); play(t, !was); }
    });
    };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px' }); io.observe(el); } else start();
  }
  const tileHTML = (d, extra) => `<div class="tile" data-demo="${d.id}" style="--a:${d.col}"><canvas aria-label="${esc(d.title)} animation"></canvas><span class="live"><i></i>${fine ? 'hover' : 'tap'} to play</span>${extra || ''}</div>`;
  const demoFor = (code, n) => { const id = (BEST[code] || [])[n || 0]; return DEMOS.find((d) => d.id === id); };

  function renderRow() {
    const row = $('#prow'); if (!row) return;
    const list = []; [0, 1].forEach((n) => S.products.forEach((p) => { const d = demoFor(p.code, n); if (d) list.push([p, d]); })); list.length = Math.min(list.length, 10);
    const sec = $('#previews'); sec.hidden = !list.length; if (!list.length) return;
    row.innerHTML = list.map(([p, d]) => `<article class="pcard" style="--a:${d.col}">${tileHTML(d)}<div class="pc-b"><div class="pc-t"><b>${esc(d.title)}</b><span class="protag">Pro</span></div><span class="pc-s">${esc(d.title === 'Fix the sentence' ? 'Technical English' : p.name)}</span><button class="btn sm" type="button" data-open="${d.id}">Try it</button></div></article>`).join('');
    $$('.tile', row).forEach((el) => wireTile(el, DEMOS.find((x) => x.id === el.dataset.demo)));
  }

  // big preview with the sliders
  const pvDlg = $('#pv-dlg'); let big = null;
  function openBig(id) {
    const d = DEMOS.find((x) => x.id === id); if (!d) return;
    const box = $('#pv-big'), p = prod(d.code), owned = p && p.owned, inCart = cart.includes(d.code);
    box.innerHTML = `<div class="pb" style="--a:${d.col}">${tileHTML(d).replace('tile', 'tile bigt')}<div class="pb-side"><span class="chip" style="--a:${d.col}">${esc(d.subject)}</span><h3>${esc(d.title)}</h3><p class="muted">${esc(d.blurb)}</p><div class="pb-ctrls"></div><p class="pb-read" aria-live="polite"></p>${p ? (owned ? '<p class="owned">You have Pro for this subject.</p>' : `<div class="pb-cta"><button class="btn primary" type="button" data-pbbuy="${d.code}">Get Pro · ${rs(p.price)}</button><button class="btn" type="button" data-pbcart="${d.code}">${inCart ? 'In cart ✓' : 'Add to cart'}</button></div>`) : ''}</div></div>`;
    const t = Tile($('.tile', box), d, true); big = t;
    const ctrls = $('.pb-ctrls', box), read = $('.pb-read', box), readout = () => { read.innerHTML = d.read(t.vals); };
    d.ctrl.forEach((c) => {
      const row = document.createElement('div'); row.className = 'pb-row';
      if (c.type === 'toggle') row.innerHTML = `<span class="lbl">${c.label}</span><div class="tog">${c.opts.map((o) => `<button type="button" data-k="${c.k}" data-v="${o[0]}" class="${o[0] === c.val ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
      else row.innerHTML = `<label class="lbl" for="pbc-${c.k}">${c.label}</label><output id="pbo-${c.k}">${c.fmt(c.val)}</output><input id="pbc-${c.k}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.val}" data-k="${c.k}" style="--p:${(c.val - c.min) / (c.max - c.min) * 100}%">`;
      ctrls.appendChild(row);
    });
    box.oninput = (e) => { const r = e.target.closest('input[type=range]'); if (!r) return; const c = d.ctrl.find((x) => x.k === r.dataset.k); t.vals[c.k] = +r.value; $('#pbo-' + c.k).textContent = c.fmt(+r.value); r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%'); readout(); if (reduce) t.paint(1.2); };
    box.onclick = (e) => {
      const tg = e.target.closest('.tog button'); if (tg) { t.vals[tg.dataset.k] = tg.dataset.v; $$('button', tg.parentNode).forEach((b) => b.classList.toggle('on', b === tg)); readout(); if (reduce) t.paint(1.2); return; }
      const b = e.target.closest('[data-pbbuy]'); if (b) { pvDlg.close(); return startBuy([b.dataset.pbbuy]); }
      const c = e.target.closest('[data-pbcart]'); if (c) { toggleCart(c.dataset.pbcart); c.textContent = cart.includes(c.dataset.pbcart) ? 'In cart ✓' : 'Add to cart'; }
    };
    readout(); if (!pvDlg.open) pvDlg.showModal(); play(t, true);
  }
  pvDlg.addEventListener('close', () => { if (big) { tiles.delete(big); big = null; } });
  pvDlg.addEventListener('click', (e) => { if (e.target === pvDlg) pvDlg.close(); });
  document.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (o) openBig(o.dataset.open); });

  // ---------------------------------------------------------------- cards
  const matches = (q) => S.products.filter((p) => (p.code + ' ' + p.name + ' ' + (p.tag || '')).toLowerCase().includes(q));
  const shownProducts = () => {
    const q = query.trim().toLowerCase();
    if (q) return matches(q).slice(0, 12); // a broad search shows the first 12; type more of the code to narrow it
    return S.products.filter((p, i) => i < FEATURED || p.code === want);
  };
  function renderTools() {
    const box = $('#tools'), many = S.products.length > FEATURED; box.hidden = !many; if (!many) return;
    if (!box.dataset.ready) {
      box.dataset.ready = '1'; box.innerHTML = '<input id="sq" type="search" placeholder="Search by subject code, e.g. BAMAT101" aria-label="Search subjects by code or name" autocomplete="off"><span class="thint" id="thint"></span>';
      $('#sq').addEventListener('input', (e) => { query = e.target.value; render(); });
    }
    const shown = shownProducts().length;
    $('#thint').textContent = query.trim() ? (() => { const all = matches(query.trim().toLowerCase()).length; return all > shown ? 'Showing the first ' + shown + ' of ' + all + ' matches. Type more of the code to narrow it.' : all + ' match' + (all === 1 ? '' : 'es') + ' of ' + S.products.length + ' subjects'; })() : 'Showing ' + shown + ' of ' + S.products.length + '. Search a code to find the others.';
  }
  function fillDynamic() {
    const n = S.products.length, sn = $('#stat-n'); if (sn) sn.textContent = n;
    const ff = $('#foot-free'); if (ff && !ff.dataset.ready) { ff.dataset.ready = '1'; ff.insertAdjacentHTML('beforeend', S.products.slice(0, 6).map((p) => '<a href="' + esc(p.site) + '" rel="noopener">' + esc(p.name) + '</a>').join('') + (n > 6 ? '<a href="#subjects">All ' + n + ' subjects</a>' : '')); }
    const mine = S.products.filter((p) => p.owned), m = $('#mine'); m.hidden = !mine.length;
    m.innerHTML = mine.length ? '<span class="muted small">Your Pro subjects</span>' + mine.map((p) => '<a class="btn sm" href="' + esc(p.site) + '" rel="noopener">Open ' + esc(p.name) + '</a>').join('') : '';
  }
  function render() {
    const u = S.user;
    $('#who').hidden = !u; $('#who').textContent = u || '';
    $('#signin-btn').hidden = !!u; $('#signout-btn').hidden = !u;
    $('#tab-acc-l').textContent = u ? 'Sign out' : 'Sign in';
    const cur = prod(want);
    $('#hero-msg').textContent = cur && !cur.owned ? 'You came from ' + cur.name + '. Its card is highlighted below.' : '';
    cleanCart(); renderTools();
    $('#cards').classList.toggle('many', shownProducts().length > 4);
    $('#cards').innerHTML = shownProducts().map((p) => {
      const i = INFO[p.code] || GENERIC(p), idx = S.products.indexOf(p), d = demoFor(p.code, 0), inC = cart.includes(p.code);
      const exp = renderExp.has(p.code);
      const buy = p.owned
        ? `<p class="owned">You have Pro for this subject.</p><a class="btn primary" href="${esc(p.site)}" rel="noopener">Open ${esc(p.name)}</a>`
        : `<div class="price">${rs(p.price)}<span>one time</span></div><div class="btns"><button class="btn primary" data-buy="${p.code}" type="button">Get Pro</button><button class="btn ${inC ? 'inc' : ''}" data-cart="${p.code}" type="button" aria-pressed="${inC}">${inC ? 'In cart ✓' : 'Add to cart'}</button></div><a class="free" href="${esc(p.site)}" rel="noopener">Read the notes free →</a>`;
      return `<article class="card${p.code === want ? ' focus' : ''}" id="card-${p.code}" style="--a:${colorOf(p, idx)}">
        <div class="c-main"><div class="c-top"><span class="chip">${esc(p.code)}</span>${p.owned ? '<span class="own">Owned</span>' : ''}</div>
        <h3>${esc(p.name)}</h3><p class="c-blurb">${esc(i.blurb)}</p>
        <ul class="${exp ? '' : 'collapsed'}">${i.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${i.points.length > 3 ? `<button class="more-btn" type="button" data-more="Show all ${i.points.length} Pro tools" aria-expanded="${exp}">${exp ? 'Show fewer' : 'Show all ' + i.points.length + ' Pro tools'}</button>` : ''}</div>
        <div class="c-side${d ? '' : ' nopv'}">${d ? tileHTML(d, `<button class="try" type="button" data-open="${d.id}">Try it</button>`) : ''}<div class="buy">${buy}<p class="card-msg" data-msg="${p.code}" role="status"></p></div></div></article>`;
    }).join('') || '<p class="muted empty">No subject matches that. Check the code and try again.</p>';
    $$('#cards .tile').forEach((el) => wireTile(el, DEMOS.find((x) => x.id === el.dataset.demo)));
    fillDynamic(); renderRow(); renderCart();
    if (want && !render.scrolled && cur) { render.scrolled = true; const el = $('#card-' + want); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }
  }
  const renderExp = new Set();

  // ---------------------------------------------------------------- cart
  function toggleCart(code) {
    const p = prod(code); if (!p || p.owned) return;
    cart = cart.includes(code) ? cart.filter((c) => c !== code) : [...cart, code]; saveCart();
    $$('[data-cart="' + code + '"]').forEach((b) => { const on = cart.includes(code); b.textContent = on ? 'In cart ✓' : 'Add to cart'; b.classList.toggle('inc', on); b.setAttribute('aria-pressed', on); });
    renderCart(true);
  }
  function renderCart(bump) {
    cleanCart();
    const n = cart.length, total = cart.reduce((a, c) => a + (prod(c) ? prod(c).price : 0), 0);
    $('#cb-n').textContent = n; $('#cb-t').textContent = n ? n + (n === 1 ? ' subject · ' : ' subjects · ') + rs(total) : 'Pick a subject';
    const pay = $('#cb-pay'); pay.disabled = !n; pay.textContent = n ? 'Pay ' + rs(total) : 'Pay';
    $('#cb-list').innerHTML = cart.map((c) => `<li style="--a:${colorOf(prod(c), S.products.indexOf(prod(c)))}"><i></i><span>${esc(prod(c).name)}</span><b>${rs(prod(c).price)}</b><button type="button" data-rm="${c}" aria-label="Remove ${esc(prod(c).name)}">×</button></li>`).join('');
    if (!n) { $('#cb-list').hidden = true; $('#cb-sum').setAttribute('aria-expanded', 'false'); }
    const ti = $('#tab-n'); ti.hidden = !n; ti.textContent = n;
    if (bump && !reduce) { const b = $('#cb-n'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }
  $('#cb-sum').addEventListener('click', () => { const l = $('#cb-list'); if (!cart.length) { $('#subjects').scrollIntoView({ behavior: 'smooth' }); return; } l.hidden = !l.hidden; $('#cb-sum').setAttribute('aria-expanded', String(!l.hidden)); });
  $('#cb-list').addEventListener('click', (e) => { const r = e.target.closest('[data-rm]'); if (r) toggleCart(r.dataset.rm); });
  $('#cb-pay').addEventListener('click', () => startBuy(cart.slice()));
  $('#tab-cart').addEventListener('click', () => { const l = $('#cb-list'); if (!cart.length) { toast('Your cart is empty. Add a subject first.'); $('#subjects').scrollIntoView({ behavior: 'smooth' }); return; } l.hidden = false; $('#cb-sum').setAttribute('aria-expanded', 'true'); $('#cartbar').scrollIntoView({ block: 'end' }); });
  $('#tab-acc').addEventListener('click', () => { if (S && S.user) $('#signout-btn').click(); else openSignIn(null); });

  // ---------------------------------------------------------------- sign-in window
  const dlg = $('#signin-dlg');
  async function openSignIn(code) {
    pending = code || want || null;
    const nm = (prod(pending) || {}).name;
    $('#dlg-title').textContent = nm ? 'Sign in to unlock ' + nm : 'Sign in to continue';
    $('#dlg-msg').textContent = '';
    try { document.cookie = 'st_next=' + (typeof pending === 'string' && /^[A-Z0-9]+$/.test(pending) ? pending : '') + '; Path=/; Max-Age=600; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) { /* ignore */ }
    if (!dlg.open) dlg.showModal();
    if (S.devLogin) $('#dev-login').hidden = false;
    const box = $('#gsi');
    if (!S.googleClientId) { if (!S.devLogin) $('#dlg-msg').textContent = 'Sign-in is not set up yet. Please check back soon.'; return; }
    if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(navigator.userAgent)) {
      box.innerHTML = '<div class="inapp"><b>Open this page in Chrome or Safari.</b> Google does not allow signing in inside this app\'s built-in browser. Copy the link and paste it into your browser.</div>'; return;
    }
    if (box.dataset.ready) return;
    try {
      await loadScript('https://accounts.google.com/gsi/client');
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) throw new Error('no gsi');
      g.initialize({ client_id: S.googleClientId, hd: S.domain, ux_mode: 'redirect', login_uri: location.origin + '/api/login', auto_select: false });
      g.renderButton(box, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', logo_alignment: 'left', width: 300 });
      box.dataset.ready = '1';
    } catch (e) { $('#dlg-msg').textContent = 'Could not load Google sign-in. Check your connection and try again.'; }
  }
  $('#dev-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/login', { devEmail: $('#dev-email').value }); dlg.close(); await boot(); if (pendingBuy) startBuy(pendingBuy); } catch (err) { $('#dlg-msg').textContent = err.message; }
  });
  $('#signin-btn').addEventListener('click', () => openSignIn(null));
  $('#signout-btn').addEventListener('click', async () => { await api('/api/login', { logout: true }).catch(() => {}); await boot(); toast('Signed out.'); });

  // ---------------------------------------------------------------- checkout (one payment for the whole cart)
  let pendingBuy = null;
  async function startBuy(codes) {
    codes = codes.filter((c) => prod(c) && !prod(c).owned); if (!codes.length) return;
    if (!S.user) { pendingBuy = codes; try { document.cookie = 'st_next=' + codes[0] + '; Path=/; Max-Age=600; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) { /* ignore */ } return openSignIn(codes[0]); }
    pendingBuy = null; buy(codes);
  }
  async function buy(codes) {
    const msg = $('[data-msg="' + codes[0] + '"]'); if (msg) msg.textContent = '';
    const btns = [...$$('[data-buy]'), $('#cb-pay')]; btns.forEach((b) => { b.disabled = true; });
    const reenable = () => { btns.forEach((b) => { if (b.id !== 'cb-pay') b.disabled = false; }); renderCart(); };
    try {
      if (!window.Razorpay) await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const o = await api('/api/create-order', { products: codes });
      try { localStorage.setItem('st_order', o.orderId); } catch (e) { /* ignore */ }
      const names = codes.map((c) => prod(c).name).join(', ');
      const rz = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'Notix', description: 'Pro for ' + names,
        prefill: { email: o.email }, notes: { product: 'pro-store', item: codes.join(','), email: o.email }, theme: { color: '#7cc0ff' },
        method: { upi: true, card: true, netbanking: true, wallet: false, emi: false, paylater: false },
        handler: async (r) => {
          try { await api('/api/verify', r); cart = cart.filter((c) => !codes.includes(c)); saveCart(); await boot(); toast('Pro unlocked for ' + names + '.'); celebrate(codes[0]); }
          catch (e) { await checkOrder(o.orderId, msg); }
        },
        modal: { ondismiss: () => { reenable(); setTimeout(() => checkOrder(o.orderId, null, true), 4000); } },
      });
      rz.open();
    } catch (e) {
      if (msg) msg.textContent = e.message; else toast(e.message);
      if (e.status === 401) { await boot(); openSignIn(codes[0]); }
      if (e.status === 409) await boot();
      reenable();
    }
  }
  async function checkOrder(orderId, msgEl, quiet) {
    try { const r = await api('/api/verify', { action: 'check', orderId }); if (r.ok) { const its = r.items || [r.item]; cart = cart.filter((c) => !its.includes(c)); saveCart(); await boot(); toast('Payment found. Pro is unlocked.'); return true; } }
    catch (e) { if (!quiet && msgEl) msgEl.textContent = e.message; }
    return false;
  }
  $('#restore-btn').addEventListener('click', async () => {
    const out = $('#restore-msg');
    if (!S.user) { openSignIn(null); return; }
    let id = null; try { id = localStorage.getItem('st_order'); } catch (e) { /* ignore */ }
    if (!id) { out.textContent = 'No recent payment found on this device. Write to support with your payment ID.'; return; }
    out.textContent = 'Checking…';
    out.textContent = (await checkOrder(id, null, true)) ? 'Found it. You are unlocked.' : 'No completed payment on your last order yet. If money was taken, it can take a few minutes.';
  });

  function celebrate(code) {
    const box = $('#burst'); if (!box || reduce) return;
    const card = document.getElementById('card-' + code); if (card) { card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 2200); }
    const cols = ['#7cc0ff', '#ffb56b', '#c7a4ff', '#86d4a9', '#f4f4f6']; box.innerHTML = '';
    for (let i = 0; i < 44; i++) { const s = document.createElement('i'), a = Math.random() * TAU, d = 120 + Math.random() * 240; s.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 90}px;--r:${Math.random() * 720 - 360}deg;background:${cols[i % cols.length]};animation-delay:${Math.random() * 120}ms`; box.appendChild(s); }
    setTimeout(() => { box.innerHTML = ''; }, 1800);
  }

  // ---------------------------------------------------------------- clicks on cards
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]'); if (b) return startBuy([b.dataset.buy]);
    const c = e.target.closest('[data-cart]'); if (c) return toggleCart(c.dataset.cart);
    const m = e.target.closest('.more-btn'); if (m) {
      const card = m.closest('.card'), ul = $('ul', card), code = card.id.replace('card-', ''), open = ul.classList.toggle('collapsed') === false;
      if (open) renderExp.add(code); else renderExp.delete(code);
      m.textContent = open ? 'Show fewer' : m.dataset.more; m.setAttribute('aria-expanded', String(open));
    }
  });

  // ---------------------------------------------------------------- hero Nernst question
  (function () {
    const r = $('#mock-r'); if (!r) return;
    const c = $('#mock-c'), e = $('#mock-e'), fb = $('#mock-fb'), opts = $('#mock-opts'), mock = $('#mock'); let picked = '';
    const fmt = (v) => { const x = Math.pow(10, v); return (x >= 0.1 ? x.toFixed(2) : x.toFixed(3)) + ' M'; };
    function upd() { const v = +r.value; c.textContent = fmt(v); e.textContent = (1.10 + 0.0296 * v).toFixed(2) + ' V'; r.style.setProperty('--p', ((v + 3) / 3 * 100) + '%'); if (!picked) fb.textContent = v < -1 ? 'See the voltage drop as [Cu²⁺] falls? Now pick your answer.' : 'Pick an answer, then drag the slider to check it.'; }
    r.addEventListener('input', () => { mock.classList.add('touched'); upd(); });
    opts.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ans]'); if (!b) return; picked = b.dataset.ans; mock.classList.add('touched');
      $$('button', opts).forEach((x) => x.classList.remove('ok', 'no')); const good = picked === 'down'; b.classList.add(good ? 'ok' : 'no'); if (!good) $('[data-ans="down"]', opts).classList.add('ok');
      fb.textContent = good ? 'Correct. Nernst: E = E° + 0.0296 log[Cu²⁺], so lower [Cu²⁺] means a lower E.' : 'Not quite. By Nernst, E = E° + 0.0296 log[Cu²⁺], so E falls.'; fb.className = 'mock-fb ' + (good ? 'good' : 'bad');
    });
    upd();
  })();

  // ---------------------------------------------------------------- page motion
  const fx = $$('.fx');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    fx.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
  } else fx.forEach((el) => el.classList.add('in'));
  // custom cursor (iPad style): a small dot; over buttons and links it melts into the shape of the thing you can click
  if (fine && $('#cur')) {
    const cur = $('#cur'), CL = 'a,button,summary,label,.btn,[data-open],[data-cart],[data-buy],input[type=range],.tabs *', TX = 'input[type=search],input[type=email]';
    let x = 0, y = 0, lx = 0, ly = 0, seen = false, tgt = null, run = false;
    const move = () => { lx += (x - lx) * 0.5; ly += (y - ly) * 0.5; if (!tgt) cur.style.transform = 'translate3d(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px,0)'; if (!tgt && Math.abs(x - lx) + Math.abs(y - ly) > 0.3) requestAnimationFrame(move); else run = false; };
    const snap = (el) => {
      const r = el.getBoundingClientRect(), pad = 5, cs = getComputedStyle(el), rad = parseFloat(cs.borderTopLeftRadius) || 0;
      cur.classList.remove('big', 'text'); cur.classList.add('snap');
      cur.style.width = r.width + pad * 2 + 'px'; cur.style.height = r.height + pad * 2 + 'px';
      cur.style.borderRadius = Math.min(rad + pad, (r.height + pad * 2) / 2) + 'px';
      cur.style.transform = 'translate3d(' + (r.left - pad) + 'px,' + (r.top - pad) + 'px,0)';
    };
    // while the dot is wrapped round something, keep it matched to that thing (it may move: scrolling, hover lift)
    let fl = 0; const follow = () => { if (!tgt) { fl = 0; return; } if (!tgt.isConnected) { tgt = null; free(''); fl = 0; return; } snap(tgt); fl = requestAnimationFrame(follow); };
    const free = (mode) => { cur.classList.remove('snap', 'big', 'text'); if (mode) cur.classList.add(mode); cur.style.width = cur.style.height = cur.style.borderRadius = ''; };
    addEventListener('pointermove', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (!seen) { seen = true; lx = x; ly = y; if (!document.body.classList.contains('dlg-open')) document.body.classList.add('has-cur'); cur.classList.add('on'); }
      const el = e.target.closest ? e.target : null, c = el && el.closest(CL), tx = el && el.closest(TX), big = el && !c && el.closest('.tile');
      const small = c && c.getBoundingClientRect().width < 460 && c.getBoundingClientRect().height < 120;
      if (tx) { tgt = null; free('text'); }
      else if (c && small) { if (tgt !== c) { tgt = c; snap(c); if (!fl) fl = requestAnimationFrame(follow); } }
      else { if (tgt || cur.classList.contains('snap') || cur.classList.contains('text')) { tgt = null; free(big ? 'big' : ''); } else if (big) free('big'); else if (cur.classList.contains('big')) free(''); }
      if (!tgt && !run) { run = true; requestAnimationFrame(move); }
    }, { passive: true });
    addEventListener('scroll', () => { if (tgt) { const r = tgt.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { tgt = null; free(''); } else snap(tgt); } }, { passive: true });
    addEventListener('pointerdown', () => cur.classList.add('down')); addEventListener('pointerup', () => cur.classList.remove('down'));
    document.addEventListener('pointerleave', () => cur.classList.remove('on')); document.addEventListener('pointerenter', () => { if (seen) cur.classList.add('on'); });
    const dlgs = $$('dialog'), sync = () => { const open = dlgs.some((d) => d.open); document.body.classList.toggle('dlg-open', open); document.body.classList.toggle('has-cur', seen && !open); cur.style.visibility = open ? 'hidden' : ''; };
    dlgs.forEach((d) => new MutationObserver(sync).observe(d, { attributes: true, attributeFilter: ['open'] }));
  }
  // the moving background rests while the page scrolls
  { const au = $('.aurora'); let st = 0, on = false; addEventListener('scroll', () => { if (!on) { on = true; au.classList.add('rest'); } clearTimeout(st); st = setTimeout(() => { on = false; au.classList.remove('rest'); }, 160); }, { passive: true }); }
  // bottom tabs follow the section on screen
  if ('IntersectionObserver' in window) {
    const so = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) $$('#tabs [data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === e.target.id)); }), { rootMargin: '-40% 0px -50% 0px' });
    ['previews', 'subjects'].forEach((id) => { const el = document.getElementById(id); if (el) so.observe(el); });
  }

  // count this browser once a day (anonymous: just a number per day)
  try { const day = new Date().toISOString().slice(0, 10); if (localStorage.getItem('st_visit') !== day) { localStorage.setItem('st_visit', day); fetch('/api/track', { method: 'POST', body: '{"visit":true}', keepalive: true }).catch(() => {}); } } catch (e) { /* ignore */ }

  async function boot() { S = await api('/api/session'); render(); }
  boot().then(() => {
    const err = new URLSearchParams(location.search).get('login_error');
    if (err) { openSignIn(want); $('#dlg-msg').textContent = err; history.replaceState(null, '', want ? '?subject=' + want : location.pathname); }
    else if (want && !S.user && S.products.some((p) => p.code === want && !p.owned)) openSignIn(want);
  }).catch(() => { $('#cards').innerHTML = '<p class="muted">Could not load. Please reload the page.</p>'; });
})();
