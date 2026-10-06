/* Notes Pro admin: reads /api/admin with the key kept for this tab only (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rs = (paise) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const when = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? esc(iso) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  let KEY = '', D = null;
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
    $('#stamp').textContent = 'Updated ' + when(D.now);
    const kpi = (label, val, sub) => `<div class="col-sm-6 col-lg-3"><div class="card"><div class="card-body"><div class="subheader">${label}</div><div class="h1 mb-0">${val}</div><div class="text-secondary small">${sub || '&nbsp;'}</div></div></div></div>`;
    $('#kpis').innerHTML = kpi('Revenue (recorded)', rs(T.revenue), 'before Razorpay fees') + kpi('Paid unlocks', T.payments, 'real payments') + kpi('Manual grants', T.manual, 'not counted as revenue') + kpi('Students seen', T.students, 'signed in or owning Pro');
    $('#subjects').innerHTML = D.products.map((p) => `<div class="col-md-4"><div class="card"><div class="card-body">
      <div class="d-flex justify-content-between"><div><div class="subheader">${esc(p.code)}</div><div class="h3 mb-1">${esc(p.name)}</div></div><span class="badge bg-blue-lt align-self-start">${rs(p.price)}</span></div>
      <div class="text-secondary">${p.count} paid · ${p.manual} manual</div><div class="h2 mt-2 mb-0">${rs(p.revenue)}</div></div></div></div>`).join('');
    const opts = D.products.map((p) => `<option value="${esc(p.code)}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
    if (!$('#a-prod').options.length) $('#a-prod').innerHTML = opts;
    filter();
  }
  function filter() {
    if (!D) return;
    const q = $('#q').value.trim().toLowerCase();
    const has = (e) => !q || String(e).toLowerCase().includes(q);
    $('#pay-rows').innerHTML = D.payments.filter((p) => has(p.email)).map((p) => `<tr><td>${when(p.at)}</td><td>${esc(p.email)}</td><td><span class="badge bg-blue-lt">${esc(p.product)}</span></td><td>${p.manual ? '<span class="badge bg-yellow-lt">manual</span>' : rs(p.amount)}</td><td class="mono">${esc(p.id)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-secondary">No payments yet.</td></tr>';
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
        out.innerHTML = `${esc(s.email)}<br>First seen: ${when(s.first) || 'never'}<br>Last sign-in: ${when(s.last) || 'never'} (${s.logins} sign-ins)<br>Pro for: ${s.owned.join(', ') || 'none'}<br>Payments: ${r.payments.map((p) => esc(p.product) + ' ' + (p.manual ? 'manual' : rs(p.amount)) + ' ' + esc(p.id)).join('; ') || 'none'}`;
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

  if (KEY) load();
})();
