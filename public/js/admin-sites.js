/* Notix admin: run every subject site from here. Prices and the sale are the store's own (api/admin.js
   set-list-price / set-store-sale); everything else is passed to that site's /api/stats (api/admin.js action 'site'). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const day = (s) => s ? new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
  const rs = (p) => '₹' + (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  let D = null;

  async function post(data) {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'x-admin-key': key(), 'Content-Type': 'application/json' }, body: JSON.stringify(data), cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  const site = (code, op, args) => post({ action: 'site', code, op, args });
  // run on one subject or all of them
  async function onEach(codes, fn) {
    const out = await Promise.allSettled(codes.map(fn));
    const bad = out.map((r, i) => r.status === 'rejected' ? codes[i] + ': ' + r.reason.message : null).filter(Boolean);
    if (bad.length) throw new Error(bad.join('\n'));
  }
  const codes = () => D.sites.map((s) => s.code);
  const pick = (id, all) => '<select class="form-select form-select-sm w-auto" id="' + id + '">' + (all ? '<option value="*">All subjects</option>' : '') + D.sites.map((s) => '<option value="' + esc(s.code) + '">' + esc(s.code) + ' · ' + esc(s.name) + '</option>').join('') + '</select>';
  const chosen = (id) => { const v = $('#' + id).value; return v === '*' ? codes() : [v]; };
  const msg = (id, t, bad) => { const m = $('#' + id); if (m) { m.textContent = t; m.className = 'small ' + (bad ? 'text-danger' : 'text-green'); } };
  const done = async (id, t) => { msg(id, t); if (window.notixReload) await window.notixReload(); };

  function sitesHTML() {
    const pr = D.pricing || { subjects: [] }, by = {}; pr.subjects.forEach((p) => { by[p.code] = p; });
    const sale = pr.sale;
    const cell = (v, odd) => '<td' + (odd ? ' class="odd"' : '') + '>' + v + '</td>';
    const common = (f) => { const c = {}; D.sites.forEach((s) => { const v = f(s); c[v] = (c[v] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
    const fPaused = (s) => String(!!(s.paused && s.paused.on)), fSign = (s) => String(s.signin !== false), fFree = (s) => String(!!s.freeNow), fBan = (s) => String(!!(s.banner && s.banner.on && s.banner.text)), fPrice = (s) => String(by[s.code] && by[s.code].list);
    const cP = common(fPaused), cS = common(fSign), cF = common(fFree), cB = common(fBan), cPr = common(fPrice);
    const tog = (code, op, on, label) => `<button class="btn btn-sm${on ? ' btn-primary' : ''}" type="button" data-tog="${op}" data-code="${esc(code)}" data-on="${on ? 1 : 0}">${label}</button>`;
    const rows = D.sites.map((s) => {
      if (!s.ok) return `<tr><td><b>${esc(s.code)}</b></td><td colspan="6" class="text-danger">site did not answer (${esc(s.error || '')})</td></tr>`;
      const p = by[s.code] || {};
      const banner = s.banner && s.banner.on && s.banner.text ? esc(s.banner.text) : s.banner && s.banner.text ? '<span class="text-secondary">off (was: ' + esc(s.banner.text) + ')</span>' : '<span class="text-secondary">none</span>';
      return `<tr>
        <td><b>${esc(s.code)}</b><div class="text-secondary small">${esc(s.name)}</div></td>
        ${cell(`<div class="d-flex gap-1 align-items-center"><span>₹</span><input class="form-control form-control-sm" style="width:72px" type="number" min="1" step="1" value="${p.list ? p.list / 100 : ''}" data-price="${esc(s.code)}"><button class="btn btn-sm" type="button" data-saveprice="${esc(s.code)}">Save</button></div><div class="text-secondary small">${p.now != null && p.now !== p.list ? 'pays ' + rs(p.now) + ' now' : 'no sale'}</div>`, fPrice(s) !== cPr)}
        ${cell(tog(s.code, 'set-paused', s.paused && s.paused.on, s.paused && s.paused.on ? 'Paused' : 'Selling'), fPaused(s) !== cP)}
        ${cell(tog(s.code, 'set-signin', s.signin !== false, s.signin !== false ? 'On' : 'Off'), fSign(s) !== cS)}
        ${cell(tog(s.code, 'set-mode', !!s.freeNow, s.freeNow ? 'Free for all' : 'Pro locked'), fFree(s) !== cF)}
        ${cell(`<div style="max-width:260px;overflow-wrap:anywhere">${banner}</div><button class="btn btn-sm mt-1" type="button" data-editban="${esc(s.code)}">Edit</button>${s.banner && s.banner.on ? ` <button class="btn btn-sm mt-1" type="button" data-offban="${esc(s.code)}">Remove</button>` : s.banner && s.banner.text ? ` <button class="btn btn-sm mt-1" type="button" data-onban="${esc(s.code)}">Show again</button>` : ''}`, fBan(s) !== cB)}
      </tr>`;
    }).join('');
    return `<div class="card-body border-bottom">
        <div class="d-flex flex-wrap gap-2 align-items-center"><b class="me-2">Store sale</b>
          <span class="${sale ? 'text-green' : 'text-secondary'}">${sale ? sale.pct + '% off every subject until ' + day(sale.until) : 'no sale running'}</span>
          <span class="ms-auto d-flex gap-2 align-items-center flex-wrap"><input class="form-control form-control-sm" style="width:80px" type="number" min="1" max="99" id="ss-pct" placeholder="% off" value="${sale ? sale.pct : ''}">
          <input class="form-control form-control-sm w-auto" type="date" id="ss-until" title="Last day of the sale (IST)">
          <button class="btn btn-sm btn-primary" type="button" id="ss-go">${sale ? 'Update sale' : 'Start sale'}</button>${sale ? '<button class="btn btn-sm" type="button" id="ss-end">End sale now</button>' : ''}</span></div>
        <div class="small mt-1" id="ss-msg"></div>
      </div>
      <div class="table-responsive"><table class="table table-sm card-table mb-0 align-middle"><thead><tr><th>Subject</th><th>Full price</th><th>Payments</th><th>Google sign-in</th><th>Pro features</th><th>Banner</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="card-body border-top" id="ban-box" hidden>
        <div class="d-flex gap-2 flex-wrap align-items-start"><span class="small text-secondary">Banner on</span>${pick('ban-code', true)}
          <textarea class="form-control flex-fill" id="ban-text" rows="2" maxlength="240" placeholder="e.g. All the best for your CAT-2!" style="min-width:240px"></textarea>
          <button class="btn btn-primary" type="button" id="ban-go">Show banner</button></div>
        <div class="small mt-1" id="ban-msg"></div>
      </div>
      <div class="card-body border-top">
        <details><summary class="p-0">More: pause message, temporary price on one site, business name</summary>
          <div class="row g-2 mt-2 align-items-center">
            <div class="col-auto">${pick('mo-code', true)}</div>
            <div class="col-md-5"><input class="form-control form-control-sm" id="mo-ptext" maxlength="240" placeholder="Message shown while payments are paused"></div>
            <div class="col-auto"><button class="btn btn-sm" type="button" id="mo-pause">Pause with this message</button></div>
          </div>
          <div class="row g-2 mt-1 align-items-center">
            <div class="col-auto"><input class="form-control form-control-sm" style="width:90px" type="number" min="0" id="mo-srs" placeholder="₹ price"></div>
            <div class="col-auto"><input class="form-control form-control-sm" style="width:90px" type="number" min="1" id="mo-sh" placeholder="hours"></div>
            <div class="col-md-4"><input class="form-control form-control-sm" id="mo-stext" maxlength="140" placeholder="Sale message (optional)"></div>
            <div class="col-auto"><button class="btn btn-sm" type="button" id="mo-sale">Set site sale</button> <button class="btn btn-sm" type="button" id="mo-endsale">End site sale</button></div>
            <div class="col-12 text-secondary small">Only for a site that sells on its own. Every subject now sells on Notix, so use the store sale above.</div>
          </div>
          <div class="row g-2 mt-1 align-items-center">
            <div class="col-md-5"><input class="form-control form-control-sm" id="mo-biz" maxlength="120" placeholder="Business name on the terms, refund and contact pages"></div>
            <div class="col-auto"><button class="btn btn-sm" type="button" id="mo-bizgo">Save business name</button></div>
          </div>
          <div class="small mt-2" id="mo-msg"></div>
        </details>
      </div>`;
  }

  function studentsHTML() {
    const reqs = D.sites.flatMap((s) => (s.resetRequests || []).map((r) => Object.assign({ code: s.code }, r)));
    const free = D.sites.flatMap((s) => (s.free || []).map((f) => Object.assign({ code: s.code }, f)));
    return `<div class="row g-2 align-items-center">
        <div class="col-md-4"><input class="form-control" id="st-email" type="email" placeholder="student@vitstudent.ac.in"></div>
        <div class="col-auto">${pick('st-code', true)}</div>
        <div class="col-auto"><select class="form-select form-select-sm w-auto" id="st-dur"><option value="0">Forever</option><option value="6">6 hours</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">7 days</option><option value="720">30 days</option></select></div>
      </div>
      <div class="btn-list mt-2">
        <button class="btn btn-sm" type="button" data-st="lookup">Look up</button>
        <button class="btn btn-sm btn-primary" type="button" data-st="grant">Give free access</button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-st="revoke">Remove free access</button>
        <button class="btn btn-sm" type="button" data-st="reset-devices">Reset devices</button>
        <span class="d-inline-flex gap-1 align-items-center"><input class="form-control form-control-sm" style="width:64px" type="number" min="1" max="9" id="st-ph" placeholder="phones"><input class="form-control form-control-sm" style="width:64px" type="number" min="1" max="9" id="st-pc" placeholder="PCs"><button class="btn btn-sm" type="button" data-st="set-limits">Set device limit</button><button class="btn btn-sm" type="button" data-st="clear-limits">Back to 1 + 1</button></span>
      </div>
      <div class="mono mt-2" id="st-out" style="white-space:pre-wrap"></div>
      <h3 class="h4 mt-4">Device reset requests <span class="badge bg-secondary-lt">${reqs.length || ''}</span></h3>
      ${reqs.length ? '<div class="list-group list-group-flush">' + reqs.map((r) => `<div class="list-group-item d-flex gap-2 flex-wrap align-items-center"><span class="chip">${esc(r.code)}</span><div class="flex-fill"><b>${esc(r.email)}</b> <span class="text-secondary small">${day(r.at)}${r.reason ? ' · ' + esc(r.reason) : ''}</span></div><button class="btn btn-sm btn-primary" type="button" data-rq="approve-reset" data-code="${esc(r.code)}" data-email="${esc(r.email)}">Approve</button><button class="btn btn-sm" type="button" data-rq="decline-reset" data-code="${esc(r.code)}" data-email="${esc(r.email)}">Decline</button></div>`).join('') + '</div>' : '<p class="text-secondary">None waiting.</p>'}
      <details class="mt-3"><summary class="p-0">Free access given on the subject sites (${free.length})</summary>
        ${free.length ? '<div class="list-group list-group-flush mt-2">' + free.map((f) => `<div class="list-group-item d-flex gap-2 flex-wrap align-items-center"><span class="chip">${esc(f.code)}</span><div class="flex-fill">${esc(f.email)} <span class="text-secondary small">${esc(f.name || '')}${f.until ? ' · until ' + day(f.until) : ' · forever'}${f.modules ? ' · ' + esc(f.modules.join(', ')) : ''}</span></div><button class="btn btn-sm btn-outline-danger" type="button" data-rq="revoke" data-code="${esc(f.code)}" data-email="${esc(f.email)}">Remove</button></div>`).join('') + '</div>' : '<p class="text-secondary mt-2">Nobody.</p>'}
      </details>`;
  }

  function draw() {
    if (!D) return;
    $('#glance-body').innerHTML = sitesHTML();
    // keep what the owner was typing in the student form across refreshes
    const keep = { e: $('#st-email') && $('#st-email').value, c: $('#st-code') && $('#st-code').value, out: $('#st-out') && $('#st-out').textContent };
    $('#stu-body').innerHTML = studentsHTML();
    if (keep.e) $('#st-email').value = keep.e;
    if (keep.c) $('#st-code').value = keep.c;
    if (keep.out) $('#st-out').textContent = keep.out;
  }
  document.addEventListener('notix-data', (e) => { D = e.detail; draw(); });

  $('#glance-card').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.dataset.saveprice) {
        const c = t.dataset.saveprice, v = document.querySelector('[data-price="' + c + '"]').value;
        t.disabled = true; await post({ action: 'set-list-price', code: c, rupees: v }); return done('ss-msg', c + ' full price saved. The subject site shows it within 5 minutes.');
      }
      if (t.dataset.tog) {
        const on = t.dataset.on !== '1', op = t.dataset.tog, c = t.dataset.code;
        const what = { 'set-paused': on ? 'pause payments on ' + c : 'start selling again on ' + c, 'set-signin': on ? 'turn Google sign-in ON for ' + c : 'turn Google sign-in OFF for ' + c + ' (anyone opens it as a guest)', 'set-mode': on ? 'make every Pro feature FREE for everyone on ' + c : 'lock Pro features again on ' + c }[op];
        if (!confirm('Do you want to ' + what + '?')) return;
        t.disabled = true; await site(c, op, op === 'set-mode' ? { free: on } : { on }); return done('ss-msg', c + ' updated.');
      }
      if (t.id === 'ss-go') { t.disabled = true; await post({ action: 'set-store-sale', pct: $('#ss-pct').value, until: $('#ss-until').value }); return done('ss-msg', 'Sale saved for every subject.'); }
      if (t.id === 'ss-end') { if (!confirm('End the sale now? Every subject goes back to its full price.')) return; t.disabled = true; await post({ action: 'end-store-sale' }); return done('ss-msg', 'Sale ended.'); }
      if (t.dataset.editban) { $('#ban-box').hidden = false; $('#ban-code').value = t.dataset.editban; const s = D.sites.find((x) => x.code === t.dataset.editban); $('#ban-text').value = s && s.banner ? s.banner.text || '' : ''; $('#ban-text').focus(); return; }
      if (t.dataset.onban) { const s = D.sites.find((x) => x.code === t.dataset.onban); t.disabled = true; await site(t.dataset.onban, 'set-banner', { on: true, text: s.banner.text }); return done('ss-msg', 'Banner is back on ' + t.dataset.onban + '.'); }
      if (t.dataset.offban) { t.disabled = true; await site(t.dataset.offban, 'set-banner', { on: false, text: '' }); return done('ss-msg', 'Banner removed from ' + t.dataset.offban + '.'); }
      if (t.id === 'ban-go') { const text = $('#ban-text').value.trim(); if (!text) return msg('ban-msg', 'Type the banner first.', true); t.disabled = true; await onEach(chosen('ban-code'), (c) => site(c, 'set-banner', { on: true, text })); return done('ban-msg', 'Banner is up.'); }
      if (t.id === 'mo-pause') { const cs = chosen('mo-code'); if (!confirm('Pause payments on ' + cs.join(', ') + '?')) return; t.disabled = true; await onEach(cs, (c) => site(c, 'set-paused', { on: true, text: $('#mo-ptext').value })); return done('mo-msg', 'Paused.'); }
      if (t.id === 'mo-sale') { t.disabled = true; await onEach(chosen('mo-code'), (c) => site(c, 'set-sale', { rupees: $('#mo-srs').value, hours: $('#mo-sh').value, text: $('#mo-stext').value })); return done('mo-msg', 'Site sale set.'); }
      if (t.id === 'mo-endsale') { t.disabled = true; await onEach(chosen('mo-code'), (c) => site(c, 'end-sale', {})); return done('mo-msg', 'Site sale ended.'); }
      if (t.id === 'mo-bizgo') { t.disabled = true; await onEach(chosen('mo-code'), (c) => site(c, 'set-business', { name: $('#mo-biz').value })); return done('mo-msg', 'Business name saved.'); }
    } catch (x) { alert(x.message); t.disabled = false; }
  });

  $('#stu-card').addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const out = $('#st-out');
    try {
      if (t.dataset.rq) {
        if (t.dataset.rq === 'revoke' && !confirm('Remove free access for ' + t.dataset.email + ' on ' + t.dataset.code + '?')) return;
        t.disabled = true; await site(t.dataset.code, t.dataset.rq, { email: t.dataset.email }); if (window.notixReload) await window.notixReload(); return;
      }
      const op = t.dataset.st; if (!op) return;
      const email = $('#st-email').value.trim(); if (!email) { out.textContent = 'Type the student email first.'; return; }
      const cs = chosen('st-code');
      if (op === 'revoke' && !confirm('Remove free access for ' + email + ' on ' + cs.join(', ') + '?')) return;
      const hours = +$('#st-dur').value;
      const args = { email };
      if (op === 'grant' && hours) args.until = Date.now() + hours * 3600e3;
      if (op === 'set-limits') { args.phones = $('#st-ph').value; args.pcs = $('#st-pc').value; }
      t.disabled = true; out.textContent = 'Working…';
      const res = await Promise.allSettled(cs.map((c) => site(c, op, args)));
      out.textContent = res.map((r, i) => {
        if (r.status === 'rejected') return cs[i] + ': ' + r.reason.message;
        if (op !== 'lookup') return cs[i] + ': done';
        const j = r.value;
        return cs[i] + ': ' + (j.paid ? 'PAID' : j.free ? 'free access' + (j.free.until ? ' until ' + day(j.free.until) : '') : 'no Pro') + ' · devices ' + (j.devices ? j.devices.phones + ' phone, ' + j.devices.pcs + ' PC' : '?') + (j.limits && j.limits.custom ? ' (limit ' + j.limits.phones + ' + ' + j.limits.pcs + ')' : '') + (j.payments && j.payments.length ? ' · payments: ' + j.payments.map((p) => (p.via || 'site') + ' ₹' + p.amount).join(', ') : '');
      }).join('\n');
      t.disabled = false;
      if (op !== 'lookup' && window.notixReload) await window.notixReload();
    } catch (x) { out.textContent = x.message; t.disabled = false; }
  });
})();
