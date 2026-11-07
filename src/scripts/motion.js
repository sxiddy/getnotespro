// Site motion, all through String Tune (pinned 1.2.7). Ported from mockup D.
// Gate: the head script sets html.motion only without prefers-reduced-motion, and html.laptop only on a fine
// pointer with more than 4 cores. Phones get the entrance and the scroll effects; the pointer effects,
// magnetic buttons, card tilt and smooth scroll are laptop-only.
import {
  StringTune, StringModule, StringProgress, StringSplit, StringMagnetic, StringTilt,
} from '@fiddle-digital/string-tune'; // pinned 1.2.7 in package.json
import { SUBJECTS } from './core.js';

const root = document.documentElement;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - t) ** 3;

// ------------------------------------------------------------------ page chrome: runs on every device
// bar morph on scroll, subject-code marquee that speeds up with scroll, the try-it meter, the stat counters
class NotixChrome extends StringModule {
  constructor(ctx) {
    super(ctx);
    this.htmlKey = 'notix-chrome';
    this.bar = $('#bar');
    this.track = $('#marquee');
    this.mx = 0; this.lastScroll = window.scrollY; this.boost = 0;
    this.vOut = $('#try-v'); this.fill = $('#try-fill');
    this.shown = 1.10; this.fx = 1; this.fv = 0;
    this.counters = null;
    this.h1 = $('.hero h1'); this.out = -1;
  }
  onFrame() {
    // scroll speed, from the frame-to-frame change (works in smooth and native mode)
    const y = this.data.scroll.current ?? window.scrollY;
    const v = y - this.lastScroll; this.lastScroll = y;
    this.bar.classList.toggle('is-stuck', y > 24);
    if (this.h1) {
      const out = Math.round(clamp(y / (this.h1.offsetTop + this.h1.offsetHeight)) * 100) / 100;
      if (out !== this.out) { this.out = out; this.h1.style.setProperty('--out', out); }
    }

    // marquee: a slow drift, pushed by scroll speed in the scroll's direction
    this.boost += (Math.min(Math.abs(v), 60) * 0.35 - this.boost) * 0.12;
    if (this.track && this.half) {
      this.mx -= 0.45 + this.boost;
      if (this.mx <= -this.half) this.mx += this.half;
      this.track.style.transform = `translate3d(${this.mx.toFixed(2)}px,0,0)`;
    }

    // try-it: the voltage rolls to its new value, and the bar follows on a spring
    if (this.vOut && this.fill) this.tryIt();

    // hero numbers count up once the entrance starts
    if (this.counters) {
      const t = clamp((performance.now() - this.counters.t0) / 1100);
      for (const c of this.counters.els) c.el.textContent = Math.round(c.to * easeOut(t));
      if (t >= 1) this.counters = null;
    }
  }
  tryIt() {
    const E = window.notixTry ? window.notixTry.E : 1.10;
    this.shown += (E - this.shown) * 0.14;
    if (Math.abs(E - this.shown) < 0.0004) this.shown = E;
    const txt = this.shown.toFixed(2);
    if (this.vOut.textContent !== txt) this.vOut.textContent = txt;
    const target = clamp((E - 1.0) / 0.10, 0, 1.2);
    this.fv = (this.fv + (target - this.fx) * 0.16) * 0.74;
    this.fx += this.fv;
    if (Math.abs(this.fv) > 0.0001 || Math.abs(target - this.fx) > 0.0001) this.fill.style.transform = `scaleX(${clamp(this.fx, 0, 1.2).toFixed(4)})`;
  }
  fillMarquee() {
    if (!this.track) return;
    const base = this.track.innerHTML;
    let guard = 0;
    while (this.track.scrollWidth < window.innerWidth * 2.2 && guard++ < 12) this.track.insertAdjacentHTML('beforeend', base);
    this.track.insertAdjacentHTML('beforeend', this.track.innerHTML); // two equal halves, so the loop is seamless
    this.half = this.track.scrollWidth / 2;
  }
  startCounters() {
    this.counters = { t0: performance.now() + 900, els: $$('[data-count]').map((el) => ({ el, to: Number(el.dataset.count) })) };
    this.counters.els.forEach((c) => { c.el.textContent = '0'; });
  }
}

