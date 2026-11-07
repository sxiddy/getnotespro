// Home only: filtering the build-time subject tiles, and the Daniell-cell try-it card.
import { $, $$, SUBJECTS, match, toggleCart, emit, motionOn } from './core.js';

// ---------------------------------------------------------------- subject tiles: filter in place
const SHOW_MODS = 2;
const tiles = $$('#tiles .tile[data-code]');
function filterTiles(q = '') {
  let shown = 0;
  for (const tile of tiles) {
    const s = SUBJECTS.find((x) => x.code === tile.dataset.code);
    const m = s ? match(s, q) : { ok: true, mods: [] };
    tile.hidden = !m.ok;
    if (!m.ok) continue;
    tile.style.setProperty('--i', shown++);
    // show the matching modules first (or the first two), and say how many more there are
    const hits = new Set(m.mods);
    const mods = $$('.tile__mods li[data-n]', tile);
    const pick = new Set((hits.size ? mods.filter((li) => hits.has(Number(li.dataset.n))) : mods).slice(0, SHOW_MODS));
    mods.forEach((li) => { li.hidden = !pick.has(li); li.classList.toggle('is-hit', hits.has(Number(li.dataset.n))); });
    const more = $('.tile__more', tile), rest = mods.length - pick.size;
    if (more) { more.hidden = rest <= 0; more.textContent = `+ ${rest} more module${rest === 1 ? '' : 's'}`; }
  }
  const req = $('#tiles .tile--req');
  if (req) { req.hidden = shown === 0; req.style.setProperty('--i', shown); }
  $('#tiles-empty').hidden = shown > 0;
  $('#tiles-q').textContent = q;
  $('#count').textContent = `${shown} of ${SUBJECTS.length} subjects`;
}
$('#tiles').addEventListener('click', (e) => {
  const b = e.target.closest('.tile__add'); if (b) toggleCart(b.dataset.code, b);
});
$('#filter').addEventListener('input', (e) => filterTiles(e.target.value));

// ---------------------------------------------------------------- try-it: Nernst for a Daniell cell
// E = 1.10 − 0.02955·log10([Zn²⁺]/[Cu²⁺]) with [Zn²⁺] = 1 M, so 0.10 M Cu²⁺ gives 1.07 V
const range = $('#try-range'), vOut = $('#try-v'), cOut = $('#try-c'), fill = $('#try-fill'), note = $('#try-note'), tryCard = $('#try');
let answer = null, moved = false, judged = false;
window.notixTry = { E: 1.10 };
function draw() {
  const c = 10 ** Number(range.value);
  const E = 1.10 - 0.02955 * Math.log10(1 / c);
  window.notixTry.E = E;
  cOut.textContent = c < 0.01 ? c.toFixed(3) : c.toFixed(2);
  range.style.setProperty('--fill', `${((Number(range.value) + 3) / 3) * 100}%`);
  if (!motionOn()) { vOut.textContent = E.toFixed(2); fill.style.transform = `scaleX(${((E - 1.0) / 0.10).toFixed(3)})`; }
}
function verdict() {
  if (!answer || !moved || judged) return;
  judged = true;
  const right = answer === 'fall';
  $$('.try__opts button').forEach((b) => {
    b.classList.toggle('is-right', b.dataset.a === 'fall');
    b.classList.toggle('is-wrong', b.dataset.a === answer && !right);
  });
  note.textContent = right
    ? 'Right. Less Cu²⁺ means a smaller driving force, so E drops: 1.07 V at 0.10 M.'
    : 'Not quite. Watch the reading: less Cu²⁺ lowers E, to 1.07 V at 0.10 M.';
  $('#try-cta').hidden = false;
  if (right) { tryCard.classList.remove('is-right'); void tryCard.offsetWidth; tryCard.classList.add('is-right'); emit('notix:right', { from: $('.try__opts [data-a="fall"]') }); }
}
$('.try__opts').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  answer = b.dataset.a; judged = false;
  $$('.try__opts button').forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.classList.remove('is-right', 'is-wrong'); });
  note.textContent = moved ? '' : 'Now drag the slider and watch the voltage.';
  verdict();
});
range.addEventListener('input', () => { moved = true; draw(); verdict(); });
$('.try__add').addEventListener('click', (e) => toggleCart(e.currentTarget.dataset.code, e.currentTarget));

draw();
