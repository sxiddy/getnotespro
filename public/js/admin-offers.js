/* Notix admin: discount codes (api/offers.js). Uses the same key as admin.js (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const day = (ms) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

  async function call(method, data) {
    const r = await fetch('/api/offers' + (method === 'GET' ? '?part=list' : ''), { method, headers: { 'x-admin-key': key(), 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  function msg(text, bad) { const m = $('#off-msg'); m.textContent = text; m.className = 'small ' + (bad ? 'text-danger' : 'text-success'); }
  function state(o, now) {
    if (o.off) return '<span class="badge bg-secondary-lt">paused</span>';
    if (o.until && now >= o.until) return '<span class="badge bg-secondary-lt">expired</span>';
    if (o.max && o.uses >= o.max) return '<span class="badge bg-secondary-lt">used up</span>';
    return '<span class="badge bg-green-lt">working</span>';
  }
  const shareLink = (c) => location.origin + '/?code=' + encodeURIComponent(c);

  async function load() {
    try {
      if (!$('#off-codes').children.length) {
        const s = await fetch('/api/session', { cache: 'no-store' }).then((r) => r.json());
        $('#off-codes').innerHTML = s.products.map((p) => `<label class="form-check mb-0"><input class="form-check-input" type="checkbox" value="${esc(p.code)}"> <span class="form-check-label">${esc(p.code)} · ${esc(p.name)}</span></label>`).join('');
      }
      const { items, now } = await call('GET');
      $('#off-list').innerHTML = items.length ? items.map((o) => `<div class="list-group-item d-flex flex-wrap gap-3 align-items-start">
        <div class="flex-fill"><strong class="font-monospace">${esc(o.code)}</strong> · ${o.pct}% off ${state(o, now)}
          <div class="text-secondary small">${o.uses}${o.max ? ' of ' + o.max : ''} used · ${o.codes.length ? o.codes.map(esc).join(', ') : 'every subject'} · ${o.until ? 'ends ' + day(o.until) : 'never ends'}${o.note ? ' · ' + esc(o.note) : ''}</div>
          <div class="text-secondary small">Share link: <span class="font-monospace user-select-all">${esc(shareLink(o.code))}</span></div></div>
        <div class="d-flex gap-2"><button class="btn btn-sm" type="button" data-pause="${esc(o.code)}" data-off="${o.off ? '0' : '1'}">${o.off ? 'Turn on' : 'Pause'}</button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-del="${esc(o.code)}">Delete</button></div></div>`).join('') : '<p class="text-secondary mb-0">No codes yet.</p>';
    } catch (e) { $('#off-list').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }

  $('#off-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || $('#off-form button'); btn.disabled = true;
    try {
      const codes = [...document.querySelectorAll('#off-codes input:checked')].map((x) => x.value);
      const r = await call('POST', { action: 'offer-add', code: $('#off-code').value, pct: $('#off-pct').value, max: $('#off-max').value, days: $('#off-days').value, note: $('#off-note').value, codes });
      $('#off-form').reset(); msg(r.item.code + ' works now.'); load();
    } catch (x) { msg(x.message, true); }
    btn.disabled = false;
  });
  $('#off-list').addEventListener('click', async (e) => {
    const p = e.target.closest('[data-pause]'), d = e.target.closest('[data-del]');
    if (!p && !d) return;
    if (d && !confirm('Delete ' + d.dataset.del + '? Students can no longer use it, and who used it is forgotten (their payments keep the code).')) return;
    (p || d).disabled = true;
    try {
      if (p) await call('POST', { action: 'offer-pause', code: p.dataset.pause, off: p.dataset.off === '1' });
      else await call('POST', { action: 'offer-del', code: d.dataset.del });
      load();
    } catch (x) { alert(x.message); (p || d).disabled = false; }
  });
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
