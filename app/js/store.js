/* Notes Pro store: sign-in window, subject cards, UPI checkout through Razorpay. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const INFO = {
    BACHY105: { blurb: 'Applied chemistry for VIT: batteries, fuel cells, solar cells, semiconductors, nanomaterials, spectroscopy and more.', points: ['Every interactive model (Nernst, Beer–Lambert, Bragg and more) and the Lab bench', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers to every practice question and model answers for the CAT papers', 'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper', 'Night-before revision pack and formula sheet', 'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
    BAEEE101: { blurb: 'Basic engineering for VIT: electrical circuits, machines, electronics, communication, graphics, CAD and manufacturing.', points: ['Every interactive model of circuits, amplifiers and mechanisms, plus the Lab bench', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers and explanations for every practice question and model answers for the CAT and FAT papers', 'Timed mock CAT (90 min) and mock FAT (180 min) on a real paper', 'Night-before revision pack and formula sheet', 'Progress sync, bookmarks, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
    BAENG101: { blurb: 'Technical English for VIT: technical writing, grammar, reading and communication, rebuilt as short tabbed notes.', points: ['Every interactive writing and communication tool in the Practice lab', 'Every flashcard, quiz, weak-spot quiz and mastery per topic', 'Answers to every practice question and model answers for the CAT-2 papers', 'Rules and templates page', 'Progress sync, My notes, focus timer up to 3 hours, unlimited 1v1 quiz battles'] },
  };

  const ICON = {
    BACHY105: '<path d="M9 3h6M10 3v6.2L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.5 15h9"/>',
    BAEEE101: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    BAENG101: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"/>',
  };
  let S = null, pending = null, query = '', tagF = 'All';
  // colours: the first three subjects keep theirs, new ones cycle through the palette
  const COLOR = { BACHY105: 'var(--cat)', BAEEE101: 'var(--e)', BAENG101: 'var(--an)' }, PAL = ['var(--good)', '#ff8fa3', '#6fd6d0', '#f5d76e', '#9fb4ff', '#ffa06b'];
  const colorOf = (p, i) => COLOR[p.code] || PAL[Math.max(0, i - 3) % PAL.length];
  const tags = () => [...new Set(S.products.map((p) => p.tag).filter(Boolean))];
  const shownProducts = () => { const q = query.trim().toLowerCase(); return S.products.filter((p) => (tagF === 'All' || p.tag === tagF) && (!q || (p.name + ' ' + p.code + ' ' + (p.tag || '')).toLowerCase().includes(q))); };
  // search and filter chips appear once there are more than 4 subjects
  function renderTools() {
    const box = $('#tools'), many = S.products.length > 4; box.hidden = !many; if (!many) return;
    if (!box.dataset.ready) {
      box.dataset.ready = '1'; box.innerHTML = '<input id="sq" type="search" placeholder="Search subjects" aria-label="Search subjects"><div class="chips" id="tchips"></div>';
      $('#sq').addEventListener('input', (e) => { query = e.target.value; render(); });
      $('#tchips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tagF = b.dataset.t; render(); } });
    }
    $('#tchips').innerHTML = ['All', ...tags()].map((x) => '<button type="button" data-t="' + esc(x) + '" class="' + (x === tagF ? 'on' : '') + '">' + esc(x) + '</button>').join('');
  }
  // everything on the page that lists subjects follows the product list
  function fillDynamic() {
    const n = S.products.length, sn = $('#stat-n'); if (sn) { sn.dataset.count = n; if (!sn.dataset.done) sn.textContent = n; }
    const fr = $('#free-row'); if (fr && !fr.dataset.ready) { fr.dataset.ready = '1'; fr.insertAdjacentHTML('beforeend', S.products.map((p, i) => '<a class="pill" href="' + esc(p.site) + '" rel="noopener" style="--a:' + colorOf(p, i) + '"><i></i>' + esc(p.name) + '</a>').join('')); }
    const ff = $('#foot-free'); if (ff && !ff.dataset.ready) { ff.dataset.ready = '1'; ff.insertAdjacentHTML('beforeend', S.products.map((p) => '<a href="' + esc(p.site) + '" rel="noopener">' + esc(p.name) + '</a>').join('')); }
    const mine = S.products.filter((p) => p.owned), m = $('#mine'); m.hidden = !mine.length;
    m.innerHTML = mine.length ? '<span class="muted small">Your Pro subjects</span>' + mine.map((p) => '<a class="btn sm" href="' + esc(p.site) + '" rel="noopener">Open ' + esc(p.name) + '</a>').join('') : '';
    document.dispatchEvent(new CustomEvent('st:products', { detail: S.products }));
  }
  const want = (new URLSearchParams(location.search).get('subject') || '').toUpperCase();

  const api = async (path, data) => {
    const r = await fetch(path, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong.'); e.status = r.status; e.body = j; throw e; }
    return j;
  };
  const toast = (t) => { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 4200); };
  const rs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });

  // ---------------------------------------------------------------- render
  function render() {
    const u = S.user;
    $('#who').hidden = !u; $('#who').textContent = u || '';
    $('#signin-btn').hidden = !!u; $('#signout-btn').hidden = !u;
    const cur = S.products.find((p) => p.code === want);
    $('#hero-msg').textContent = cur && !cur.owned ? 'You came from ' + cur.name + '. Its card is highlighted below.' : '';
    renderTools(); $('#cards').classList.toggle('many', S.products.length > 4);
    $('#cards').innerHTML = shownProducts().map((p) => {
      const i = INFO[p.code] || { blurb: '', points: [] };
      const exp = !!(window.stExp && window.stExp.has(p.code));
      const action = p.owned
        ? `<a class="btn primary" href="${esc(p.site)}" rel="noopener">Open ${esc(p.code)}</a>`
        : u ? `<button class="btn primary" data-buy="${p.code}" type="button">Pay ${rs(p.price)} with UPI</button>`
          : `<button class="btn primary" data-signin="${p.code}" type="button">Sign in to buy</button>`;
      return `<article class="card a-${esc(p.code)}${p.code === want ? ' focus' : ''}" id="card-${p.code}" style="--a:${colorOf(p, S.products.indexOf(p))}">
        <span class="spot" aria-hidden="true"></span><div class="card-top"><span class="card-ico"><svg viewBox="0 0 24 24">${ICON[p.code] || ICON.BAEEE101}</svg></span><span class="chip">${esc(p.code)}</span></div>
        <h3>${esc(p.name)}</h3><p>${esc(i.blurb)}</p>
        <ul class="${exp ? '' : 'collapsed'}">${i.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${i.points.length > 3 ? `<button class="more-btn" type="button" data-more="Show all ${i.points.length} Pro tools" aria-expanded="${exp ? 'true' : 'false'}">${exp ? 'Show fewer' : 'Show all ' + i.points.length + ' Pro tools'}</button>` : ''}
        <div class="buy">${p.owned ? '<p class="owned">You have Pro for this subject.</p>' : `<div class="price">${rs(p.price)}<span>one time</span></div>`}
        ${action}${p.owned ? '' : `<a class="btn free" href="${esc(p.site)}" rel="noopener">Read the notes free</a>`}<p class="card-msg" data-msg="${p.code}" role="status"></p></div></article>`;
    }).join('') || '<p class="muted empty">No subject matches that. Try another word or pick All.</p>';
    fillDynamic();
    if (want && !render.scrolled && cur) { render.scrolled = true; const el = $('#card-' + want); if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); }
  }

  // ---------------------------------------------------------------- sign-in window
  const dlg = $('#signin-dlg');
  async function openSignIn(code) {
    pending = code || want || null;
    const nm = (S.products.find((p) => p.code === pending) || {}).name;
    $('#dlg-title').textContent = nm ? 'Sign in to unlock ' + nm : 'Sign in to continue';
    $('#dlg-msg').textContent = '';
    try { document.cookie = 'st_next=' + (pending || '') + '; Path=/; Max-Age=600; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); } catch (e) { /* ignore */ }
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
    try { await api('/api/login', { devEmail: $('#dev-email').value }); dlg.close(); await boot(); if (pending) buy(pending); } catch (err) { $('#dlg-msg').textContent = err.message; }
  });
  $('#signin-btn').addEventListener('click', () => openSignIn(null));
  $('#signout-btn').addEventListener('click', async () => { await api('/api/login', { logout: true }).catch(() => {}); await boot(); toast('Signed out.'); });

  // ---------------------------------------------------------------- checkout
  async function buy(code) {
    const msg = $('[data-msg="' + code + '"]'); if (msg) msg.textContent = '';
    const btn = $('[data-buy="' + code + '"]'); if (btn) btn.disabled = true;
    try {
      if (!window.Razorpay) await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const o = await api('/api/create-order', { product: code });
      try { localStorage.setItem('st_order', o.orderId); } catch (e) { /* ignore */ }
      const p = S.products.find((x) => x.code === code);
      const rz = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency, name: 'Notes Pro', description: 'Pro for ' + p.name + ' (' + code + ')',
        prefill: { email: o.email }, notes: { product: 'pro-store', item: code, email: o.email }, theme: { color: '#7cc0ff' },
        method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
        handler: async (r) => {
          try { await api('/api/verify', r); await boot(); toast('Pro unlocked for ' + p.name + '.'); if (window.stCelebrate) window.stCelebrate(code); }
          catch (e) { await checkOrder(o.orderId, msg); }
        },
        modal: { ondismiss: () => { if (btn) btn.disabled = false; setTimeout(() => checkOrder(o.orderId, null, true), 4000); } },
      });
      rz.open();
    } catch (e) {
      if (msg) msg.textContent = e.message;
      if (e.status === 401) { await boot(); openSignIn(code); }
      if (btn) btn.disabled = false;
    }
  }
  async function checkOrder(orderId, msgEl, quiet) {
    try { const r = await api('/api/verify', { action: 'check', orderId }); if (r.ok) { await boot(); toast('Payment found. Pro is unlocked.'); return true; } }
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

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]'); if (b) return buy(b.dataset.buy);
    const s = e.target.closest('[data-signin]'); if (s) openSignIn(s.dataset.signin);
  });

  // Sections fade in as they scroll into view (everything is visible straight away when JS or IntersectionObserver is missing).
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach((el) => io.observe(el));
  } else revealEls.forEach((el) => el.classList.add('in'));

  // count this browser once a day (anonymous: just a number per day)
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('st_visit') !== day) { localStorage.setItem('st_visit', day); fetch('/api/track', { method: 'POST', body: '{"visit":true}', keepalive: true }).catch(() => {}); }
  } catch (e) { /* ignore */ }

  async function boot() {
    S = await api('/api/session');
    render();
  }
  boot().then(() => {
    const err = new URLSearchParams(location.search).get('login_error');
    if (err) { openSignIn(want); $('#dlg-msg').textContent = err; history.replaceState(null, '', want ? '?subject=' + want : location.pathname); }
    else if (want && !S.user && S.products.some((p) => p.code === want && !p.owned)) openSignIn(want);
  }).catch(() => { $('#cards').innerHTML = '<p class="muted">Could not load. Please reload the page.</p>'; });
})();