// ------------------------------------------------------------------ the grid reacts to the pointer (laptop) or the finger (phone)
// lit cells with a fading trail, + marks that turn into × near the pointer, a square cursor that snaps to the
// + marks, the grid moving slower than the page, and a spotlight inside the hovered tile
class NotixGrid extends StringModule {
  constructor(ctx) {
    super(ctx);
    this.htmlKey = 'notix-grid';
    this.full = root.classList.contains('laptop'); // phones: taps light the cells, nothing else
    this.cv = $('.grid-fx'); this.g = this.cv.getContext('2d');
    this.gridBg = $('.grid-bg');
    this.cells = new Map(); this.x = -999; this.y = -999; this.tx = -999; this.ty = -999; this.inside = false;
    this.cur = Object.assign(document.createElement('div'), { className: 'cur' });
    this.cur.setAttribute('aria-hidden', 'true');
    Object.assign(this.cur.style, {
      position: 'fixed', left: 0, top: 0, width: '12px', height: '12px', zIndex: 60, pointerEvents: 'none',
      border: '1.5px solid #7d9cff', borderRadius: '2px', opacity: 0,
      transition: 'opacity .2s, width .2s, height .2s, background-color .2s, border-radius .2s',
    });
    if (this.full) document.body.append(this.cur);
    else addEventListener('pointerdown', (e) => this.tap(e.clientX, e.clientY), { passive: true });
    this.cx = -999; this.cy = -999; this.mode = '';
    this.gy = 0; this.dirty = true;
    this.size();
    addEventListener('resize', () => this.size());
    document.addEventListener('mouseleave', () => { this.inside = false; this.cur.style.opacity = 0; this.dirty = true; });
  }
  size() {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr;
    this.dirty = true;
  }
  tap(x, y) {
    const c = 72, ci = Math.floor(x / c), cj = Math.floor(y / c);
    for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
      const a = clamp(1 - Math.hypot(i * c + c / 2 - x, j * c + c / 2 - y) / 130);
      if (a > 0 && (this.cells.get(`${i},${j}`) || 0) < a) this.cells.set(`${i},${j}`, a);
    }
    this.dirty = true;
  }
  onMouseMove(e) {
    if (!this.full) return;
    this.tx = e.clientX; this.ty = e.clientY;
    if (!this.inside) { this.x = this.tx; this.y = this.ty; this.cx = this.tx; this.cy = this.ty; }
    this.inside = true; this.dirty = true;
    const t = e.target instanceof Element ? e.target : null;
    const tile = t && t.closest('.tile');
    if (tile) { const r = tile.getBoundingClientRect(); tile.style.setProperty('--sx', `${e.clientX - r.left}px`); tile.style.setProperty('--sy', `${e.clientY - r.top}px`); }
    this.mode = !t ? '' : t.closest('input, textarea, .try__slider') ? 'text' : t.closest('a, button, [role=radio], [role=option]') ? 'hot' : '';
  }
  onFrame() {
    if (!this.full) { // phones: only fade the tapped cells
      if (!this.cells.size && !this.dirty) return;
      for (const [k, a] of this.cells) { const n = a * 0.93; n < 0.02 ? this.cells.delete(k) : this.cells.set(k, n); }
      this.draw(0); this.dirty = false;
      return;
    }
    const scroll = this.data.scroll.current ?? window.scrollY;
    const gy = -((scroll * 0.25) % 144);
    if (gy !== this.gy) { this.gy = gy; this.gridBg.style.setProperty('--gy', `${gy.toFixed(1)}px`); this.dirty = true; }

    // pointer, eased
    this.x += (this.tx - this.x) * 0.35; this.y += (this.ty - this.y) * 0.35;
    if (Math.abs(this.tx - this.x) > 0.1 || Math.abs(this.ty - this.y) > 0.1) this.dirty = true;

    // light the cells near the pointer; older ones fade, which leaves a short trail
    // cells are keyed in page-grid space (the grid moves at a quarter of the scroll speed)
    const ws = scroll * 0.25;
    if (this.inside) {
      const c = 72;
      const ci = Math.floor(this.x / c), cj = Math.floor((this.y + ws) / c);
      for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) {
        const d = Math.hypot(i * c + c / 2 - this.x, j * c + c / 2 - ws - this.y);
        const a = clamp(1 - d / 150);
        if (a <= 0) continue;
        const k = `${i},${j}`;
        if ((this.cells.get(k) || 0) < a) this.cells.set(k, a);
      }
    }
    if (this.cells.size) {
      this.dirty = true;
      for (const [k, a] of this.cells) { const n = a * 0.9; n < 0.02 ? this.cells.delete(k) : this.cells.set(k, n); }
    }
    this.cursor();
    if (this.dirty) { this.draw(scroll); this.dirty = false; }
  }
  cursor() {
    if (!this.inside || this.mode === 'text') { this.cur.style.opacity = 0; return; }
    // snap to the nearest + mark when close
    const mx = Math.round(this.tx / 144) * 144, my = Math.round((this.ty - this.gy) / 144) * 144 + this.gy;
    const near = Math.hypot(mx - this.tx, my - this.ty) < 26 && this.mode !== 'hot';
    const tx = near ? mx : this.tx, ty = near ? my : this.ty;
    this.cx += (tx - this.cx) * (near ? 0.3 : 0.45); this.cy += (ty - this.cy) * (near ? 0.3 : 0.45);
    const s = this.mode === 'hot' ? 22 : 12;
    Object.assign(this.cur.style, {
      opacity: 1, width: `${s}px`, height: `${s}px`,
      transform: `translate3d(${(this.cx - s / 2).toFixed(1)}px, ${(this.cy - s / 2).toFixed(1)}px, 0) rotate(${near ? 45 : 0}deg)`,
      backgroundColor: this.mode === 'hot' ? 'rgba(45,91,255,.22)' : 'transparent',
    });
  }
  draw(scroll) {
    const { g, w, h, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const fade = (y) => (y < h * 0.7 ? 1 : 1 - 0.65 * ((y - h * 0.7) / (h * 0.3)));
    // lit cells
    const c = 72, ws = scroll * 0.25;
    for (const [k, a] of this.cells) {
      const [i, j] = k.split(',').map(Number);
      const x = i * c, y = j * c - ws;
      g.fillStyle = `rgba(45,91,255,${(a * 0.09).toFixed(3)})`; g.fillRect(x, y, c, c);
      g.strokeStyle = `rgba(45,91,255,${(a * 0.6).toFixed(3)})`; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, c, c);
    }
    if (!this.full || !root.classList.contains('laptop')) return; // phones (and the no-motion fallback) keep the CSS + marks
    // + marks, turning toward × near the pointer
    const y0 = this.gy - 144;
    for (let y = y0; y < h + 144; y += 144) for (let x = 0; x < w + 144; x += 144) {
      const d = this.inside ? Math.hypot(x - this.x, y - this.y) : 999;
      const t = clamp(1 - d / 200);
      const arm = 6 + t * 3, al = (0.22 + t * 0.7) * fade(y);
      g.save(); g.translate(x, y); g.rotate(t * Math.PI / 4);
      g.strokeStyle = t > 0.02 ? `rgba(125,156,255,${al.toFixed(3)})` : `rgba(255,255,255,${al.toFixed(3)})`;
      g.lineWidth = 1; g.beginPath(); g.moveTo(-arm, 0); g.lineTo(arm, 0); g.moveTo(0, -arm); g.lineTo(0, arm); g.stroke(); g.restore();
    }
  }
}

