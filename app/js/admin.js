/* Notes Pro admin: reads /api/admin with the key kept for this tab only (sessionStorage). */
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
    $('#kpis').innerHTML = kpi('Money received', rs(T.revenue), 'after refunds') + kpi('Students who paid', T.payments, 'currently have access') + kpi('Refunded', rs(T.refunded || 0), (T.refunds || 0) + ' refund' + (T.refunds === 1 ? '' : 's'));
    $('#by-subject').textContent = D.products.map((p) => p.name + ': ' + p.count + ' paid (' + rs(p.revenue) + ')').join('   ·   ');
    const opts = D.products.map((p) => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    if (!$('#a-prod').options.length) $('#a-prod').innerHTML = opts;
    if (!$('#f-sub').options.length) $('#f-sub').innerHTML = '<option value="all">All subjects</option>' + opts;
    filter();
  }
  const badge = (p) => p.status === 'refunded' ? '<span class="badge bg-red-lt">refunded</span>' : p.status === 'manual' ? '<span class="badge bg-yellow-lt">manual</span>' : '<span class="badge bg-green-lt">paid</span>';
  // the payments that match the search and filters (all of them; the table shows the first SHOWN)
  function visible() {
    const q = $('#q').value.trim().toLowerCase(), qd = digits(q);
    const sub = $('#f-sub').value, st = $('#f-status').value, wh = $('#f-when').value, so = $('#f-sort').value;
    const now = Date.now(), n = ist(new Date()), sinceMidnight = n - new Date(n).setHours(0, 0, 0, 0);
    const since = wh === 'today' ? now - sinceMidnight : wh === '7' ? now - 7 * 864e5 : wh === '30' ? now - 30 * 864e5 : 0;
    const list = D.payments.filter((p) => {
      if (sub !== 'all' && p.product !== sub) return false;
      if (st !== 'all' && p.status !== st) return false;
      if (since && !(Date.parse(p.at) >= since)) return false;
      if (!q) return true;
      return String(p.email).toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q) || String(p.order).toLowerCase().includes(q) || (qd.length >= 3 && digits(p.contact).includes(qd));
    });
    const by = { new: (a, b) => String(b.at).localeCompare(String(a.at)), old: (a, b) => String(a.at).localeCompare(String(b.at)), amt: (a, b) => (b.amount || 0) - (a.amount || 0), email: (a, b) => String(a.email).localeCompare(String(b.email)) }[so];
    return list.sort(by);
  }
  function filter() {
    if (!D) return;
    const q = $('#q').value.trim().toLowerCase();
    const has = (e) => !q || String(e).toLowerCase().includes(q);
    const name = (c) => { const p = D.products.find((x) => x.code === c); return p ? p.name : c; };
    const list = visible(), shown = list.slice(0, SHOWN);
    $('#pay-rows').innerHTML = shown.map((p) => `<tr><td>${when(p.at)}</td><td>${esc(p.email)}</td><td class="mono">${p.contact ? '<a href="tel:' + esc(p.contact) + '" class="text-reset">' + esc(phoneFmt(p.contact)) + '</a>' : '<span class="text-secondary">—</span>'}</td><td>${esc(name(p.product))}</td><td>${p.manual ? '' : rs(p.amount)}</td><td title="${esc(p.id)}">${badge(p)}${p.status === 'refunded' && p.refundedAt ? '<div class="text-secondary small">' + when(p.refundedAt) + '</div>' : ''}</td><td>${p.status === 'paid' ? `<button class="btn btn-sm btn-outline-danger" data-refund="${esc(p.email)}|${esc(p.product)}|${p.amount}|${esc(p.id)}">Refund</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="text-secondary">' + (D.payments.length ? 'No payment matches that. Clear the search or set the filters back to Any.' : 'No payments yet.') + '</td></tr>';
    const money = list.reduce((a, p) => a + (p.status === 'paid' ? p.amount || 0 : 0), 0);
    $('#pay-count').textContent = list.length + ' payment' + (list.length === 1 ? '' : 's') + (money ? ' · ' + rs(money) + ' paid' : '');
    $('#pay-shown').textContent = list.length ? 'Showing ' + Math.min(SHOWN, list.length) + ' of ' + list.length : '';
    $('#pay-more').hidden = list.length <= SHOWN; $('#pay-less').hidden = SHOWN <= FIRST;
    $('#ref-rows').innerHTML = (D.refunds || []).filter((r) => has(r.email) || has(r.payment)).map((r) => `<tr><td>${when(r.at)}</td><td>${esc(r.email)}</td><td>${esc(name(r.product))}</td><td>${rs(r.amount)}${r.full ? '' : ' (part)'}</td><td>${esc(r.reason)}${r.by === 'razorpay' ? ' <span class="text-secondary small">(done in Razorpay)</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No refunds yet.</td></tr>';
    $('#stu-rows').innerHTML = D.students.filter((s) => has(s.email)).map((s) => `<tr><td>${esc(s.email)}</td><td>${when(s.first)}</td><td>${when(s.last)}</td><td>${s.logins}</td><td>${s.owned.map((c) => `<span class="badge bg-green-lt me-1">${esc(c)}</span>`).join('') || '<span class="text-secondary">none</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No students yet.</td></tr>';
  }
  // visitors per day on each notes website (each site counts its own; the store is not counted)
  async function loadVisits() {
    const box = $('#vis');
    try {
      const V = await call('GET', undefined, '?part=visits');
      const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() + 19800000 - (29 - i) * 864e5).toISOString().slice(0, 10));
      const sum = (v, n) => days.slice(-n).reduce((a, d) => a + (+v[d] || 0), 0);
      const tot = days.map((d) => V.sites.reduce((a, s) => a + (+s.visits[d] || 0), 0)), max = Math.max(1, ...tot);
      const rows = V.sites.map((s) => s.ok ? `<tr><td>${esc(s.name)}</td><td>${sum(s.visits, 1)}</td><td>${sum(s.visits, 7)}</td><td>${sum(s.visits, 30)}</td><td>${s.funnel ? s.funnel.paywall + ' saw the payment page' : ''}</td></tr>` : `<tr><td>${esc(s.name)}</td><td colspan="4" class="text-danger">${esc(s.error || 'Not available')}</td></tr>`).join('');
      const bars = tot.map((n, i) => `<div title="${days[i]}: ${n} visitors" style="flex:1;display:flex;align-items:flex-end"><div style="width:100%;height:${Math.max(2, Math.round(n / max * 100))}%;background:var(--tblr-primary,#7cc0ff);border-radius:2px;opacity:${n ? 1 : .25}"></div></div>`).join('');
      box.innerHTML = `<div class="table-wrap"><table class="table table-vcenter card-table table-sm"><thead><tr><th>Notes website</th><th>Today</th><th>Last 7 days</th><th>Last 30 days</th><th>Pro page</th></tr></thead><tbody>${rows}<tr><td><b>All notes sites</b></td><td><b>${tot[29]}</b></td><td><b>${tot.slice(-7).reduce((a, n) => a + n, 0)}</b></td><td><b>${tot.reduce((a, n) => a + n, 0)}</b></td><td></td></tr></tbody></table></div><div class="text-secondary small mt-3 mb-1">Visitors per day, last 30 days (all notes sites)</div><div style="display:flex;gap:2px;height:90px">${bars}</div>`;
    } catch (e) { box.innerHTML = '<span class="text-danger">' + esc(e.message) + '</span>'; }
  }
  async function load() {
    try { D = await call('GET'); show(true); render(); loadVisits(); }
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
      const r = await call('POST', { action, email: $('#a-email').value, product: $('#a-prod').value });
      if (action === 'lookup') {
        const s = r.student;
        out.innerHTML = `${esc(s.email)}${(r.payments.find((p) => p.contact) || {}).contact ? '<br>Phone: ' + esc(phoneFmt(r.payments.find((p) => p.contact).contact)) : ''}<br>First seen: ${when(s.first) || 'never'}<br>Last sign-in: ${when(s.last) || 'never'} (${s.logins} sign-ins)<br>Pro for: ${s.owned.join(', ') || 'none'}<br>Payments: ${r.payments.map((p) => esc(p.product) + ' ' + (p.manual ? 'manual' : rs(p.amount)) + ' ' + esc(p.status) + ' ' + esc(p.id)).join('; ') || 'none'}`;
      } else { out.textContent = action === 'grant' ? 'Pro given.' : 'Pro removed.'; await load(); }
    } catch (e) { out.textContent = e.message; }
  }
  $('#a-grant').addEventListener('click', () => act('grant'));
  $('#a-revoke').addEventListener('click', () => { if (confirm('Remove Pro for this student and subject?')) act('revoke'); });
  $('#a-look').addEventListener('click', () => act('lookup'));
  $('#r-go').addEventListener('click', async () => {
    const out = $('#r-out'); out.textContent = 'Asking Razorpay…';
    try { const r = await call('POST', { action: 'reconcile', days: $('#r-days').value }); out.textContent = `Found ${r.found} paid store payments, unlocked ${r.added} that were missing${r.filled ? ', added ' + r.filled + ' missing phone number' + (r.filled === 1 ? '' : 's') : ''}${r.skipped ? ', skipped ' + r.skipped + ' with a non-student email' : ''}.`; await load(); }
    catch (e) { out.textContent = e.message; }
  });

  // ---------------------------------------------------------------- refunds
  const modal = () => bootstrap.Modal.getOrCreateInstance($('#rf-modal'));
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
    const rows = [['date_time_ist', 'iso_time_utc', 'student_email', 'subject', 'amount_inr', 'status', 'payment_id', 'order_id', 'method', 'phone']].concat(visible().map((p) => [whenText(p.at), p.at, p.email, p.product, p.manual ? '' : (p.amount / 100).toFixed(2), p.status, p.id, p.order || '', p.method || '', p.contact || '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'notes-pro-payments-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  });

  if (KEY) load();
})();
