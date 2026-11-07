// Announcements from api/community.js, fetched once per page. Used for the "Updated" badges (G5) and /updates.
export const FRESH_DAYS = 14;
let p = null;
export const getUpdates = () => (p ||= fetch('/api/community?part=ann')
  .then((r) => (r.ok ? r.json() : { items: [] }))
  .then((j) => (Array.isArray(j.items) ? j.items : []))
  .catch(() => []));

export const dateText = (ms) => new Date(ms).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

// fill every [data-upd="CODE"] placeholder whose subject was named in an update in the last FRESH_DAYS days
export async function markUpdated() {
  const slots = [...document.querySelectorAll('[data-upd]')];
  if (!slots.length) return;
  const since = Date.now() - FRESH_DAYS * 864e5, latest = {};
  for (const u of await getUpdates()) {
    if (u.at < since) continue;
    for (const c of u.codes || []) if (!latest[c] || latest[c].at < u.at) latest[c] = u;
  }
  for (const el of slots) {
    const u = latest[el.dataset.upd];
    if (!u) continue;
    el.href = '/updates#u-' + u.id;
    el.title = u.title + ' (' + dateText(u.at) + ')';
    el.setAttribute('aria-label', 'Updated ' + dateText(u.at) + ': ' + u.title);
    el.hidden = false;
  }
}
