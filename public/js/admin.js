/* Notix admin: reads /api/admin with the key kept for this tab only (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const fmt = (d, h12) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: h12 });
  // exact time to the second in IST; the ISO (UTC) value is in the tooltip
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? esc(iso) : '<span title="' + esc(iso) + '">' + fmt(d, true) + '</span>'; };
  const whenText = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : fmt(d, false); };
  let KEY = '', D = null, RF = null, SHOWN = 10;
  const OPEN = new Set(), POPEN = new Set(), PSEL = new Set();
  let P = null, PSHOWN = 10;
  const STEP = 20, FIRST = 10;
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const phoneFmt = (c) => { const d = digits(c); if (!d) return ''; const n = d.length > 10 ? d.slice(-10) : d, cc = d.length > 10 ? '+' + d.slice(0, d.length - 10) + ' ' : ''; return cc + n.slice(0, 5) + ' ' + n.slice(5); };
  const ist = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  try { KEY = sessionStorage.getItem('st_admin') || ''; } catch (e) { /* ignore */ }

  async function call(method, data, qs) {
    const r = await fetch('/api/admin' + (qs || ''), { method, headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; throw e; }
    return j;
  }
  function show(on) { $('#gate').hidden = on; $('#app').hidden = !on; }

  function render() {
    const T = D.totals;
    $('#stamp').innerHTML = 'Updated ' + when(D.now);
    const kpi = (label, val, sub) => `<div class="col-md-4"><div class="card"><div class="card-body"><div class="text-secondary">${label}</div><div class="big">${val}</div><div class="text-secondary small">${sub || '&nbsp;'}</div></div></div></div>`;
    const extra = [T.site ? T.site + ' on the notes sites’ own checkout (' + rs(T.siteRevenue) + ')' : '', T.offline ? rs(T.offlineRevenue) + ' paid outside the website' : ''].filter(Boolean).join(' · ');
    $('#kpis').innerHTML = kpi('Money received', rs(T.revenue), 'after refunds, every website' + (extra ? ' · ' + extra : '')) + kpi('Students who paid', T.buyers != null ? T.buyers : T.payments, T.payments + ' Pro purchase' + (T.payments === 1 ? '' : 's') + ' in all') + kpi('Refunded', rs(T.refunded || 0), (T.refunds || 0) + ' refund' + (T.refunds === 1 ? '' : 's'));
    $('#by-subject').textContent = D.products.map((p) => p.name + ': ' + p.count + ' paid (' + rs(p.revenue) + ')' + (p.site ? ', ' + p.site + ' on its own site' : '')).join('   ·   ') + (D.directError ? '   ⚠ ' + D.directError : '');
    const opts = D.products.map((p) => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    if (!$('#a-prod').options.length) $('#a-prod').innerHTML = opts;
    if (!$('#o-prod').options.length) { $('#o-prod').innerHTML = opts; offPrice(); }
    if (!$('#f-sub').options.length) $('#f-sub').innerHTML = '<option value="all">All subjects</option>' + opts;
    filter();
  }
  const badge = (p) => p.status === 'refunded' ? '<span class="badge bg-red-lt">refunded</span>' : p.status === 'expired' ? '<span class="badge bg-secondary-lt">expired</span>' : p.status === 'manual' ? '<span class="badge bg-yellow-lt">' + (p.until ? 'temporary' : 'manual') + '</span>' : p.offline ? '<span class="badge bg-teal-lt" title="Paid you outside the website">paid outside</span>' : '<span class="badge bg-green-lt">paid</span>';
  const ends = (p) => p.until ? (p.status === 'expired' ? 'ended ' : 'ends ') + when(new Date(p.until).toISOString()) : '';
  const DURS = '<option value="0">Forever</option><option value="6">6 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option>';
  // the payments that match the search and filters (all of them; the table shows the first SHOWN)
  function visible() {
    const q = $('#q').value.trim().toLowerCase(), qd = digits(q);
    const sub = $('#f-sub').value, st = $('#f-status').value, wh = $('#f-when').value, so = $('#f-sort').value;
    const now = Date.now(), n = ist(new Date()), sinceMidnight = n - new Date(n).setHours(0, 0, 0, 0);
    const since = wh === 'today' ? now - sinceMidnight : wh === '7' ? now - 7 * 864e5 : wh === '30' ? now - 30 * 864e5 : 0;
    const list = D.payments.filter((p) => {
      if (sub !== 'all' && p.product !== sub) return false;
      if (st === 'temp' ? !(p.until && p.status === 'manual') : st === 'offline' ? !p.offline : st !== 'all' && p.status !== st) return false;
      if (since && !(Date.parse(p.at) >= since)) return false;
      if (!q) return true;
      return String(p.email).toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q) || String(p.order).toLowerCase().includes(q) || String(p.note || '').toLowerCase().includes(q) || (qd.length >= 3 && digits(p.contact).includes(qd));
    });
    const by = { new: (a, b) => String(b.at).localeCompare(String(a.at)), old: (a, b) => String(a.at).localeCompare(String(b.at)), amt: (a, b) => (b.amount || 0) - (a.amount || 0), email: (a, b) => String(a.email).localeCompare(String(b.email)) }[so];
    return list.sort(by);
  }
  function filter() {
    if (!D) return;
    const q = $('#q').value.trim().toLowerCase();
    const has = (e) => !q || String(e).toLowerCase().includes(q);
    const name = (c) => { const p = D.products.find((x) => x.code === c); return p ? p.name : c; };
    const list = visible(), groups = [], seen = {};
    list.forEach((p) => { const k = p.email; if (!(k in seen)) { seen[k] = groups.length; groups.push({ email: k, rows: [] }); } groups[seen[k]].rows.push(p); });
    const shown = groups.slice(0, SHOWN);
    const active = (p) => p.status === 'paid' || p.status === 'manual';
    const actions = (p) => (p.status === 'paid' && !p.offline && !p.site ? `<button class="btn btn-sm btn-outline-danger" data-refund="${esc(p.email)}|${esc(p.product)}|${p.amount}|${esc(p.id)}">Refund</button> ` : '') + (active(p) && !p.site ? `<button class="btn btn-sm" data-revoke="${esc(p.email)}|${esc(p.product)}|${p.status}">Revoke</button>` : '');
    $('#pay-rows').innerHTML = shown.map((g) => {
      const r0 = g.rows[0], contact = (g.rows.find((p) => p.contact) || {}).contact, open = OPEN.has(g.email), one = g.rows.length === 1;
      const paidSum = g.rows.reduce((a, p) => a + (p.status === 'paid' ? p.amount || 0 : 0), 0);
      const chips = g.rows.map((p) => '<span class="chip' + (active(p) ? '' : ' off') + '" title="' + esc(name(p.product)) + ' · ' + p.status + '">' + esc(p.product) + '</span>').join('');
      const st = one ? badge(r0) + (r0.status === 'refunded' && r0.refundedAt ? '<div class="text-secondary small">' + when(r0.refundedAt) + '</div>' : '') + (r0.until ? '<div class="text-secondary small">' + ends(r0) + '</div>' : '') : '<span class="text-secondary small">' + g.rows.filter(active).length + ' active of ' + g.rows.length + '</span>';
      const head = `<tr class="grp-row${open ? ' open' : ''}" data-g="${esc(g.email)}"><td>${when(r0.at)}</td><td><span class="chev">▸</span>${esc(g.email)}</td><td class="mono">${contact ? '<a href="tel:' + esc(contact) + '" class="text-reset">' + esc(phoneFmt(contact)) + '</a>' : '<span class="text-secondary">—</span>'}</td><td>${chips}</td><td>${paidSum ? rs(paidSum) : ''}</td><td>${st}</td><td style="white-space:nowrap">${one ? actions(r0) : ''}</td></tr>`;
      if (!open) return head;
      const have = g.rows.filter(active).map((p) => p.product), missing = D.products.filter((p) => !have.includes(p.code));
      const lines = g.rows.map((p) => `<div class="sub-line"><span class="nm">${esc(name(p.product))}</span>${badge(p)}<span class="meta">${p.manual ? 'given by you' : p.offline ? rs(p.amount) + ' paid outside the website' + (p.note ? ' · ' + esc(p.note) : '') : rs(p.amount) + ' · ' + esc(p.id) + (p.site ? ' · paid on the ' + esc(p.product) + ' site' : '')}${p.giftFrom ? ' · gift from ' + esc(p.giftFrom) : ''} ·${when(p.at)}${p.until ? ' · ' + ends(p) : ''}${p.status === 'refunded' && p.refundedAt ? ' · refunded ' + when(p.refundedAt) : ''}</span><span style="white-space:nowrap">${actions(p)}</span></div>`).join('');
      const give = missing.length ? `<div class="sub-give"><span class="lbl">Give access to</span><select class="form-select form-select-sm w-auto" data-gp>${missing.map((p) => '<option value="' + esc(p.code) + '">' + esc(p.name) + '</option>').join('')}</select><select class="form-select form-select-sm w-auto" data-gd>${DURS}</select><button class="btn btn-sm btn-primary" data-give="${esc(g.email)}">Give access</button></div>` : '';
      return head + `<tr class="sub-row"><td colspan="7"><div class="sub-panel">${lines}${give}</div></td></tr>`;
    }).join('') || '<tr><td colspan="7" class="text-secondary">' + (D.payments.length ? 'No payment matches that. Clear the search or set the filters back to Any.' : 'No payments yet.') + '</td></tr>';
    const money = list.reduce((a, p) => a + (p.status === 'paid' ? p.amount || 0 : 0), 0);
    $('#pay-count').textContent = groups.length + ' student' + (groups.length === 1 ? '' : 's') + ' · ' + list.length + ' payment' + (list.length === 1 ? '' : 's') + (money ? ' · ' + rs(money) + ' paid' : '');
    $('#pay-shown').textContent = groups.length ? 'Showing ' + Math.min(SHOWN, groups.length) + ' of ' + groups.length + ' students' : '';
    $('#pay-more').hidden = groups.length <= SHOWN; $('#pay-less').hidden = SHOWN <= FIRST;
    $('#ref-rows').innerHTML = (D.refunds || []).filter((r) => has(r.email) || has(r.payment)).map((r) => `<tr><td>${when(r.at)}</td><td>${esc(r.email)}</td><td>${esc(name(r.product))}</td><td>${rs(r.amount)}${r.full ? '' : ' (part)'}</td><td>${esc(r.reason)}${r.by === 'razorpay' ? ' <span class="text-secondary small">(done in Razorpay)</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No refunds yet.</td></tr>';
  }
  // visitors per day on each notes website (each site counts its own; the store is not counted)
  async function loadVisits() {
    const box = $('#vis');
    try {
      const V = await call('GET', undefined, '?part=visits');
      const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + 19800000 - (29 - i) * 864e5).toISOString().slice(0, 10));
      const sum = (v, n) => days.slice(-n).reduce((a, d) => a + (+v[d] || 0), 0);
      const tot = days.map((d) => V.sites.reduce((a, s) => a + (+s.visits[d] || 0), 0)), max = Math.max(1, ...tot);
      const all = (v) => Object.values(v || {}).reduce((a, x) => a + (+x || 0), 0); // visits (every page load) are counted since 19-11-2026
      const rows = V.sites.map((s) => s.ok ? `<tr><td>${esc(s.name)}</td><td>${sum(s.visits, 1)}</td><td>${sum(s.visits, 7)}</td><td>${sum(s.visits, 30)}</td><td>${all(s.loads)}</td><td>${s.funnel ? s.funnel.paywall + ' people' : ''}</td></tr>` : `<tr><td>${esc(s.name)}</td><td colspan="5" class="text-danger">${esc(s.error || 'Not available')}</td></tr>`).join('');
      const loadsAll = V.sites.reduce((a, s) => a + all(s.loads), 0);
      const bars = tot.map((n, i) => `<div title="${days[i]}: ${n} visitors" style="flex:1;display:flex;align-items:flex-end"><div style="width:100%;height:${Math.max(2, Math.round(n / max * 100))}%;background:var(--tblr-primary,#7cc0ff);border-radius:2px;opacity:${n ? 1 : .25}"></div></div>`).join('');
      box.innerHTML = `<div class="table-wrap"><table class="table table-vcenter card-table table-sm"><thead><tr><th>Notes website</th><th>Visitors today</th><th>Visitors 7 days</th><th>Visitors 30 days</th><th>Visits since 19 Nov</th><th>Payment page, 30 days</th></tr></thead><tbody>${rows}<tr><td><b>All notes sites</b></td><td><b>${tot[29]}</b></td><td><b>${tot.slice(-7).reduce((a, n) => a + n, 0)}</b></td><td><b>${tot.reduce((a, n) => a + n, 0)}</b></td><td><b>${loadsAll}</b></td><td></td></tr><tr><td>Notix store</td><td>${sum(V.store.visits, 1)}</td><td>${sum(V.store.visits, 7)}</td><td>${sum(V.store.visits, 30)}</td><td>${all(V.store.loads)}</td><td></td></tr>${(V.soon || []).length ? '<tr><td colspan="6" class="text-secondary small pt-3">Not launched yet (visits to each coming-soon page: demand)</td></tr>' + V.soon.map((s) => '<tr><td>' + esc(s.code + ' ' + s.name) + ' <span class="badge bg-secondary-lt">' + esc(s.status) + '</span></td><td>' + sum(s.visits, 1) + '</td><td>' + sum(s.visits, 7) + '</td><td>' + sum(s.visits, 30) + '</td><td></td><td></td></tr>').join('') : ''}</tbody></table></div><div class="text-secondary small mt-2">Visitors: each browser once a day. Visits: every page load, counted since 19 Nov 2026.</div><div class="text-secondary small mt-3 mb-1">Visitors per day, last 30 days (all notes sites)</div><div style="display:flex;gap:2px;height:90px">${bars}</div>`;
    } catch (e) { box.innerHTML = '<span class="text-danger">' + esc(e.message) + '</span>'; }
  }
  // ---------------------------------------------------------------- everyone who signed in (all notes sites + store, unique emails)
  const activeBy = () => { const m = {}; (D ? D.payments : []).forEach((p) => { if (p.status === 'paid' || p.status === 'manual') (m[p.email] = m[p.email] || {})[p.product] = p; }); return m; };
  async function loadPeople() {
    try { P = await call('GET', undefined, '?part=people'); fillPeopleFilters(); peopleRender(); }
    catch (e) { $('#ppl-count').textContent = e.message; }
  }
  function fillPeopleFilters() {
    if ($('#p-site').options.length) return;
    $('#p-site').innerHTML = '<option value="all">Any site</option>' + D.products.map((p) => '<option value="' + esc(p.code) + '">' + esc(p.code) + '</option>').join('') + '<option value="STORE">Notix store</option>';
    $('#p-bsub').innerHTML = D.products.map((p) => '<option value="' + esc(p.code) + '">' + esc(p.name) + '</option>').join('');
    $('#p-bdur').innerHTML = DURS;
  }
  function peopleVisible() {
    const q = $('#p-q').value.trim().toLowerCase(), site = $('#p-site').value, acc = $('#p-acc').value, so = $('#p-sort').value, act = activeBy();
    const list = P.people.filter((x) => (!q || x.email.includes(q)) && (site === 'all' || x.sites.includes(site)) && (acc === 'all' || (acc === 'has') === !!act[x.email]));
    const by = { last: (a, b) => String(b.last || b.first).localeCompare(String(a.last || a.first)), first: (a, b) => String(b.first).localeCompare(String(a.first)), logins: (a, b) => b.logins - a.logins, email: (a, b) => a.email.localeCompare(b.email) }[so];
    return list.sort(by);
  }
  function peopleRender() {
    if (!P || !D) return;
    const list = peopleVisible(), shown = list.slice(0, PSHOWN), act = activeBy();
    const lineFor = (x, p) => { const has = (act[x.email] || {})[p.code]; return has
      ? `<div class="sub-line"><span class="nm">${esc(p.name)}</span>${badge(has)}<span class="meta">${has.manual ? 'given by you' : rs(has.amount) + ' paid'}${has.until ? ' · ' + ends(has) : ''}</span><button class="btn btn-sm" data-revoke="${esc(x.email)}|${esc(p.code)}|${has.status}">Revoke</button></div>`
      : `<div class="sub-line"><span class="nm">${esc(p.name)}</span><span class="badge bg-secondary-lt">no Pro</span><span class="meta"></span><select class="form-select form-select-sm w-auto" data-gd>${DURS}</select><button class="btn btn-sm btn-primary" data-pgive="${esc(x.email)}|${esc(p.code)}">Give access</button></div>`; };
    $('#p-rows').innerHTML = shown.map((x) => {
      const open = POPEN.has(x.email), mine = act[x.email] || {};
      const head = `<tr class="grp-row${open ? ' open' : ''}" data-pp="${esc(x.email)}"><td><input type="checkbox" data-psel="${esc(x.email)}" ${PSEL.has(x.email) ? 'checked' : ''}></td><td><span class="chev">▸</span>${esc(x.email)}</td><td>${x.sites.map((c) => '<span class="chip" style="opacity:.85">' + esc(c === 'STORE' ? 'STORE' : c) + '</span>').join('')}</td><td>${x.first ? when(x.first) : '<span class="text-secondary">—</span>'}</td><td>${x.last ? when(x.last) : '<span class="text-secondary">—</span>'}</td><td>${x.logins}</td><td>${Object.keys(mine).length ? Object.keys(mine).map((c) => '<span class="chip">' + esc(c) + '</span>').join('') : '<span class="text-secondary small">none</span>'}</td></tr>`;
      return open ? head + `<tr class="sub-row"><td colspan="7"><div class="sub-panel">${D.products.map((p) => lineFor(x, p)).join('')}</div></td></tr>` : head;
    }).join('') || '<tr><td colspan="7" class="text-secondary">No one matches that.</td></tr>';
    const bad = P.sites.filter((s) => !s.ok);
    $('#ppl-count').textContent = list.length + ' of ' + P.people.length + ' unique students';
    $('#p-shown').textContent = list.length ? 'Showing ' + Math.min(PSHOWN, list.length) + ' of ' + list.length : '';
    $('#p-more').hidden = list.length <= PSHOWN; $('#p-less').hidden = PSHOWN <= FIRST;
    $('#p-note').textContent = bad.length ? 'Could not read: ' + bad.map((s) => s.name + ' (' + s.error + ')').join('; ') + '.' : 'Counts each email once, even if they signed in on several sites. Phone numbers are only known for students who paid here.';
    $('#p-sel').textContent = PSEL.size + ' selected'; $('#p-bgo').disabled = !PSEL.size; $('#p-all').checked = !!shown.length && shown.every((x) => PSEL.has(x.email));
  }
  const prst = () => { PSHOWN = FIRST; peopleRender(); };
  $('#p-q').addEventListener('input', prst);
  ['#p-site', '#p-acc', '#p-sort'].forEach((s) => $(s).addEventListener('change', prst));
  $('#p-more').addEventListener('click', () => { PSHOWN += STEP; peopleRender(); });
  $('#p-less').addEventListener('click', () => { PSHOWN = FIRST; peopleRender(); });
  $('#p-all').addEventListener('change', (e) => { peopleVisible().slice(0, PSHOWN).forEach((x) => { if (e.target.checked) PSEL.add(x.email); else PSEL.delete(x.email); }); peopleRender(); });
  $('#p-bgo').addEventListener('click', async () => {
    const code = $('#p-bsub').value, hours = +$('#p-bdur').value || undefined, emails = [...PSEL], btn = $('#p-bgo');
    if (!confirm('Give ' + emails.length + ' student' + (emails.length === 1 ? '' : 's') + ' access to ' + code + (hours ? ' for ' + $('#p-bdur').selectedOptions[0].text : ' with no end date') + '?')) return;
    btn.disabled = true; let ok = 0, skipped = 0;
    for (const email of emails) {
      btn.textContent = 'Working… ' + (ok + skipped) + '/' + emails.length;
      try { await call('POST', { action: 'grant', email, product: code, hours }); ok++; } catch (err) { skipped++; }
    }
    btn.textContent = 'Give access to selected'; PSEL.clear();
    alert('Gave access to ' + ok + (skipped ? '. Skipped ' + skipped + ' (already paid, or not a student email).' : '.'));
    await load();
  });
  document.addEventListener('click', async (e) => {
    const g = e.target.closest('[data-pgive]');
    if (g) {
      const [email, product] = g.dataset.pgive.split('|'); g.disabled = true;
      try { await call('POST', { action: 'grant', email, product, hours: +g.closest('.sub-line').querySelector('[data-gd]').value || undefined }); await load(); } catch (err) { alert(err.message); g.disabled = false; }
      return;
    }
    if (e.target.closest('[data-psel]')) { const c = e.target.closest('[data-psel]'); if (c.checked) PSEL.add(c.dataset.psel); else PSEL.delete(c.dataset.psel); peopleRender(); return; }
    if (e.target.closest('button, a, select, .sub-panel')) return;
    const row = e.target.closest('[data-pp]');
    if (row) { const k = row.dataset.pp; if (POPEN.has(k)) POPEN.delete(k); else POPEN.add(k); peopleRender(); }
  });

  async function load() {
    try { D = await call('GET'); show(true); render(); loadVisits(); if (P) peopleRender(); else loadPeople(); }
    catch (e) { if (e.status === 401 || !D) { show(false); $('#gate-msg').textContent = e.message; try { sessionStorage.removeItem('st_admin'); } catch (x) { /* ignore */ } } else alert(e.message); }
  }

  $('#gate-form').addEventListener('submit', (e) => { e.preventDefault(); KEY = $('#key').value; try { sessionStorage.setItem('st_admin', KEY); } catch (x) { /* ignore */ } $('#key').value = ''; load(); });
  $('#refresh').addEventListener('click', load);
  $('#logout').addEventListener('click', () => { KEY = ''; D = null; try { sessionStorage.removeItem('st_admin'); } catch (x) { /* ignore */ } show(false); });
  const reset = () => { SHOWN = FIRST; filter(); };
  $('#q').addEventListener('input', reset);
  ['#f-sub', '#f-status', '#f-when', '#f-sort'].forEach((s) => $(s).addEventListener('change', reset));
  $('#pay-more').addEventListener('click', () => { SHOWN += STEP; filter(); });
  $('#pay-less').addEventListener('click', () => { SHOWN = FIRST; filter(); });

  async function act(action) {
    const out = $('#a-out'); out.textContent = 'Working…';
    try {
      const r = await call('POST', { action, email: $('#a-email').value, product: $('#a-prod').value, hours: +$('#a-dur').value || undefined });
      if (action === 'lookup') {
        const s = r.student;
        out.innerHTML = `${esc(s.email)}${(r.payments.find((p) => p.contact) || {}).contact ? '<br>Phone: ' + esc(phoneFmt(r.payments.find((p) => p.contact).contact)) : ''}<br>First seen: ${when(s.first) || 'never'}<br>Last sign-in: ${when(s.last) || 'never'} (${s.logins} sign-ins)<br>Pro for: ${s.owned.join(', ') || 'none'}<br>Payments: ${r.payments.map((p) => esc(p.product) + ' ' + (p.manual ? 'manual' : rs(p.amount)) + ' ' + esc(p.status) + ' ' + esc(p.id)).join('; ') || 'none'}` +
          // Gift Pro (G2): a gift's record is under the friend's email (refund it there, or type the buyer's email)
          `<br>Gifts given: ${((r.gifts || {}).given || []).map((g) => esc(g.product) + ' to ' + esc(g.to) + ' ' + rs(g.amount) + ' ' + esc(g.status)).join('; ') || 'none'}` +
          `<br>Gifts received: ${((r.gifts || {}).received || []).map((g) => esc(g.product) + ' from ' + esc(g.from) + ' ' + esc(g.status)).join('; ') || 'none'}`;
      } else { out.innerHTML = action === 'grant' ? 'Pro given' + (r.until ? ' until ' + when(new Date(r.until).toISOString()) : ' with no end date') + '.' : 'Pro removed.'; await load(); }
    } catch (e) { out.textContent = e.message; }
  }
  // a payment made outside the website: the amount box starts at the subject's price
  function offPrice() { const p = D && D.products.find((x) => x.code === $('#o-prod').value); if (p) $('#o-amt').value = p.price / 100; }
  $('#o-prod').addEventListener('change', offPrice);
  $('#o-go').addEventListener('click', async () => {
    const out = $('#o-out'), btn = $('#o-go'), email = $('#o-email').value.trim(), code = $('#o-prod').value, rupees = $('#o-amt').value;
    if (!confirm('Record ₹' + rupees + ' from ' + email + ' for ' + code + ' and give them Pro?')) return;
    btn.disabled = true; out.textContent = 'Working…';
    try {
      const r = await call('POST', { action: 'offline', email, product: code, rupees, date: $('#o-date').value || undefined, note: $('#o-note').value });
      out.textContent = 'Added ' + rs(r.amount) + ' from ' + email + ' for ' + code + '. They have Pro now.';
      $('#o-email').value = ''; $('#o-note').value = ''; $('#o-date').value = '';
      await load();
    } catch (e) { out.textContent = e.message; }
    btn.disabled = false;
  });
  $('#a-grant').addEventListener('click', () => act('grant'));
  $('#a-revoke').addEventListener('click', () => { if (confirm('Remove Pro for this student and subject?')) act('revoke'); });
  $('#a-look').addEventListener('click', () => act('lookup'));
  $('#r-go').addEventListener('click', async () => {
    const out = $('#r-out'); out.textContent = 'Asking Razorpay…';
    try { const r = await call('POST', { action: 'reconcile', days: $('#r-days').value }); out.textContent = `Found ${r.found} paid store payments, unlocked ${r.added} that were missing${r.filled ? ', added ' + r.filled + ' missing phone number' + (r.filled === 1 ? '' : 's') : ''}${r.skipped ? ', skipped ' + r.skipped + ' with a non-student email' : ''}.`; await load(); }
    catch (e) { out.textContent = e.message; }
  });

  // ---------------------------------------------------------------- open a student, revoke, give access
  document.addEventListener('click', async (e) => {
    const rv = e.target.closest('[data-revoke]');
    if (rv) {
      const [email, product, status] = rv.dataset.revoke.split('|');
      const msg = status === 'paid' ? 'Take Pro away from ' + email + ' for ' + product + '?\n\nThey paid, and this does NOT return their money. To return it, use Refund instead.' : 'Take Pro away from ' + email + ' for ' + product + '?';
      if (!confirm(msg)) return;
      try { await call('POST', { action: 'revoke', email, product }); await load(); } catch (err) { alert(err.message); }
      return;
    }
    const gv = e.target.closest('[data-give]');
    if (gv) {
      const box = gv.closest('.sub-give');
      gv.disabled = true;
      try { await call('POST', { action: 'grant', email: gv.dataset.give, product: box.querySelector('[data-gp]').value, hours: +box.querySelector('[data-gd]').value || undefined }); await load(); } catch (err) { alert(err.message); gv.disabled = false; }
      return;
    }
    if (e.target.closest('button, a, select, .sub-panel')) return;
    const row = e.target.closest('.grp-row[data-g]');
    if (row) { const k = row.dataset.g; if (OPEN.has(k)) OPEN.delete(k); else OPEN.add(k); filter(); }
  });

  // ---------------------------------------------------------------- refunds
  const modal = () => (window.bootstrap || window.tabler).Modal.getOrCreateInstance($('#rf-modal'));
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-refund]'); if (!b) return;
    const [email, product, amount, id] = b.dataset.refund.split('|');
    RF = { email, product, amount: +amount, id };
    $('#rf-info').innerHTML = esc(email) + '<br>' + esc(product) + ' · ' + rs(RF.amount) + '<br>' + esc(id);
    $('#rf-amt').value = ''; $('#rf-amt').max = String(RF.amount / 100); $('#rf-reason').value = '';
    $('#rf-msg').className = 'mt-3 mono text-danger'; $('#rf-msg').textContent = ''; $('#rf-go').disabled = false;
    modal().show();
  });
  $('#rf-go').addEventListener('click', async () => {
    if (!RF) return;
    const msg = $('#rf-msg'), rupees = $('#rf-amt').value.trim(), paise = rupees ? Math.round(parseFloat(rupees) * 100) : 0;
    msg.className = 'mt-3 mono text-danger';
    if (rupees && !(paise >= 100 && paise <= RF.amount)) { msg.textContent = 'Enter an amount between ₹1 and ' + rs(RF.amount) + ', or leave it empty.'; return; }
    $('#rf-go').disabled = true; msg.textContent = 'Refunding…';
    try {
      const r = await call('POST', { action: 'refund', email: RF.email, product: RF.product, amount: paise || undefined, reason: $('#rf-reason').value });
      msg.className = 'mt-3 mono text-success'; msg.textContent = 'Refund created: ' + r.refund.id + ' (' + r.status + ').';
      await load(); setTimeout(() => modal().hide(), 1200);
    } catch (err) { msg.textContent = err.message; $('#rf-go').disabled = false; }
  });

  $('#csv').addEventListener('click', () => {
    if (!D) return;
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['date_time_ist', 'iso_time_utc', 'student_email', 'subject', 'amount_inr', 'status', 'payment_id', 'order_id', 'method', 'phone', 'ends_at']].concat(visible().map((p) => [whenText(p.at), p.at, p.email, p.product, p.manual ? '' : (p.amount / 100).toFixed(2), p.status, p.id, p.order || '', p.method || '', p.contact || '', p.until ? new Date(p.until).toISOString() : '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'notes-pro-payments-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  });

  if (KEY) load();
})();
