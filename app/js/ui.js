/* Notes Pro store: page polish (menu, progress bar, scroll spy, hero demo, live Pro previews, card glow, FAQ, celebration). */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COL = { e: '#7cc0ff', cat: '#ffb56b', an: '#c7a4ff', good: '#86d4a9', bad: '#f08c8c', line: '#3a3a41', dim: '#80808a', text: '#cfcfd6', bg: '#151517', panel: '#1b1b1e' };
  window.stExp = new Set();

  // ------------------------------------------------------------ header: menu, progress, scroll spy
  const mb = $('#menu-btn'), mn = $('#mnav');
  if (mb && mn) {
    mb.addEventListener('click', () => { const on = mn.hidden; mn.hidden = !on; mb.setAttribute('aria-expanded', String(on)); mb.classList.toggle('open', on); });
    mn.addEventListener('click', (e) => { if (e.target.closest('a')) { mn.hidden = true; mb.setAttribute('aria-expanded', 'false'); mb.classList.remove('open'); } });
  }
  const prog = $('#progress');
  let ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      if (prog) prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, h.scrollTop / max) : 0) + ')';
      $('#top').classList.toggle('scrolled', h.scrollTop > 8);
    });
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if ('IntersectionObserver' in window) {
    const links = {}; $$('.top-link').forEach((a) => { links[a.getAttribute('href').slice(1)] = a; });
    const spy = new IntersectionObserver((es) => es.forEach((e) => { const a = links[e.target.id]; if (a) a.classList.toggle('active', e.isIntersecting); }), { rootMargin: '-35% 0px -55% 0px' });
    Object.keys(links).forEach((id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
  }

  // ------------------------------------------------------------ sticky "pick your subject" bar on phones
  const st = $('#sticky');
  if (st && 'IntersectionObserver' in window) {
    const seen = { hero: true, subjects: false, foot: false }; // hero visible at the start
    const upd = () => { st.hidden = seen.hero || seen.subjects || seen.foot; };
    const io = new IntersectionObserver((es) => { es.forEach((e) => { seen[e.target.dataset.k] = e.isIntersecting; }); upd(); });
    [['.hero', 'hero'], ['#subjects', 'subjects'], ['.foot', 'foot']].forEach(([s, k]) => { const el = $(s); if (el) { el.dataset.k = k; io.observe(el); } });
    upd();
  }

  // ------------------------------------------------------------ count-up numbers
  const nums = $$('[data-count]');
  function countUp(el) {
    const to = +el.dataset.count; if (reduce || !to) return;
    const t0 = performance.now(), d = 900;
    (function step(now) { const p = Math.min(1, (now - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); })(t0);
  }
  if ('IntersectionObserver' in window && nums.length) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
    nums.forEach((n) => io.observe(n));
  }

  // ------------------------------------------------------------ FAQ: smooth open and close
  $$('.faq details').forEach((d) => {
    const s = $('summary', d), a = $('.ans', d);
    if (!s || !a || !a.animate) return;
    s.addEventListener('click', (e) => {
      if (reduce) return;
      e.preventDefault();
      if (d.open) { const h = a.offsetHeight; a.animate({ height: [h + 'px', '0px'], opacity: [1, 0] }, { duration: 200, easing: 'ease' }).onfinish = () => { d.open = false; }; }
      else { d.open = true; const h = a.offsetHeight; a.animate({ height: ['0px', h + 'px'], opacity: [0, 1] }, { duration: 260, easing: 'ease' }); }
    });
  });

  // ------------------------------------------------------------ hero demo: a real Nernst question
  (function () {
    const r = $('#mock-r'); if (!r) return;
    const c = $('#mock-c'), e = $('#mock-e'), fb = $('#mock-fb'), opts = $('#mock-opts'), mock = $('#mock');
    let picked = '';
    const fmt = (v) => { const x = Math.pow(10, v); return (x >= 0.1 ? x.toFixed(2) : x.toFixed(3)) + ' M'; };
    function upd() {
      const v = +r.value; c.textContent = fmt(v); e.textContent = (1.10 + 0.0296 * v).toFixed(2) + ' V';
      r.style.setProperty('--p', ((v + 3) / 3 * 100) + '%');
      if (!picked) fb.textContent = v < -1 ? 'See the voltage drop as [Cu²⁺] falls? Now pick your answer.' : 'Pick an answer, then drag the slider to check it.';
    }
    r.addEventListener('input', () => { mock.classList.add('touched'); upd(); });
    opts.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ans]'); if (!b) return;
      picked = b.dataset.ans; mock.classList.add('touched');
      $$('button', opts).forEach((x) => x.classList.remove('ok', 'no'));
      const good = picked === 'down';
      b.classList.add(good ? 'ok' : 'no');
      if (!good) $('[data-ans="down"]', opts).classList.add('ok');
      fb.textContent = good ? 'Correct. Nernst: E = E° + 0.0296 log[Cu²⁺], so lower [Cu²⁺] means a lower E. Drag the slider to see it.' : 'Not quite. By Nernst, E = E° + 0.0296 log[Cu²⁺], so E falls. Drag the slider to see it.';
      fb.className = 'mock-fb ' + (good ? 'good' : 'bad');
    });
    upd();
  })();

  // ------------------------------------------------------------ live Pro previews (canvas)
  const TAU = Math.PI * 2;
  const DEMOS = [
    {
      id: 'wave', title: 'AC wave and phasor', code: 'BAEEE101', subject: 'Basic Engineering', col: COL.e,
      blurb: 'Change the phase and watch the current fall behind the voltage while the phasors turn.',
      ctrl: [{ k: 'f', label: 'Frequency', min: 1, max: 5, step: 0.5, val: 2, fmt: (v) => v.toFixed(1) + ' Hz (slowed down)' }, { k: 'phi', label: 'Phase lag φ', min: 0, max: 180, step: 5, val: 50, fmt: (v) => v + '°' }],
      read: (v) => `Current lags voltage by <b>${v.phi}°</b> · power factor cos φ = <b>${Math.cos(v.phi * Math.PI / 180).toFixed(2)}</b>${v.phi > 90 ? ' (negative: power flows back)' : ''}`,
      draw(g, w, h, t, v) {
        const sp = w * 0.62, y0 = h / 2, A = h * 0.3, th = TAU * v.f * 0.12 * t, ph = v.phi * Math.PI / 180;
        g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath(); g.moveTo(10, y0); g.lineTo(sp - 6, y0); g.moveTo(10, y0 - A * 1.15); g.lineTo(10, y0 + A * 1.15); g.stroke();
        const wave = (col, off) => { g.strokeStyle = col; g.lineWidth = 2.4; g.beginPath(); for (let x = 10; x <= sp - 6; x += 2) { const u = (x - 10) / (sp - 16) * 3 * TAU; const y = y0 - A * Math.sin(u - th - off); x === 10 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
        wave(COL.e, 0); wave(COL.cat, ph);
        const cx = sp + (w - sp) / 2, r = Math.min(w - sp, h) * 0.36;
        g.strokeStyle = COL.line; g.beginPath(); g.arc(cx, y0, r, 0, TAU); g.moveTo(cx - r - 6, y0); g.lineTo(cx + r + 6, y0); g.moveTo(cx, y0 - r - 6); g.lineTo(cx, y0 + r + 6); g.stroke();
        const arrow = (a, col) => { const x = cx + r * Math.cos(a), y = y0 - r * Math.sin(a); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx, y0); g.lineTo(x, y); g.stroke(); g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill(); };
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, y0, r * 0.3, th - ph, th, false); g.stroke();
        arrow(th - ph, COL.cat); arrow(th, COL.e);
        g.font = '600 12px "JetBrains Mono", monospace'; g.fillStyle = COL.e; g.fillText('V', 14, 18); g.fillStyle = COL.cat; g.fillText('I', 32, 18);
      },
    },
    {
      id: 'motor', title: 'Induction motor', code: 'BAEEE101', subject: 'Basic Engineering', col: COL.cat,
      blurb: 'Three coils make a field that turns. The rotor chases it, always a little behind (slip).',
      ctrl: [{ k: 'poles', label: 'Poles', min: 2, max: 6, step: 2, val: 4, fmt: (v) => v }, { k: 'slip', label: 'Slip', min: 0, max: 20, step: 1, val: 5, fmt: (v) => v + '%' }],
      read: (v) => { const ns = 120 * 50 / v.poles; return `Field speed Ns = 120f/P = <b>${ns} rpm</b> · rotor <b>${Math.round(ns * (1 - v.slip / 100))} rpm</b> · rotor frequency s·f = <b>${(v.slip / 100 * 50).toFixed(1)} Hz</b>`; },
      draw(g, w, h, t, v) {
        const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44, ns = 120 * 50 / v.poles, wf = TAU * 0.28 * (ns / 1500), a = wf * t, ar = wf * (1 - v.slip / 100) * t;
        g.fillStyle = COL.panel; g.strokeStyle = COL.line; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill(); g.stroke();
        const ph = [[0, 0], [1, 120], [2, 240]];
        for (let k = 0; k < 6; k++) {
          const p = k % 3, ang = (k * 60) * Math.PI / 180, sign = k < 3 ? 1 : -1;
          // coil k sits at k*60 degrees; phases a, b, c repeat every 120 degrees
          const i = Math.sin(a - (p === 0 ? 0 : p === 1 ? TAU / 3 : 2 * TAU / 3)) * sign * (k < 3 ? 1 : 1);
          const x = cx + R * 0.82 * Math.cos(ang), y = cy - R * 0.82 * Math.sin(ang), al = Math.abs(i);
          g.fillStyle = [COL.e, COL.cat, COL.an][p]; g.globalAlpha = 0.18 + 0.82 * al; g.beginPath(); g.arc(x, y, R * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        // field arrow
        g.strokeStyle = COL.good; g.fillStyle = COL.good; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)); g.lineTo(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a)); g.stroke();
        g.beginPath(); g.arc(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a), 6, 0, TAU); g.fill();
        // rotor
        g.save(); g.translate(cx, cy); g.rotate(-ar); g.fillStyle = COL.bg; g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 0.42, 0, TAU); g.fill(); g.stroke();
        g.strokeStyle = COL.cat; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-R * 0.34, 0); g.lineTo(R * 0.34, 0); g.moveTo(0, -R * 0.34); g.lineTo(0, R * 0.34); g.stroke(); g.restore();
        g.font = '600 11px "JetBrains Mono", monospace'; g.fillStyle = COL.good; g.fillText('field', 12, 18); g.fillStyle = COL.cat; g.fillText('rotor', 12, 34);
      },
    },
    {
      id: 'opamp', title: 'Op-amp gain', code: 'BAEEE101', subject: 'Basic Engineering', col: COL.an,
      blurb: 'Flip between inverting and non-inverting, change the resistor and see the output wave (and when it clips).',
      ctrl: [{ k: 'mode', label: 'Circuit', type: 'toggle', opts: [['inv', 'Inverting'], ['non', 'Non-inverting']], val: 'inv' }, { k: 'rf', label: 'Feedback R', min: 10, max: 100, step: 5, val: 100, fmt: (v) => v + ' kΩ (input R = 10 kΩ)' }, { k: 'vin', label: 'Input peak', min: 0.1, max: 1.5, step: 0.1, val: 0.8, fmt: (v) => v.toFixed(1) + ' V' }],
      read: (v) => { const g = v.mode === 'inv' ? -v.rf / 10 : 1 + v.rf / 10, vo = Math.abs(g) * v.vin; return `Gain = <b>${g.toFixed(1)}</b> · output peak <b>${Math.min(vo, 12).toFixed(1)} V</b>${vo > 12 ? ' <span style="color:#f08c8c">(clipped at the ±12 V supply)</span>' : ''}${v.mode === 'inv' ? ' · output is flipped' : ' · output is in phase'}`; },
      draw(g, w, h, t, v) {
        const y0 = h / 2, S = (h / 2 - 8) / 13, gain = v.mode === 'inv' ? -v.rf / 10 : 1 + v.rf / 10, th = TAU * 0.25 * t;
        g.strokeStyle = COL.line; g.lineWidth = 1; g.beginPath(); g.moveTo(8, y0); g.lineTo(w - 8, y0); g.stroke();
        g.setLineDash([5, 5]); g.strokeStyle = 'rgba(240,140,140,.45)'; g.beginPath(); g.moveTo(8, y0 - 12 * S); g.lineTo(w - 8, y0 - 12 * S); g.moveTo(8, y0 + 12 * S); g.lineTo(w - 8, y0 + 12 * S); g.stroke(); g.setLineDash([]);
        const wave = (col, f, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let x = 8; x <= w - 8; x += 2) { const u = (x - 8) / (w - 16) * 2 * TAU - th; const y = y0 - Math.max(-12, Math.min(12, f(Math.sin(u)))) * S; x === 8 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
        wave(COL.e, (s) => s * v.vin, 2); wave(COL.an, (s) => s * v.vin * gain, 2.8);
        g.font = '600 11px "JetBrains Mono", monospace'; g.fillStyle = COL.e; g.fillText('input', 12, 18); g.fillStyle = COL.an; g.fillText('output', 12, 34); g.fillStyle = 'rgba(240,140,140,.8)'; g.fillText('+12 V', w - 48, y0 - 12 * S - 5); g.fillText('−12 V', w - 48, y0 + 12 * S + 13);
      },
    },
    {
      id: 'beer', title: 'Beer–Lambert law', code: 'BACHY105', subject: 'Applied Chemistry', col: COL.cat,
      blurb: 'Make the solution stronger or the cell longer and watch less light get through.',
      ctrl: [{ k: 'c', label: 'Concentration', min: 0, max: 10, step: 0.5, val: 4, fmt: (v) => v.toFixed(1) + ' mM' }, { k: 'l', label: 'Path length', min: 1, max: 5, step: 0.5, val: 2, fmt: (v) => v.toFixed(1) + ' cm' }],
      read: (v) => { const A = 40 * (v.c / 1000) * v.l; return `A = εcl = 40 × ${(v.c / 1000).toFixed(4)} × ${v.l} = <b>${A.toFixed(2)}</b> · light through = 10<sup>−A</sup> = <b>${Math.round(Math.pow(10, -A) * 100)}%</b>`; },
      draw(g, w, h, t, v) {
        const A = 40 * (v.c / 1000) * v.l, T = Math.pow(10, -A), cy = h / 2, bh = h * 0.26, lx = w * 0.1, cw = w * (0.07 + 0.05 * v.l), cx0 = w * 0.34, cx1 = cx0 + cw, dx = w * 0.9;
        const I = (x) => x < cx0 ? 1 : x > cx1 ? T : Math.pow(10, -A * (x - cx0) / cw);
        // beam glow
        const gr = g.createLinearGradient(lx, 0, dx, 0); gr.addColorStop(0, 'rgba(255,240,200,.28)'); gr.addColorStop((cx0 - lx) / (dx - lx), 'rgba(255,240,200,.28)'); gr.addColorStop((cx1 - lx) / (dx - lx), 'rgba(255,240,200,' + (0.28 * T).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,240,200,' + (0.28 * T).toFixed(3) + ')');
        g.fillStyle = gr; g.fillRect(lx, cy - bh / 2, dx - lx, bh);
        // cuvette
        const al = 0.1 + 0.6 * Math.min(1, v.c / 10);
        g.fillStyle = 'rgba(255,181,107,' + al.toFixed(3) + ')'; g.fillRect(cx0, cy - h * 0.3, cw, h * 0.6);
        g.strokeStyle = COL.dim; g.lineWidth = 2; g.strokeRect(cx0, cy - h * 0.3, cw, h * 0.6);
        // photons
        const N = 16; g.fillStyle = '#fff4d0';
        for (let i = 0; i < N; i++) { const p = ((t * 0.22 + i / N) % 1), x = lx + (dx - lx) * p, y = cy + Math.sin(i * 7.3) * bh * 0.4; g.globalAlpha = Math.max(0.08, I(x)); g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
        // lamp and detector
        g.fillStyle = '#fff4d0'; g.beginPath(); g.arc(lx - 8, cy, 13, 0, TAU); g.fill();
        g.strokeStyle = COL.line; g.lineWidth = 1.5; g.strokeRect(dx + 6, cy - h * 0.3, 18, h * 0.6);
        g.fillStyle = COL.good; const fh = h * 0.6 * T; g.fillRect(dx + 6, cy + h * 0.3 - fh, 18, fh);
        g.font = '600 11px "JetBrains Mono", monospace'; g.fillStyle = COL.dim; g.fillText('lamp', lx - 22, cy + 30); g.fillText(Math.round(T * 100) + '%', dx - 4, cy - h * 0.3 - 8);
      },
    },
  ];

  const pv = $('#pv');
  if (pv) {
    let cur = 0, vals = {}, raf = 0, t0 = performance.now(), visible = false, cv, g, W = 0, H = 0, ro;
    pv.innerHTML = '<div class="pv-tabs" role="tablist"></div><div class="pv-body"><div class="pv-stage"><canvas aria-label="Animated preview"></canvas><span class="pv-live"><i></i>live</span></div><div class="pv-side"></div></div>';
    const tabs = $('.pv-tabs', pv), side = $('.pv-side', pv); cv = $('canvas', pv); g = cv.getContext('2d');
    DEMOS.forEach((d, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.role = 'tab'; b.id = 'pvt-' + d.id; b.dataset.i = i; b.style.setProperty('--a', d.col);
      b.innerHTML = '<i></i>' + d.title; tabs.appendChild(b);
    });
    function size() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); W = Math.max(200, r.width); H = Math.max(140, r.height); cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); frame(performance.now(), true); }
    function show(i) {
      cur = i; const d = DEMOS[i];
      $$('button', tabs).forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', String(j === i)); });
      vals = {}; d.ctrl.forEach((c) => { vals[c.k] = c.val; });
      pv.style.setProperty('--a', d.col);
      side.innerHTML = `<div class="pv-chip" style="--a:${d.col}">${d.subject}</div><h3>${d.title}</h3><p class="pv-blurb">${d.blurb}</p><div class="pv-ctrls"></div><p class="pv-read" aria-live="polite"></p><div class="pv-cta"><button class="btn primary" type="button" data-go="${d.code}">Unlock in ${d.subject} Pro</button><span class="muted small">The full tool shows every step of the working.</span></div>`;
      const box = $('.pv-ctrls', side);
      d.ctrl.forEach((c) => {
        const row = document.createElement('div'); row.className = 'pv-row';
        if (c.type === 'toggle') {
          row.innerHTML = `<span class="pv-lbl">${c.label}</span><div class="pv-tog">${c.opts.map((o) => `<button type="button" data-k="${c.k}" data-v="${o[0]}" class="${o[0] === c.val ? 'on' : ''}">${o[1]}</button>`).join('')}</div>`;
        } else {
          row.innerHTML = `<label class="pv-lbl" for="pvc-${c.k}">${c.label}</label><output id="pvo-${c.k}">${c.fmt(c.val)}</output><input id="pvc-${c.k}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.val}" data-k="${c.k}">`;
        }
        box.appendChild(row);
      });
      readout(); frame(performance.now(), true);
    }
    function readout() { const d = DEMOS[cur]; $('.pv-read', side).innerHTML = d.read(vals); }
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) show(+b.dataset.i); });
    side.addEventListener('input', (e) => {
      const r = e.target.closest('input[type=range]'); if (!r) return;
      const c = DEMOS[cur].ctrl.find((x) => x.k === r.dataset.k); vals[c.k] = +r.value; $('#pvo-' + c.k).textContent = c.fmt(+r.value);
      r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); readout(); if (reduce) frame(performance.now(), true);
    });
    side.addEventListener('click', (e) => {
      const tg = e.target.closest('.pv-tog button');
      if (tg) { vals[tg.dataset.k] = tg.dataset.v; $$('button', tg.parentNode).forEach((b) => b.classList.toggle('on', b === tg)); readout(); if (reduce) frame(performance.now(), true); return; }
      const go = e.target.closest('[data-go]'); if (go) window.stGoCard(go.dataset.go);
    });
    function frame(now, once) {
      if (!W) return; const d = DEMOS[cur], t = reduce ? 1.2 : (now - t0) / 1000;
      g.clearRect(0, 0, W, H); d.draw(g, W, H, t, vals);
      if (!once && visible && !reduce) raf = requestAnimationFrame((n) => frame(n));
    }
    if ('ResizeObserver' in window) { ro = new ResizeObserver(size); ro.observe(cv); } else addEventListener('resize', size);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { const v = es[0].isIntersecting; if (v && !visible) { visible = true; cancelAnimationFrame(raf); raf = requestAnimationFrame((n) => frame(n)); } else if (!v) { visible = false; cancelAnimationFrame(raf); } }, { threshold: 0.1 }).observe(pv);
    } else { visible = true; }
    show(0); size();
    $$('input[type=range]', side).forEach((r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'));
  }

  // ------------------------------------------------------------ jump to a subject card
  window.stGoCard = function (code) {
    const el = document.getElementById('card-' + code); if (!el) { location.hash = '#subjects'; return; }
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2200);
  };

  // ------------------------------------------------------------ subject cards: cursor glow, show all features
  const cards = $('#cards');
  if (cards) {
    cards.addEventListener('pointermove', (e) => { const c = e.target.closest('.card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    cards.addEventListener('click', (e) => {
      const b = e.target.closest('.more-btn'); if (!b) return;
      const card = b.closest('.card'), ul = $('ul', card), code = card.id.replace('card-', '');
      const open = ul.classList.toggle('collapsed') === false;
      if (open) window.stExp.add(code); else window.stExp.delete(code);
      b.textContent = open ? 'Show fewer' : b.dataset.more; b.setAttribute('aria-expanded', String(open));
    });
  }

  // ------------------------------------------------------------ small celebration when Pro is unlocked
  window.stCelebrate = function (code) {
    const box = $('#burst'); if (!box || reduce) return;
    const card = document.getElementById('card-' + code); if (card) { card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 2200); }
    const cols = [COL.e, COL.cat, COL.an, COL.good, '#f4f4f6'];
    box.innerHTML = '';
    for (let i = 0; i < 34; i++) {
      const s = document.createElement('i'), a = Math.random() * TAU, d = 120 + Math.random() * 220;
      s.style.cssText = `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 80}px;--r:${Math.random() * 720 - 360}deg;background:${cols[i % cols.length]};animation-delay:${Math.random() * 120}ms`;
      box.appendChild(s);
    }
    setTimeout(() => { box.innerHTML = ''; }, 1700);
  };
})();
