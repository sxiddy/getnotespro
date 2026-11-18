/* Notix admin: one inbox for the Help?/idea messages sent on every subject site, and the result of the daily check
   (api/cron.js) shown at the top so a broken subject is never missed. Same key as admin.js. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const day = (s) => s ? new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
  const KIND = { mistake: 'Mistake in the notes', suggestion: 'Suggestion', bug: "Something isn't working", other: 'Other', idea: 'Idea' };
  let DATA = null, filter = 'open', sub = 'all', box = 'help'; // box: 'help' = reports (Help? messages), 'idea' = ideas

  async function call(method, qs, data) {
    const r = await fetch(qs, { method, headers: { 'x-admin-key': key(), 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }

  // the alert bar sits above everything, on every section
  function alerts() {
    const box = $('#alerts'), probs = [];
    const h = DATA.health;
    // local runs have no database or Razorpay keys; on the live store these are real problems
    if (h && h.problems) h.problems.forEach((p) => probs.push(esc(p)));
    DATA.sites.filter((s) => !s.ok).forEach((s) => probs.push('<b>' + esc(s.code) + '</b>: admin stats unreachable (' + esc(s.error || 'error') + ')'));
    const stale = !h || Date.now() - Date.parse(h.at) > 36 * 3600e3;
    if (stale) probs.push('The daily check has not run in the last 36 hours' + (h ? ' (last: ' + day(h.at) + ')' : '') + '.');
    const open = openCount();
    box.innerHTML = (probs.length ? `<div class="alert alert-danger mb-3"><div class="d-flex align-items-start gap-2 flex-wrap"><div class="flex-fill"><b>Needs attention</b><ul class="mb-0 mt-1">${probs.map((p) => '<li>' + p + '</li>').join('')}</ul></div><button class="btn btn-sm" type="button" id="hc-run">Run check now</button></div></div>`
      : `<div class="alert alert-success mb-3 d-flex align-items-center gap-2 flex-wrap"><span class="flex-fill">All 5 subject sites are up and linked to the store${h ? ' · checked ' + day(h.at) : ''}.</span><button class="btn btn-sm" type="button" id="hc-run">Run check now</button></div>`)
      + (open ? `<div class="alert alert-warning mb-3"><a href="#inbox" data-goto="inbox"><b>${open}</b> open ${open === 1 ? 'message' : 'messages'} from students on the subject sites</a></div>` : '');
    document.dispatchEvent(new CustomEvent('notix-badges', { detail: { inbox: open, alerts: probs.length } }));
  }
  const all = () => DATA.sites.flatMap((s) => s.feedback.map((f) => Object.assign({ code: s.code }, f)));
  const openCount = () => all().filter((f) => f.status === 'open').length;

  function render() {
    const inSub = all().filter((f) => (sub === 'all' || f.code === sub));
    const isIdea = (f) => f.kind === 'idea';
    const openIn = (b) => inSub.filter((f) => (b === 'idea') === isIdea(f) && f.status === 'open').length;
    const totalIn = (b) => inSub.filter((f) => (b === 'idea') === isIdea(f)).length;
    const boxes = [['help', 'Reports'], ['idea', 'Ideas']].map(([k, l]) => `<button class="btn${box === k ? ' btn-primary' : ''}" type="button" data-box="${k}">${l} <span class="ms-1 small">${openIn(k)} open · ${totalIn(k)} total</span></button>`).join('');
    const list = inSub.filter((f) => (box === 'idea') === isIdea(f)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const n = (st) => list.filter((f) => f.status === st).length;
    const tabs = [['open', 'Open'], ['fixed', 'Fixed / done'], ['ignored', 'Ignored']].map(([k, l]) => `<button class="btn btn-sm${filter === k ? ' btn-primary' : ''}" type="button" data-f="${k}">${l} ${n(k)}</button>`).join('');
    const subs = '<select class="form-select form-select-sm w-auto" id="ib-sub"><option value="all">All subjects</option>' + DATA.sites.map((s) => `<option value="${esc(s.code)}"${sub === s.code ? ' selected' : ''}>${esc(s.code)} · ${esc(s.name)}</option>`).join('') + '</select>';
    const shown = list.filter((f) => f.status === filter);
    const item = (f) => `<div class="list-group-item">
      <div class="text-secondary small"><span class="chip">${esc(f.code)}</span>${day(f.at)} · <b>${esc(KIND[f.kind] || f.kind)}</b>${f.topic ? ' · ' + esc(f.topic) + (f.tab ? ' › ' + esc(f.tab) : '') : ''}${f.email ? ' · ' + esc(f.email) : ''}${f.contact ? ' · ' + esc(f.contact) : ''}</div>
      <div class="my-1" style="white-space:pre-line;overflow-wrap:anywhere">${esc(f.text)}</div>
      ${f.reply ? `<div class="small p-2 mb-2" style="border-left:2px solid var(--line-2)"><span class="text-secondary">Your reply · ${day(f.reply.at)}</span><div style="white-space:pre-line">${esc(f.reply.text)}</div></div>` : ''}
      <div class="d-flex gap-2 flex-wrap">${['fixed', 'ignored', 'open'].filter((s) => s !== f.status).map((s) => `<button class="btn btn-sm" type="button" data-st="${s}" data-code="${esc(f.code)}" data-id="${esc(f.id)}">${{ fixed: 'Mark fixed', ignored: 'Ignore', open: 'Reopen' }[s]}</button>`).join('')}</div>
      ${f.email ? `<details class="mt-2"><summary class="p-0 small">${f.reply ? 'Reply again' : 'Reply on the site'}</summary><textarea class="form-control mt-2" rows="2" maxlength="1500" data-rt="${esc(f.id)}" placeholder="The student sees this under Messages on ${esc(f.code)}"></textarea><div class="d-flex gap-2 align-items-center mt-2"><button class="btn btn-sm btn-primary" type="button" data-reply="${esc(f.id)}" data-code="${esc(f.code)}">Send reply</button><span class="small" data-rm="${esc(f.id)}"></span></div></details>` : '<div class="text-secondary small mt-1">Sent without an email, so it cannot be answered.</div>'}
    </div>`;
    $('#ib-body').innerHTML = `<div class="d-flex gap-2 flex-wrap mb-3">${boxes}</div><div class="d-flex gap-2 flex-wrap align-items-center mb-3">${tabs}<span class="ms-auto">${subs}</span></div>`
      + (shown.length ? '<div class="list-group list-group-flush">' + shown.map(item).join('') + '</div>' : '<p class="text-secondary mb-0">' + (box === 'idea' ? 'No ideas' : 'No reports') + (filter === 'open' ? ' open. All caught up.' : ' here.') + (filter === 'open' && list.length ? ' Older ones are under Fixed / done and Ignored.' : '') + '</p>');
  }

  const rs = (paise) => paise == null ? '–' : '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  function glance() {
    const rows = DATA.settings || [];
    const cols = [
      ['Price', (x) => (x.price == null ? '–' : '₹' + x.price)],
      ['Sale', (x) => x.sale ? rs(x.sale.price) + (x.sale.until ? ' until ' + day(x.sale.until) : '') : 'none'],
      ['Paused', (x) => x.paused && x.paused.on ? 'PAUSED' : 'no'],
      ['Sign-in', (x) => x.signin === false ? 'off' : 'on'],
      ['Whole site free', (x) => x.free ? 'yes' : 'no'],
      ['Reviewer login', (x) => x.reviewOn ? 'on' : 'off'],
      ['Banner', (x) => x.banner ? (x.banner.text || 'on') : 'none'],
    ];
    // the most common value in a column is "normal"; anything else is highlighted
    const common = cols.map(([, f]) => { const c = {}; rows.forEach((r) => { const v = r.ok ? f(r) : ''; c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; });
    $('#glance-body').innerHTML = '<table class="table table-sm card-table mb-0"><thead><tr><th>Subject</th>' + cols.map((c) => '<th>' + c[0] + '</th>').join('') + '</tr></thead><tbody>'
      + rows.map((r) => '<tr><td><b>' + esc(r.code) + '</b></td>' + (r.ok ? cols.map(([, f], i) => { const v = f(r); return '<td' + (v !== common[i] ? ' class="odd"' : '') + '>' + esc(v) + '</td>'; }).join('') : '<td colspan="' + cols.length + '" class="text-danger">site did not answer</td>') + '</tr>').join('') + '</tbody></table>';
  }
  const ACT = { paid: ['💰', 'bought Pro'], manual: ['🎁', 'given Pro by hand'], offline: ['💵', 'paid outside the website'], refund: ['↩️', 'refunded'], message: ['📩', 'sent a message'], idea: ['💡', 'sent an idea'] };
  function activity() {
    const list = DATA.activity || [];
    $('#act-body').innerHTML = list.length ? '<div class="list-group list-group-flush">' + list.slice(0, 40).map((x) => {
      const [ic, verb] = ACT[x.type] || ['•', x.type];
      return `<div class="list-group-item px-0 py-2 d-flex gap-2"><span>${ic}</span><div class="flex-fill" style="min-width:0"><div class="small"><span class="chip">${esc(x.code)}</span><b>${esc(x.who || 'someone')}</b> ${verb}${x.amount ? ' · ' + rs(x.amount) : ''}${x.status && x.status !== 'open' ? ' · <span class="text-secondary">' + esc(x.status) + '</span>' : ''}</div>${x.text ? '<div class="text-secondary small" style="overflow-wrap:anywhere">' + esc(x.text) + '</div>' : ''}</div><span class="text-secondary small text-nowrap">${day(x.at)}</span></div>`;
    }).join('') + '</div>' : '<p class="text-secondary mb-0">Nothing yet.</p>';
  }

  async function load() {
    try { DATA = await call('GET', '/api/admin?part=inbox'); alerts(); render(); glance(); activity(); }
    catch (e) { $('#ib-body').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }

  $('#ib-card').addEventListener('change', (e) => { if (e.target.id === 'ib-sub') { sub = e.target.value; render(); } });
  $('#ib-card').addEventListener('click', async (e) => {
    const bx = e.target.closest('[data-box]'); if (bx) { box = bx.dataset.box; filter = 'open'; render(); return; }
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; render(); return; }
    const st = e.target.closest('[data-st]');
    if (st) { st.disabled = true; try { await call('POST', '/api/admin', { action: 'site', code: st.dataset.code, op: 'feedback-status', id: st.dataset.id, status: st.dataset.st }); await load(); } catch (x) { alert(x.message); st.disabled = false; } return; }
    const rp = e.target.closest('[data-reply]');
    if (rp) {
      const id = rp.dataset.reply, text = (document.querySelector('[data-rt="' + id + '"]').value || '').trim(), msg = document.querySelector('[data-rm="' + id + '"]');
      if (text.length < 2) { msg.textContent = 'Type a reply first.'; return; }
      rp.disabled = true; msg.textContent = 'Sending…';
      try { await call('POST', '/api/admin', { action: 'site', code: rp.dataset.code, op: 'reply', id, text }); await load(); } catch (x) { msg.textContent = x.message; rp.disabled = false; }
    }
  });
  $('#alerts').addEventListener('click', async (e) => {
    const b = e.target.closest('#hc-run'); if (!b) return;
    b.disabled = true; b.textContent = 'Checking…';
    try { await call('GET', '/api/cron?job=check'); } catch (x) { /* shown by the reload */ }
    load();
  });
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