// ------------------------------------------------------------------ one-off effects (timers and events)
function typeIn(el, text, delay, step = 26) {
  el.textContent = '';
  [...text].forEach((ch, i) => setTimeout(() => { el.textContent += ch; }, delay + i * step));
}
function scramble(chars, start, dur = 520) {
  const glyphs = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#+/';
  chars.forEach((el) => { el.dataset.real = el.textContent; el.style.minWidth = `${el.getBoundingClientRect().width}px`; el.style.textAlign = 'center'; });
  const t0 = performance.now() + start;
  const tick = (now) => {
    const t = (now - t0) / dur;
    if (t < 0) return requestAnimationFrame(tick);
    chars.forEach((el, i) => { el.textContent = t > (i + 1) / (chars.length + 1) + 0.15 ? el.dataset.real : glyphs[(Math.random() * glyphs.length) | 0]; });
    if (t < 1.2) requestAnimationFrame(tick);
    else chars.forEach((el) => { el.textContent = el.dataset.real; el.style.minWidth = ''; });
  };
  requestAnimationFrame(tick);
}
function lastSearchLoop() {
  const box = $('.last__search'), out = $('#last-type');
  if (!box || !out) return;
  // real codes, names and module titles from the subject list, ending on the placeholder
  const words = SUBJECTS.flatMap((s, i) => [i % 2 ? s.name : s.code, s.modules[0] && s.modules[Math.min(1, s.modules.length - 1)][1]])
    .filter((w) => w && w.length <= 22).slice(0, 6).concat('Search subjects…');
  let w = 0, i = 0, dir = 1, hold = 0;
  setInterval(() => {
    if (!box.classList.contains('-inview')) return;
    if (hold > 0) { hold--; return; }
    const word = words[w];
    i += dir;
    out.textContent = word.slice(0, i);
    if (dir > 0 && i >= word.length) { dir = -1; hold = 22; }
    else if (dir < 0 && i <= 0) { dir = 1; w = (w + 1) % words.length; hold = 4; }
  }, 70);
}
function flyToCart({ from, price }) {
  const a = from.getBoundingClientRect(), b = $('.cart').getBoundingClientRect();
  const chip = Object.assign(document.createElement('span'), { className: 'fly', textContent: `+₹${price}` });
  chip.setAttribute('aria-hidden', 'true');
  chip.style.setProperty('--x0', `${a.left + a.width / 2 - 22}px`); chip.style.setProperty('--y0', `${a.top}px`);
  chip.style.setProperty('--x1', `${b.left + b.width / 2 - 22}px`); chip.style.setProperty('--y1', `${b.top + 8}px`);
  document.body.append(chip);
  chip.getBoundingClientRect();
  chip.classList.add('is-go');
  setTimeout(() => { chip.remove(); const c = $('.cart'); c.classList.remove('is-hit'); void c.offsetWidth; c.classList.add('is-hit'); }, 700);
}
function burst({ from }) {
  for (let k = 0; k < 9; k++) {
    const p = Object.assign(document.createElement('span'), { className: 'burst', textContent: '+' });
    p.setAttribute('aria-hidden', 'true');
    const ang = (k / 9) * Math.PI * 2 + Math.random() * 0.4, dist = 34 + Math.random() * 26;
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`); p.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    from.append(p); setTimeout(() => p.remove(), 800);
  }
}

// ------------------------------------------------------------------ start
function start() {
  if (!root.classList.contains('motion')) return; // reduced motion, or the 3 s safety net already fired
  const laptop = root.classList.contains('laptop');
  const st = StringTune.getInstance();
  st.scrollDesktopMode = laptop ? 'smooth' : 'default';
  st.scrollMobileMode = 'default';

  // stagger indexes the CSS reads
  $$('.hero__copy > *').forEach((el, i) => el.style.setProperty('--d', i));
  $$('.stats > div').forEach((el, i) => el.style.setProperty('--d', i + 4));
  $$('.steps li').forEach((el, i) => el.style.setProperty('--i', i));

  st.use(StringProgress);
  st.use(StringSplit);
  st.use(NotixChrome);
  st.use(NotixGrid);
  if (laptop) {
    st.use(StringMagnetic);
    st.use(StringTilt);
    window.notixScrollTo = (t) => st.scrollTo(typeof t === 'number' ? { position: t } : { element: t, offset: -90 });
  }
  st.start(60);
  root.classList.add('st-on');

  const chrome = st.reuse(NotixChrome);
  chrome.fillMarquee();

  // entrance, once the fonts are in (so the split letters are measured right), at most 1.2 s wait
  const eyebrow = $('#eyebrow'), text = eyebrow ? eyebrow.textContent : '';
  // runs once, on the next frame or after 120 ms, whichever comes first (a paused tab never paints a frame)
  let entered = false;
  const enter = () => {
    if (entered || !root.classList.contains('motion')) return; // the head safety net already showed the page
    entered = true;
    root.classList.add('is-in');
    if (eyebrow) typeIn(eyebrow, text, 250);
    chrome.startCounters();
    const free = $$('#free .-s-char');
    if (free.length) scramble(free, 1250);
  };
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]).then(() => {
    requestAnimationFrame(enter); setTimeout(enter, 120);
  });

  lastSearchLoop();
  document.addEventListener('notix:add', (e) => flyToCart(e.detail));
  document.addEventListener('notix:right', (e) => burst(e.detail));
}

start();
