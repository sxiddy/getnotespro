// /requests (F2/N3 + F1): list, ask, upvote, Notify me. A 401 opens the sign-in window.
import { $, esc, say, openSignIn } from './core.js';

const list = $('#req-list'), soon = $('#soon-list'), empty = $('#req-empty'), msg = $('#req-msg');
let mine = { votes: [], notify: [] };

async function post(data) {
  const r = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { openSignIn(); throw Object.assign(new Error(j.error || 'Sign in first.'), { quiet: true }); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), j);
  return j;
}

const row = (x) => {
  const isSoon = x.status === 'soon', on = isSoon ? mine.notify.includes(x.id) : mine.votes.includes(x.id);
  const btn = isSoon
    ? `<button class="req-btn${on ? ' is-on' : ''}" type="button" data-notify="${esc(x.id)}" aria-pressed="${on}">${on ? 'We’ll tell you' : 'Notify me'}</button>`
    : `<button class="req-btn req-btn--vote${on ? ' is-on' : ''}" type="button" data-vote="${esc(x.id)}" aria-pressed="${on}" aria-label="Upvote ${esc(x.name)}, ${x.votes} votes"><span aria-hidden="true">▲</span> <b>${x.votes}</b></button>`;
  return `<li class="req-item" id="r-${esc(x.id)}"><div class="req-item__t"><b>${esc(x.name)}</b>${x.note ? `<span>${esc(x.note)}</span>` : ''}${isSoon ? `<span class="mono">${x.notify} waiting</span>` : ''}</div>${btn}</li>`;
};

async function load() {
  try {
    const j = await fetch('/api/community?part=requests', { cache: 'no-store' }).then((r) => r.json());
    mine = j.mine || { votes: [], notify: [] };
    const s = j.items.filter((x) => x.status === 'soon'), o = j.items.filter((x) => x.status !== 'soon');
    soon.innerHTML = s.map(row).join(''); soon.hidden = $('#soon-h').hidden = !s.length;
    list.innerHTML = o.map(row).join(''); empty.hidden = o.length > 0;
  } catch { list.innerHTML = '<li class="upds__empty">Couldn’t load the requests. Check your connection.</li>'; }
  list.removeAttribute('aria-busy');
}

$('#req-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#req-name').value.trim(), btn = e.submitter || $('#req-form button');
  if (name.length < 3) { msg.textContent = 'Write the subject name (3 letters or more).'; $('#req-name').focus(); return; }
  btn.disabled = true; msg.textContent = 'Sending…';
  try {
    const j = await post({ action: 'req-add', name });
    $('#req-name').value = ''; msg.textContent = 'Added, with your vote.';
    await load(); document.getElementById('r-' + j.item.id)?.scrollIntoView({ block: 'nearest' });
  } catch (x) {
    msg.textContent = x.quiet ? '' : x.message;
    if (x.id) { await load(); const li = document.getElementById('r-' + x.id); li?.scrollIntoView({ block: 'nearest' }); li?.querySelector('button')?.focus(); }
  }
  btn.disabled = false;
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-vote],[data-notify]'); if (!b) return;
  const vote = 'vote' in b.dataset, id = vote ? b.dataset.vote : b.dataset.notify, on = b.getAttribute('aria-pressed') !== 'true';
  b.disabled = true;
  try {
    await post({ action: vote ? 'req-vote' : 'req-notify', id, on });
    if (!vote && on) say('Done. You’ll hear when it’s ready.');
    await load();
    document.querySelector(`[data-${vote ? 'vote' : 'notify'}="${id}"]`)?.focus();
  } catch (x) { if (!x.quiet) say(x.message, { warn: true }); b.disabled = false; }
});

load();
