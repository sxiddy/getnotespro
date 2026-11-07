/* Notix admin: post and delete updates (api/community.js). Uses the same key as admin.js (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const day = (ms) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  let names = {};

  async function call(method, data) {
    const r = await fetch('/api/community' + (method === 'GET' ? '?part=ann' : ''), { method, headers: { 'x-admin-key': key(), 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  function msg(text, bad) { const m = $('#ann-msg'); m.textContent = text; m.className = 'small ' + (bad ? 'text-danger' : 'text-success'); }

  async function load() {
    try {
      if (!Object.keys(names).length) {
        const s = await fetch('/api/session', { cache: 'no-store' }).then((r) => r.json());
        s.products.forEach((p) => { names[p.code] = p.name; });
        $('#ann-codes').innerHTML = s.products.map((p) => `<label class="form-check mb-0"><input class="form-check-input" type="checkbox" value="${esc(p.code)}"> <span class="form-check-label">${esc(p.code)} · ${esc(p.name)}</span></label>`).join('');
      }
      const { items } = await call('GET');
      $('#ann-list').innerHTML = items.length ? items.map((u) => `<div class="list-group-item d-flex gap-3 align-items-start">
        <div class="flex-fill"><div class="text-secondary small">${day(u.at)}${u.codes.length ? ' · ' + u.codes.map(esc).join(', ') : ' · whole store'}</div><strong>${esc(u.title)}</strong>${u.body ? `<div class="text-secondary" style="white-space:pre-line">${esc(u.body)}</div>` : ''}</div>
        <button class="btn btn-sm btn-outline-danger" type="button" data-del="${esc(u.id)}">Delete</button></div>`).join('') : '<p class="text-secondary mb-0">No updates posted yet.</p>';
    } catch (e) { $('#ann-list').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }

  $('#ann-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#ann-form button'); btn.disabled = true;
    try {
      const codes = [...document.querySelectorAll('#ann-codes input:checked')].map((x) => x.value);
      await call('POST', { action: 'ann-add', title: $('#ann-title').value, body: $('#ann-body').value, codes });
      $('#ann-form').reset(); msg('Posted. It shows on the site within a minute.'); load();
    } catch (x) { msg(x.message, true); }
    btn.disabled = false;
  });
  $('#ann-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    if (!confirm('Delete this update from the site?')) return;
    b.disabled = true;
    try { await call('POST', { action: 'ann-del', id: b.dataset.del }); load(); } catch (x) { alert(x.message); b.disabled = false; }
  });
  // load whenever the admin opens (after the password) and on Refresh
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
