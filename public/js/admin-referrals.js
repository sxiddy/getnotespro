/* Notix admin: referrals (G8, api/offers.js ?part=referrals). Rs 3 cash a friend; students ask to withdraw from Rs 15
   with a UPI ID, the owner pays by hand and taps Mark paid. Uses the same key as admin.js (sessionStorage). */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const key = () => { try { return sessionStorage.getItem('st_admin') || ''; } catch (e) { return ''; } };
  const n = (k, one, many) => (k || 0) + ' ' + (k === 1 ? one : many);
  const rs = (p) => '₹' + ((p || 0) / 100);
  const day = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

  async function load() {
    try {
      const r = await fetch('/api/offers?part=referrals', { headers: { 'x-admin-key': key() }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed');
      const t = j.totals || {}, pending = j.pending || [];
      $('#ref-sum').textContent = `${n(t.credited, 'friend', 'friends')} bought · ${pending.length} to pay (${rs(t.pendingCash)})`;
      const top = (j.top || []).slice(0, 20), buyers = (j.buyers || []).slice(0, 50);
      const payTable = pending.length ? `
        <div class="table-wrap mb-3"><table class="table table-vcenter card-table table-sm">
          <thead><tr><th>Asked (IST)</th><th>Student</th><th>Amount</th><th>UPI ID</th><th></th></tr></thead>
          <tbody>${pending.map((w) => `<tr><td>${esc(day(w.at))}</td><td>${esc(w.email)}</td><td><b>${rs(w.amount)}</b></td><td class="font-monospace">${esc(w.upi)}</td><td><button class="btn btn-sm btn-primary" data-paid="${esc(w.id)}">Mark paid</button></td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="text-secondary small">No withdrawals waiting.</p>';
      $('#ref-body').innerHTML = payTable + (top.length ? `
        <p class="text-secondary small mb-2">A friend's first UPI purchase through a student's link earns that student ₹3. They can withdraw from ₹15. Pay the UPI ID above, then tap Mark paid. ${n(t.links, 'student has', 'students have')} opened their link.</p>
        <div class="table-wrap"><table class="table table-vcenter card-table table-sm">
          <thead><tr><th>Top referrers</th><th>Friends who bought</th><th>Old 50% rewards used</th></tr></thead>
          <tbody>${top.map((x) => `<tr><td>${esc(x.email)}</td><td>${x.friends}</td><td>${x.used}</td></tr>`).join('')}</tbody>
        </table></div>
        <div class="table-wrap mt-3"><table class="table table-vcenter card-table table-sm">
          <thead><tr><th>Date (IST)</th><th>Friend who bought</th><th>Credited to</th><th>Payment</th></tr></thead>
          <tbody>${buyers.map((b) => `<tr><td>${esc(day(b.at))}</td><td>${esc(b.buyer)}</td><td>${esc(b.ref)}${b.revoked ? ' <span class="badge bg-secondary-lt">refunded, credit taken back</span>' : ''}</td><td class="font-monospace small">${esc(b.payment)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<p class="text-secondary mb-0">No friend has bought through a link yet. ${n(t.links, 'student has', 'students have')} opened their link.</p>`);
    } catch (e) { $('#ref-body').innerHTML = '<p class="text-danger mb-0">' + esc(e.message) + '</p>'; }
  }
  $('#ref-body').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-paid]');
    if (!b || !confirm('Have you sent this money to the UPI ID? This marks it paid.')) return;
    b.disabled = true;
    const r = await fetch('/api/offers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': key() }, body: JSON.stringify({ action: 'ref-paid', id: b.dataset.paid }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || 'Could not mark it paid.'); b.disabled = false; return; }
    load();
  });
  new MutationObserver(() => { if (!$('#app').hidden) load(); }).observe($('#app'), { attributes: true, attributeFilter: ['hidden'] });
  $('#refresh').addEventListener('click', load);
  if (!$('#app').hidden) load();
})();
