/* Notix admin: reported mistakes (F7), reviews (G3) and subject requests (F1/F2) from api/community.js. Same key as admin.js. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const day = (ms) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  const none = (t) => '<p class="text-secondary mb-0">' + t + '</p>';
  const btn = (cls, data, text) => `<button class="btn btn-sm ${cls}" type="button" ${data}>${text}</button>`;

  async function call(method, data) {
    const r = await fetch('/api/community' + (method === 'GET' ? '?part=admin' : ''), { method, headers: { 'x-admin-key': key(), 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  async function load() {
    try {
      const { requests, reviews, reports } = await call('GET');
      $('#com-rep-n').textContent = reports.length || '';
      $('#com-rep').innerHTML = reports.length ? reports.map((x) => `<div class="list-group-item d-flex gap-3 align-items-start flex-wrap">
        <div class="flex-fill" style="min-width:220px"><div class="text-secondary small">${day(x.at)} · <b>${esc(x.code)}</b>${x.where ? ' · ' + esc(x.where) : ''}${x.email ? ' · <a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' : ''}</div><div style="white-space:pre-line;overflow-wrap:anywhere">${esc(x.text)}</div></div>
        ${btn('btn-outline-secondary', 'data-act="rep-del" data-id="' + esc(x.id) + '"', 'Fixed / remove')}</div>`).join('') : none('No mistakes reported.');

      $('#com-rev').innerHTML = reviews.length ? reviews.map((x) => `<div class="list-group-item d-flex gap-3 align-items-start flex-wrap">
        <div class="flex-fill" style="min-width:220px"><div class="text-secondary small">${day(x.at)} · <b>${esc(x.code)}</b> · ${'★'.repeat(x.stars)} · ${esc(x.name || 'VIT student')} (${esc(x.email)}) · ${x.ok ? '<span class="text-success">live</span>' : '<span class="text-warning">waiting</span>'}</div><div style="white-space:pre-line;overflow-wrap:anywhere">${esc(x.text)}</div></div>
        <div class="d-flex gap-2">${x.ok ? btn('btn-outline-secondary', 'data-act="rev-approve" data-on="0" data-id="' + esc(x.id) + '"', 'Hide') : btn('btn-success', 'data-act="rev-approve" data-on="1" data-id="' + esc(x.id) + '"', 'Approve')}${btn('btn-outline-danger', 'data-act="rev-del" data-id="' + esc(x.id) + '"', 'Delete')}</div></div>`).join('') : none('No reviews yet.');

      const label = { open: 'open', soon: 'coming soon', done: 'done', hidden: 'hidden' };
      $('#com-req').innerHTML = requests.length ? requests.map((x) => `<div class="list-group-item d-flex gap-3 align-items-start flex-wrap">
        <div class="flex-fill" style="min-width:220px"><div><b>${esc(x.name)}</b> <span class="text-secondary">· ▲ ${x.votes} · ${label[x.status]}</span></div>
        <div class="text-secondary small">${day(x.at)} · asked by ${esc(x.by)}${x.note ? ' · ' + esc(x.note) : ''}</div>
        ${x.notify.length ? `<details class="small"><summary>${x.notify.length} to notify</summary><textarea class="form-control form-control-sm mt-1" rows="2" readonly>${esc(x.notify.join(', '))}</textarea></details>` : ''}</div>
        <div class="d-flex gap-2 flex-wrap">${['open', 'soon', 'done', 'hidden'].filter((s) => s !== x.status).map((s) => btn('btn-outline-secondary', 'data-act="req-status" data-status="' + s + '" data-id="' + esc(x.id) + '"', { open: 'Open', soon: 'Coming soon', done: 'Done', hidden: 'Hide' }[s])).join('')}${btn('btn-outline-danger', 'data-act="req-del" data-id="' + esc(x.id) + '"', 'Delete')}</div></div>`).join('') : none('No requests yet.');
    } catch (e) { $('#com-rep').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }

  $('#com-card').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (/-del$/.test(act) && act !== 'rep-del' && !confirm('Delete this for good?')) return;
    b.disabled = true;
    try { await call('POST', { action: act, id: b.dataset.id, status: b.dataset.status, on: b.dataset.on !== '0' }); load(); } catch (x) { alert(x.message); b.disabled = false; }
  });
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
