// Reviews on /<code> (G3): approved reviews for everyone; Pro owners of this subject get a form. A new or edited review
// waits for the owner's approval in admin before it shows.
import { $, esc } from './core.js';

const box = $('#reviews');
if (box) {
  const code = box.dataset.code, form = $('#rev-form'), msg = $('#rev-msg');
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  async function load() {
    const [r, s] = await Promise.all([
      fetch('/api/community?part=reviews&code=' + code, { cache: 'no-store' }).then((x) => x.json()).catch(() => ({ items: [] })),
      fetch('/api/session', { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
    ]);
    const owns = !!s?.products?.find((p) => p.code === code)?.owned;
    $('#rev-list').innerHTML = (r.items || []).map((x) => `<li class="rev-item"><p class="rev-item__s" aria-label="${x.stars} of 5 stars">${stars(x.stars)}</p><p class="rev-item__t">${esc(x.text)}</p><p class="rev-item__n mono">${esc(x.name)}</p></li>`).join('');
    $('#rev-avg').textContent = r.count ? `· ${r.avg} of 5 from ${r.count}` : '';
    form.hidden = !owns;
    box.hidden = !owns && !r.count;
    if (owns && r.mine) {
      const m = r.mine;
      form.querySelector(`input[value="${m.stars}"]`).checked = true;
      $('#rev-text').value = m.text; $('#rev-name').value = m.name || '';
      $('#rev-state').textContent = m.ok ? 'Yours is live. Editing sends it for a fresh check.' : 'Yours is waiting for a check.';
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = +(form.querySelector('input[name=stars]:checked')?.value || 0), btn = e.submitter || form.querySelector('button');
    if (!n) { msg.textContent = 'Pick 1 to 5 stars.'; form.querySelector('input[name=stars]').focus(); return; }
    btn.disabled = true; msg.textContent = 'Sending…';
    try {
      const r = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review', code, stars: n, text: $('#rev-text').value, name: $('#rev-name').value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send. Try again.');
      msg.textContent = 'Thanks! It shows here once it’s checked.'; $('#rev-state').textContent = 'Yours is waiting for a check.';
    } catch (x) { msg.textContent = x.message; }
    btn.disabled = false;
  });

  load();
}
