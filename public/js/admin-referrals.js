/* Notix admin: referrals (G8, api/offers.js ?part=referrals). Read-only. Uses the same key as admin.js (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const n = (k, one, many) => (k || 0) + ' ' + (k === 1 ? one : many);
  const day = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

  async function load() {
    try {
      const r = await fetch('/api/offers?part=referrals', { headers: { 'x-admin-key': key() }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      const t = j.totals || {};
      $('#ref-sum').textContent = `${n(t.credited, 'friend', 'friends')} bought · ${n(t.used, 'reward', 'rewards')} used · ${t.left || 0} waiting`;
      const top = (j.top || []).slice(0, 20), buyers = (j.buyers || []).slice(0, 50);
      $('#ref-body').innerHTML = (top.length ? `
        <p class="text-secondary small mb-2">A friend's first UPI purchase through a student's link earns that student one 50% off reward (one purchase, whole cart). ${n(t.links, 'student has', 'students have')} opened their link.</p>
        <div class="table-wrap"><table class="table table-vcenter card-table table-sm">
          <thead><tr><th>Top referrers</th><th>Friends who bought</th><th>Rewards used</th><th>Waiting</th></tr></thead>
          <tbody>${top.map((x) => `<tr><td>${esc(x.email)}</td><td>${x.friends}</td><td>${x.used}</td><td>${x.rewards}</td></tr>`).join('')}</tbody>
        </table></div>
        <div class="table-wrap mt-3"><table class="table table-vcenter card-table table-sm">
          <thead><tr><th>Date (IST)</th><th>Friend who bought</th><th>Credited to</th><th>Payment</th></tr></thead>
          <tbody>${buyers.map((b) => `<tr><td>${esc(day(b.at))}</td><td>${esc(b.buyer)}</td><td>${esc(b.ref)}${b.revoked ? ' <span class="badge bg-secondary-lt">refunded, reward taken back</span>' : ''}</td><td class="font-monospace small">${esc(b.payment)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="text-secondary mb-0">No friend has bought through a link yet. ${n(t.links, 'student has', 'students have')} opened their link.</p>`);
    } catch (e) { $('#ref-body').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
