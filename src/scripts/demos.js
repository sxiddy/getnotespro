/* Pro tool demos: battery (BACHY105), motor (BAEEE101), grammar (BAENG101).
   Ported from the old store's demos.js. Each [data-demo] element gets a canvas, its controls and a live readout. */
const COL = { bg: '#0f1114', panel: '#16191e', line: 'rgba(255,255,255,.13)', text: '#f2f3f5', dim: '#878d97', fill: '#2d5bff', blue: '#7d9cff', good: '#86d4a9', bad: '#ff8a8a' };
const SANS = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", monospace';
const TAU = Math.PI * 2;

const DEMOS = {
  battery: {
    title: 'Phone battery',
    ctrl: [
      { k: 'mode', label: 'Phone is', type: 'toggle', opts: [['use', 'In use'], ['chg', 'Charging']], val: 'use' },
      { k: 'lvl', label: 'Battery level', min: 0, max: 100, step: 1, val: 70, fmt: (v) => v + '%' },
    ],
    read: (v) => v.mode === 'chg'
      ? `<b>Charging:</b> the charger pushes electrons round the outside, and lithium ions travel through the electrolyte into the graphite. At <b>${v.lvl}%</b> most of the lithium is stored there.`
      : `<b>In use:</b> lithium ions move from the graphite to the cathode and the freed electrons run through your phone. At <b>${v.lvl}%</b>, the lithium that is left in the graphite is what powers it.`,
    draw(g, w, h, t, v) {
      const N = 20, nA = Math.round(v.lvl / 100 * N), chg = v.mode === 'chg', flow = !((chg && v.lvl >= 100) || (!chg && v.lvl <= 0));
      const ax0 = w * 0.08, ax1 = w * 0.34, cx0 = w * 0.66, cx1 = w * 0.92, y0 = h * 0.44, y1 = h * 0.84, wy = h * 0.2;
      g.fillStyle = 'rgba(125,156,255,.08)'; g.fillRect(ax1, y0, cx0 - ax1, y1 - y0);
      g.fillStyle = 'rgba(255,255,255,.06)'; g.strokeStyle = COL.line; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(ax0, y0, ax1 - ax0, y1 - y0, 8); g.fill(); g.stroke();
      g.fillStyle = 'rgba(45,91,255,.18)'; g.beginPath(); g.roundRect(cx0, y0, cx1 - cx0, y1 - y0, 8); g.fill(); g.stroke();
      g.font = '600 13px ' + SANS; g.textAlign = 'center'; g.fillStyle = COL.text;
      g.fillText('Graphite (−)', (ax0 + ax1) / 2, y1 + 20); g.fillText('Cathode (+)', (cx0 + cx1) / 2, y1 + 20);
      g.fillStyle = COL.dim; g.font = '500 12px ' + MONO; g.fillText('electrolyte', (ax1 + cx0) / 2, y1 + 20);
      // ions stored in each electrode
      const slots = (x0, x1, i, n) => { const cols = 4, r = Math.floor(i / cols), c = i % cols; return [x0 + (x1 - x0) * (0.18 + 0.64 * c / (cols - 1)), y0 + (y1 - y0) * (0.2 + 0.6 * r / Math.ceil(n / cols - 0.5 || 1)) * 0.95]; };
      g.fillStyle = COL.good;
      for (let i = 0; i < N; i++) {
        const inA = i < nA, [x, y] = inA ? slots(ax0, ax1, i, N) : slots(cx0, cx1, i - nA, N);
        g.beginPath(); g.arc(x + Math.sin(t * 2 + i) * 2, y, 5, 0, TAU); g.fill();
      }
      // ions travelling through the electrolyte
      if (flow) for (let i = 0; i < 5; i++) {
        let p = (t * 0.32 + i / 5) % 1; if (chg) p = 1 - p;
        const x = ax1 + (cx0 - ax1) * p, y = y0 + (y1 - y0) * (0.2 + 0.6 * ((i * 0.37) % 1));
        g.fillStyle = COL.good; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
      g.fillStyle = COL.text; g.font = '700 12px ' + MONO; g.fillText('Li⁺', ax1 + (cx0 - ax1) / 2, y0 + 16);
      // outside circuit
      const ax = (ax0 + ax1) / 2, cx = (cx0 + cx1) / 2;
      g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, y0); g.lineTo(ax, wy); g.lineTo(cx, wy); g.lineTo(cx, y0); g.stroke();
      const bw = w * 0.2, bx = w / 2 - bw / 2;
      g.fillStyle = COL.bg; g.strokeStyle = chg ? COL.good : COL.blue; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, wy - 18, bw, 36, 10); g.fill(); g.stroke();
      g.fillStyle = chg ? COL.good : COL.blue; g.font = '600 13px ' + SANS; g.fillText(chg ? 'Charger' : 'Phone', w / 2, wy + 5);
      if (flow) {
        g.fillStyle = COL.blue;
        for (let i = 0; i < 8; i++) {
          let p = (t * 0.3 + i / 8) % 1; if (chg) p = 1 - p;
          const tot = (y0 - wy) * 2 + (cx - ax), d = p * tot; let x, y;
          if (d < y0 - wy) { x = ax; y = y0 - d; } else if (d < y0 - wy + (cx - ax)) { x = ax + (d - (y0 - wy)); y = wy; } else { x = cx; y = wy + (d - (y0 - wy) - (cx - ax)); }
          if (Math.abs(x - w / 2) < bw / 2 && y === wy) continue;
          g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill();
        }
      }
      g.fillStyle = COL.blue; g.font = '600 12px ' + MONO; g.fillText('e⁻', ax + 14, wy - 8);
      g.fillStyle = COL.text; g.font = '700 22px ' + SANS; g.fillText(v.lvl + '%', w / 2, (y0 + y1) / 2 + 6);
      g.textAlign = 'start';
    },
  },
  motor: {
    title: 'Ceiling fan motor',
    ctrl: [
      { k: 'poles', label: 'Poles', min: 2, max: 6, step: 2, val: 4, fmt: (v) => v },
      { k: 'slip', label: 'Slip', min: 0, max: 20, step: 1, val: 5, fmt: (v) => v + '%' },
    ],
    read: (v) => { const ns = 120 * 50 / v.poles; return `Field speed Ns = 120f/P = <b>${ns} rpm</b> · fan <b>${Math.round(ns * (1 - v.slip / 100))} rpm</b> · rotor frequency s·f = <b>${(v.slip / 100 * 50).toFixed(1)} Hz</b>`; },
    draw(g, w, h, t, v) {
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44, ns = 120 * 50 / v.poles, wf = TAU * 0.28 * (ns / 1500), a = wf * t, ar = wf * (1 - v.slip / 100) * t;
      g.fillStyle = COL.panel; g.strokeStyle = COL.line; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill(); g.stroke();
      for (let k = 0; k < 6; k++) {
        const p = k % 3, ang = (k * 60) * Math.PI / 180, sign = k < 3 ? 1 : -1;
        const i = Math.sin(a - p * TAU / 3) * sign;
        const x = cx + R * 0.82 * Math.cos(ang), y = cy - R * 0.82 * Math.sin(ang);
        g.fillStyle = [COL.blue, COL.text, COL.fill][p]; g.globalAlpha = 0.18 + 0.82 * Math.abs(i); g.beginPath(); g.arc(x, y, R * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
      g.strokeStyle = COL.good; g.fillStyle = COL.good; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)); g.lineTo(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a)); g.stroke();
      g.beginPath(); g.arc(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a), 6, 0, TAU); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(-ar);
      g.fillStyle = 'rgba(242,243,245,.85)'; for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * TAU / 3); g.beginPath(); g.roundRect(R * 0.05, -R * 0.1, R * 0.4, R * 0.2, R * 0.1); g.fill(); g.restore(); }
      g.fillStyle = COL.bg; g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill(); g.stroke(); g.restore();
      g.font = '600 12px ' + MONO; g.fillStyle = COL.good; g.fillText('field', 12, 18); g.fillStyle = COL.text; g.fillText('fan', 12, 34);
    },
  },
  grammar: {
    title: 'Fix the sentence',
    ctrl: [{ k: 'fix', label: 'Fixes applied', min: 0, max: 3, step: 1, val: 0, fmt: (v) => v + ' of 3' }],
    read: (v) => ['<b>Three mistakes.</b> Can you spot them? Slide to fix them one by one.', '<b>Fixed 1:</b> "The data show", because data is plural in formal writing.', '<b>Fixed 2:</b> "were collected", passive voice for a method.', '<b>Fixed 3:</b> "which", because a comma needs a non-defining clause. Clean and formal now.'][v.fix],
    draw(g, w, h, t, v) {
      const lines = [['The data ', 'shows', ' that the samples ', 'was', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'was', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'were', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'were', ' collected, ', 'which', ' were tested twice.']][v.fix];
      const bad = [v.fix < 1, v.fix < 2, v.fix < 3], fs = Math.max(14, Math.min(w / 24, 20));
      g.font = '600 ' + fs + 'px ' + SANS; g.textBaseline = 'middle';
      let x = 18, y = h * 0.34; const lh = fs * 1.9;
      lines.forEach((seg, i) => {
        const isW = i % 2 === 1, isBad = isW && bad[(i - 1) / 2];
        seg.split(/(\s+)/).forEach((tok) => {
          if (!tok) return;
          const tw = g.measureText(tok).width;
          if (x + tw > w - 18 && tok.trim()) { x = 18; y += lh; }
          if (isW) { g.fillStyle = isBad ? 'rgba(255,138,138,.22)' : 'rgba(134,212,169,.2)'; g.beginPath(); g.roundRect(x - 3, y - fs * 0.8, tw + 6, fs * 1.6, 6); g.fill(); }
          g.fillStyle = isW ? (isBad ? COL.bad : COL.good) : COL.text; g.fillText(tok, x, y); x += tw;
        });
      });
      g.fillStyle = COL.dim; g.font = '600 12px ' + MONO; g.fillText(v.fix === 3 ? 'ready to submit' : 'needs ' + (3 - v.fix) + ' more fix' + (3 - v.fix > 1 ? 'es' : ''), 18, h - 18);
      g.textBaseline = 'alphabetic';
    },
  },
};

const reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const STATIC_T = 1.2;
let uid = 0;

function mount(el) {
  const d = DEMOS[el.dataset.demo];
  if (!d || el.dataset.ready) return;
  el.dataset.ready = '1';
  const id = 'demo' + (++uid);
  const vals = {};
  d.ctrl.forEach((c) => { vals[c.k] = c.val; });

  el.classList.add('demo');
  el.innerHTML = '<canvas class="demo__cv" role="img"></canvas><div class="demo__ctrls"></div><p class="demo__read" aria-live="polite"></p>';
  const cv = el.querySelector('canvas'), ctrls = el.querySelector('.demo__ctrls'), read = el.querySelector('.demo__read');
  cv.setAttribute('aria-label', d.title + ' animation. Use the controls below to change it.');
  const g = cv.getContext('2d');
  let W = 0, H = 0, visible = false, raf = 0;
  const t0 = performance.now() - STATIC_T * 1000;

  const paint = (sec) => {
    if (!W) return;
    g.clearRect(0, 0, W, H);
    try { d.draw.call(d, g, W, H, sec, vals); } catch (e) { /* keep the page alive */ }
  };
  const readout = () => { read.innerHTML = d.read(vals); };
  const frame = (now) => { raf = 0; if (!visible || reduceQ.matches) return; paint((now - t0) / 1000); raf = requestAnimationFrame(frame); };
  const sync = () => {
    if (visible && !reduceQ.matches) { if (!raf) raf = requestAnimationFrame(frame); }
    else { if (raf) { cancelAnimationFrame(raf); raf = 0; } paint(STATIC_T); }
  };
  const size = () => {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(raf ? (performance.now() - t0) / 1000 : STATIC_T);
  };
  const changed = () => { readout(); if (!raf) paint(STATIC_T); };

  d.ctrl.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'demo__row';
    if (c.type === 'toggle') {
      row.setAttribute('role', 'group'); row.setAttribute('aria-label', c.label);
      row.innerHTML = `<span class="demo__lbl">${c.label}</span><div class="demo__tog">${c.opts.map((o) => `<button type="button" data-k="${c.k}" data-v="${o[0]}" aria-pressed="${o[0] === c.val}">${o[1]}</button>`).join('')}</div>`;
    } else {
      const pct = (c.val - c.min) / (c.max - c.min) * 100;
      row.innerHTML = `<label class="demo__lbl" for="${id}-${c.k}">${c.label}</label><output class="demo__out" for="${id}-${c.k}">${c.fmt(c.val)}</output><input id="${id}-${c.k}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.val}" data-k="${c.k}" style="--p:${pct}%">`;
    }
    ctrls.appendChild(row);
  });
  el.addEventListener('input', (e) => {
    const r = e.target.closest('input[type=range]'); if (!r) return;
    const c = d.ctrl.find((x) => x.k === r.dataset.k);
    vals[c.k] = +r.value;
    r.parentNode.querySelector('output').textContent = c.fmt(+r.value);
    r.style.setProperty('--p', (r.value - r.min) / (r.max - r.min) * 100 + '%');
    changed();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.demo__tog button'); if (!b) return;
    vals[b.dataset.k] = b.dataset.v;
    b.parentNode.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    changed();
  });

  readout();
  if ('ResizeObserver' in window) new ResizeObserver(size).observe(cv);
  size();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; sync(); }, { rootMargin: '80px' }).observe(el);
  }
  if (reduceQ.addEventListener) reduceQ.addEventListener('change', sync);
}

document.querySelectorAll('[data-demo]').forEach(mount);
