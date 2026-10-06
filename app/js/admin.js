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
  let KEY = '', D = null, RF = null;
  try { KEY = sessionStorage.getItem('st_admin') || ''; } catch (e) { /* ignore */ }

  async function call(method, data) {
    const r = await fetch('/api/admin', { method, headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
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
    filter();
  }
  const badge = (p) => p.status === 'refunded' ? '<span class="badge bg-red-lt">refunded</span>' : p.status === 'manual' ? '<span class="badge bg-yellow-lt">manual</span>' : '<span class="badge bg-green-lt">paid</span>';
  function filter() {
    if (!D) return;
    const q = $('#q').value.trim().toLowerCase();
    const has = (e) => !q || String(e).toLowerCase().includes(q);
    const name = (c) => { const p = D.products.find((x) => x.code === c); return p ? p.name : c; };
    $('#pay-rows').innerHTML = D.payments.filter((p) => has(p.email) || has(p.id)).map((p) => `<tr><td>${when(p.at)}</td><td>${esc(p.email)}</td><td>${esc(name(p.product))}</td><td>${p.manual ? '' : rs(p.amount)}</td><td title="${esc(p.id)}">${badge(p)}${p.status === 'refunded' && p.refundedAt ? '<div class="text-secondary small">' + when(p.refundedAt) + '</div>' : ''}</td><td>${p.status === 'paid' ? `<button class="btn btn-sm btn-outline-danger" data-refund="${esc(p.email)}|${esc(p.product)}|${p.amount}|${esc(p.id)}">Refund</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="text-secondary">No payments yet.</td></tr>';
    $('#ref-rows').innerHTML = (D.refunds || []).filter((r) => has(r.email) || has(r.payment)).map((r) => `<tr><td>${when(r.at)}</td><td>${esc(r.email)}</td><td>${esc(name(r.product))}</td><td>${rs(r.amount)}${r.full ? '' : ' (part)'}</td><td>${esc(r.reason)}${r.by === 'razorpay' ? ' <span class="text-secondary small">(done in Razorpay)</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No refunds yet.</td></tr>';
    $('#stu-rows').innerHTML = D.students.filter((s) => has(s.email)).map((s) => `<tr><td>${esc(s.email)}</td><td>${when(s.first)}</td><td>${when(s.last)}</td><td>${s.logins}</td><td>${s.owned.map((c) => `<span class="badge bg-green-lt me-1">${esc(c)}</span>`).join('') || '<span class="text-secondary">none</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No students yet.</td></tr>';
  }
  async function load() {
    try { D = await call('GET'); show(true); render(); }
    catch (e) { if (e.status === 401 || !D) { show(false); $('#gate-msg').textContent = e.message; try { sessionStorage.removeItem('st_admin'); } catch (x) { /* ignore */ } } else alert(e.message); }
  }

  $('#gate-form').addEventListener('submit', (e) => { e.preventDefault(); KEY = $('#key').value; try { sessionStorage.setItem('st_admin', KEY); } catch (x) { /* ignore */ } $('#key').value = ''; load(); });
  $('#refresh').addEventListener('click', load);
  $('#logout').addEventListener('click', () => { KEY = ''; D = null; try { sessionStorage.removeItem('st_admin'); } catch (x) { /* ignore */ } show(false); });
  $('#q').addEventListener('input', filter);

  async function act(action) {
    const out = $('#a-out'); out.textContent = 'Working…';
    try {
      const r = await call('POST', { action, email: $('#a-email').value, product: $('#a-prod').value });
      if (action === 'lookup') {
        const s = r.student;
        out.innerHTML = `${esc(s.email)}<br>First seen: ${when(s.first) || 'never'}<br>Last sign-in: ${when(s.last) || 'never'} (${s.logins} sign-ins)<br>Pro for: ${s.owned.join(', ') || 'none'}<br>Payments: ${r.payments.map((p) => esc(p.product) + ' ' + (p.manual ? 'manual' : rs(p.amount)) + ' ' + esc(p.status) + ' ' + esc(p.id)).join('; ') || 'none'}`;
      } else { out.textContent = action === 'grant' ? 'Pro given.' : 'Pro removed.'; await load(); }
    } catch (e) { out.textContent = e.message; }
  }
  $('#a-grant').addEventListener('click', () => act('grant'));
  $('#a-revoke').addEventListener('click', () => { if (confirm('Remove Pro for this student and subject?')) act('revoke'); });
  $('#a-look').addEventListener('click', () => act('lookup'));
  $('#r-go').addEventListener('click', async () => {
    const out = $('#r-out'); out.textContent = 'Asking Razorpay…';
    try { const r = await call('POST', { action: 'reconcile', days: $('#r-days').value }); out.textContent = `Found ${r.found} paid store payments, unlocked ${r.added} that were missing${r.skipped ? ', skipped ' + r.skipped + ' with a non-student email' : ''}.`; await load(); }
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
    const rows = [['date_time_ist', 'iso_time_utc', 'student_email', 'subject', 'amount_inr', 'status', 'payment_id', 'order_id', 'method']].concat(D.payments.map((p) => [whenText(p.at), p.at, p.email, p.product, p.manual ? '' : (p.amount / 100).toFixed(2), p.status, p.id, p.order || '', p.method || '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'notes-pro-payments-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
  });

  if (KEY) load();
})();
