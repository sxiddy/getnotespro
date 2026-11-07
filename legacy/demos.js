/* Notix: canvas previews of the subject sites' best animations. Each demo: draw(g,w,h,t,vals), controls, readout. */
(function () {
  'use strict';
  const COL = { e: '#7cc0ff', cat: '#ffb56b', an: '#c7a4ff', good: '#86d4a9', bad: '#f08c8c', line: '#3a3a41', dim: '#80808a', text: '#cfcfd6', bg: '#151517', panel: '#1b1b1e' };
  const TAU = Math.PI * 2;
  const DEMOS = [
    {
      id: 'battery', title: 'Phone battery', code: 'BACHY105', subject: 'Applied Chemistry', col: COL.cat,
      blurb: 'What happens inside your phone battery. Lithium ions shuttle one way when you charge and the other way when you use it.',
      ctrl: [{ k: 'mode', label: 'Phone is', type: 'toggle', opts: [['use', 'In use'], ['chg', 'Charging']], val: 'use' }, { k: 'lvl', label: 'Battery level', min: 0, max: 100, step: 1, val: 70, fmt: (v) => v + '%' }],
      read: (v) => v.mode === 'chg' ? `<b>Charging:</b> the charger pushes electrons round the outside, and lithium ions travel through the electrolyte into the graphite. At <b>${v.lvl}%</b> most of the lithium is stored there.` : `<b>In use:</b> lithium ions move from the graphite to the cathode and the freed electrons run through your phone. At <b>${v.lvl}%</b>, the lithium that is left in the graphite is what powers it.`,
      draw(g, w, h, t, v) {
        const N = 20, nA = Math.round(v.lvl / 100 * N), chg = v.mode === 'chg', flow = !((chg && v.lvl >= 100) || (!chg && v.lvl <= 0));
        const ax0 = w * 0.08, ax1 = w * 0.34, cx0 = w * 0.66, cx1 = w * 0.92, y0 = h * 0.44, y1 = h * 0.84, wy = h * 0.2;
        g.fillStyle = 'rgba(124,192,255,.07)'; g.fillRect(ax1, y0, cx0 - ax1, y1 - y0);
        g.fillStyle = 'rgba(255,255,255,.07)'; g.strokeStyle = COL.line; g.lineWidth = 1.5;
        g.beginPath(); g.roundRect(ax0, y0, ax1 - ax0, y1 - y0, 8); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,181,107,.10)'; g.beginPath(); g.roundRect(cx0, y0, cx1 - cx0, y1 - y0, 8); g.fill(); g.stroke();
        g.font = '600 12px "Hanken Grotesk", sans-serif'; g.textAlign = 'center'; g.fillStyle = COL.text;
        g.fillText('Graphite (−)', (ax0 + ax1) / 2, y1 + 20); g.fillText('Cathode (+)', (cx0 + cx1) / 2, y1 + 20);
        g.fillStyle = COL.dim; g.font = '500 11px "JetBrains Mono", monospace'; g.fillText('electrolyte', (ax1 + cx0) / 2, y1 + 20);
        // ions stored in each electrode
        const slots = (x0, x1, i, n) => { const cols = 4, r = Math.floor(i / cols), c = i % cols; return [x0 + (x1 - x0) * (0.18 + 0.64 * c / (cols - 1)), y0 + (y1 - y0) * (0.2 + 0.6 * r / Math.ceil(n / cols - 0.5 || 1)) * 0.95]; };
        g.fillStyle = COL.good;
        for (let i = 0; i < N; i++) {
          const inA = i < nA, [x, y] = inA ? slots(ax0, ax1, i, N) : slots(cx0, cx1, i - nA, N);
          g.beginPath(); g.arc(x + Math.sin(t * 2 + i) * 2, y, 5, 0, TAU); g.fill();
        }
        g.fillStyle = '#0e1a13'; g.font = '700 8px sans-serif';
        // ions travelling through the electrolyte
        if (flow) for (let i = 0; i < 5; i++) {
          let p = (t * 0.32 + i / 5) % 1; if (chg) p = 1 - p;
          const x = ax1 + (cx0 - ax1) * p, y = y0 + (y1 - y0) * (0.2 + 0.6 * ((i * 0.37) % 1));
          g.fillStyle = COL.good; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        g.fillStyle = '#e8fff0'; g.font = '700 9px "JetBrains Mono", monospace'; g.fillText('Li⁺', ax1 + (cx0 - ax1) / 2, y0 + 16);
        // outside circuit
        const ax = (ax0 + ax1) / 2, cx = (cx0 + cx1) / 2;
        g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(ax, y0); g.lineTo(ax, wy); g.lineTo(cx, wy); g.lineTo(cx, y0); g.stroke();
        const bw = w * 0.2, bx = w / 2 - bw / 2;
        g.fillStyle = COL.bg; g.strokeStyle = chg ? COL.good : COL.cat; g.lineWidth = 2; g.beginPath(); g.roundRect(bx, wy - 18, bw, 36, 10); g.fill(); g.stroke();
        g.fillStyle = chg ? COL.good : COL.cat; g.font = '600 13px "Hanken Grotesk", sans-serif'; g.fillText(chg ? '🔌 Charger' : '📱 Phone', w / 2, wy + 5);
        if (flow) { g.fillStyle = COL.e; const L = (ax - cx) ; for (let i = 0; i < 8; i++) { let p = (t * 0.3 + i / 8) % 1; if (chg) p = 1 - p; const tot = (y0 - wy) * 2 + (cx - ax), d = p * tot; let x, y; if (d < y0 - wy) { x = ax; y = y0 - d; } else if (d < y0 - wy + (cx - ax)) { x = ax + (d - (y0 - wy)); y = wy; } else { x = cx; y = wy + (d - (y0 - wy) - (cx - ax)); } if (Math.abs(x - w / 2) < bw / 2 && y === wy) continue; g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); } }
        g.fillStyle = COL.e; g.font = '600 11px "JetBrains Mono", monospace'; g.fillText('e⁻', ax + 14, wy - 8);
        g.fillStyle = '#f4f4f6'; g.font = '700 22px "Hanken Grotesk", sans-serif'; g.fillText(v.lvl + '%', w / 2, (y0 + y1) / 2 + 6);
        g.textAlign = 'start';
      },
    },
    {
      id: 'solar', title: 'Solar panel', code: 'BACHY105', subject: 'Applied Chemistry', col: COL.an,
      blurb: 'How sunlight becomes electricity in a solar cell. More light frees more electrons, and the bulb shines brighter.',
      ctrl: [{ k: 'sun', label: 'Sunlight', min: 0, max: 100, step: 5, val: 70, fmt: (v) => v === 0 ? 'night' : v < 35 ? 'cloudy' : v < 75 ? 'bright' : 'full sun' }],
      read: (v) => v.sun === 0 ? '<b>Night:</b> no photons reach the cell, so no electrons are freed and the bulb stays off.' : `Each photon that hits the junction frees an <b>electron</b> and leaves a <b>hole</b>. The junction pushes the electrons round the wire, so <b>${v.sun}%</b> sunlight gives roughly <b>${v.sun}%</b> of the current.`,
      draw(g, w, h, t, v) {
        const s = v.sun / 100, px = w * 0.1, pw = w * 0.5, py = h * 0.58, nh = h * 0.07, ph = h * 0.17, bx = w * 0.82, by = h * 0.4, br = Math.min(w, h) * 0.07;
        // sun and rays
        const sx = w * 0.22, sy = h * 0.14; g.fillStyle = 'rgba(255,200,90,' + (0.25 + 0.75 * s) + ')'; g.shadowColor = '#ffc85a'; g.shadowBlur = 24 * s; g.beginPath(); g.arc(sx, sy, h * 0.065, 0, TAU); g.fill(); g.shadowBlur = 0;
        // panel
        g.fillStyle = 'rgba(124,192,255,.28)'; g.fillRect(px, py, pw, nh); g.fillStyle = 'rgba(240,140,140,.2)'; g.fillRect(px, py + nh, pw, ph);
        g.strokeStyle = COL.line; g.lineWidth = 1.5; g.strokeRect(px, py, pw, nh + ph); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(px, py + nh); g.lineTo(px + pw, py + nh); g.stroke(); g.setLineDash([]);
        g.font = '600 11px "JetBrains Mono", monospace'; g.fillStyle = COL.e; g.fillText('n-type', px + 8, py + nh - 8 > py + 12 ? py + 12 : py + 12); g.fillStyle = COL.bad; g.fillText('p-type', px + 8, py + nh + 18);
        // photons
        const M = 12, tx = px + pw / 2, ty = py;
        g.fillStyle = '#ffd877';
        for (let i = 0; i < M; i++) { if (i >= Math.round(s * M)) continue; const p = (t * 0.4 + i / M) % 1, x = sx + (px + pw * (0.1 + 0.8 * ((i * 0.37) % 1)) - sx) * p, y = sy + (ty - sy) * p; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, 3.4, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
        // wire loop
        const pts = [[px + pw, py + nh / 2], [bx, py + nh / 2], [bx, by + br], null, [bx, by - br], [bx, py + nh + ph + 22], [px + pw / 2, py + nh + ph + 22], [px + pw / 2, py + nh + ph]];
        g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.moveTo(...pts[4]); g.lineTo(...pts[5]); g.lineTo(...pts[6]); g.lineTo(...pts[7]); g.stroke();
        // bulb
        g.fillStyle = 'rgba(255,224,130,' + (0.08 + 0.92 * s) + ')'; g.shadowColor = '#ffe082'; g.shadowBlur = 36 * s; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill(); g.shadowBlur = 0; g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke();
        // electrons round the loop
        const path = [pts[0], pts[1], pts[2], pts[4], pts[5], pts[6], pts[7]], seg = [], tot = path.reduce((a, p, i) => { if (!i) return 0; const d = Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]); seg.push(d); return a + d; }, 0);
        const E = 14; g.fillStyle = COL.e;
        for (let i = 0; i < E; i++) { if (i >= Math.round(s * E)) continue; let d = ((t * 0.12 * (0.4 + s) + i / E) % 1) * tot, k = 0; while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; } const a = path[k], b = path[k + 1], f = seg[k] ? d / seg[k] : 0; g.beginPath(); g.arc(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 3.4, 0, TAU); g.fill(); }
        g.fillStyle = COL.dim; g.font = '500 11px "JetBrains Mono", monospace'; g.fillText('electrons', bx - 62, py + nh + ph + 40);
      },
    },
    {
      id: 'charger', title: 'Phone charger', code: 'BAEEE101', subject: 'Basic Engineering', col: COL.e,
      blurb: 'Your charger turns 230 V from the wall into about 5 V. Change the turns on the output coil to see the voltage change.',
      ctrl: [{ k: 'n2', label: 'Turns on output coil', min: 10, max: 600, step: 2, val: 22, fmt: (v) => v + ' turns (input has 1000)' }],
      read: (v) => { const vo = 230 * v.n2 / 1000; return `Output = 230 V × ${v.n2}/1000 = <b>${vo.toFixed(1)} V</b> · ${vo < 12 ? 'safe for a phone' : vo < 60 ? 'too high for a phone' : 'dangerous: needs a proper adapter'} · it only works on AC, because the flux must keep changing`; },
      draw(g, w, h, t, v) {
        const x0 = w * 0.3, x1 = w * 0.7, y0 = h * 0.16, y1 = h * 0.84, th = w * 0.065, ph = Math.sin(t * TAU * 0.4), vo = 230 * v.n2 / 1000;
        g.fillStyle = '#2a2a30'; g.strokeStyle = COL.line; g.lineWidth = 1.5; g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.rect(x0 + th, y0 + th, x1 - x0 - 2 * th, y1 - y0 - 2 * th); g.fill('evenodd'); g.stroke();
        // flux glow and arrows
        g.strokeStyle = 'rgba(124,192,255,' + (0.15 + 0.7 * Math.abs(ph)) + ')'; g.lineWidth = 4; g.setLineDash([10, 9]); g.lineDashOffset = -t * 40 * Math.sign(ph || 1);
        g.beginPath(); g.rect(x0 + th / 2, y0 + th / 2, x1 - x0 - th, y1 - y0 - th); g.stroke(); g.setLineDash([]);
        const coil = (cx, n, col) => { g.strokeStyle = col; g.lineWidth = 3; for (let i = 0; i < n; i++) { const y = y0 + th + 8 + (y1 - y0 - 2 * th - 16) * (i + 0.5) / n; g.beginPath(); g.ellipse(cx, y, th * 0.95, th * 0.3, 0, 0, TAU); g.stroke(); } };
        coil(x0 + th / 2, 14, COL.e); coil(x1 - th / 2, Math.max(2, Math.round(2 + v.n2 / 600 * 12)), COL.cat);
        g.font = '600 13px "Hanken Grotesk", sans-serif'; g.textAlign = 'center';
        g.fillStyle = COL.e; g.fillText('Wall socket', w * 0.12, h * 0.46); g.font = '700 22px "Hanken Grotesk", sans-serif'; g.fillText('230 V', w * 0.12, h * 0.46 + 28); g.font = '500 11px "JetBrains Mono", monospace'; g.fillStyle = COL.dim; g.fillText('1000 turns', w * 0.12, h * 0.46 + 46);
        g.fillStyle = COL.cat; g.font = '600 13px "Hanken Grotesk", sans-serif'; g.fillText('Your phone', w * 0.88, h * 0.46); g.font = '700 22px "Hanken Grotesk", sans-serif'; g.fillText(vo.toFixed(1) + ' V', w * 0.88, h * 0.46 + 28); g.font = '500 11px "JetBrains Mono", monospace'; g.fillStyle = COL.dim; g.fillText(v.n2 + ' turns', w * 0.88, h * 0.46 + 46);
        g.fillStyle = COL.dim; g.font = '500 11px "JetBrains Mono", monospace'; g.fillText('alternating magnetic flux', w / 2, h * 0.5 + 4);
        g.textAlign = 'start';
      },
    },
    {
      id: 'motor', title: 'Ceiling fan motor', code: 'BAEEE101', subject: 'Basic Engineering', col: COL.cat,
      blurb: 'Why a fan spins. Three coils make a magnetic field that turns, and the rotor chases it, always a little behind (slip).',
      ctrl: [{ k: 'poles', label: 'Poles', min: 2, max: 6, step: 2, val: 4, fmt: (v) => v }, { k: 'slip', label: 'Slip', min: 0, max: 20, step: 1, val: 5, fmt: (v) => v + '%' }],
      read: (v) => { const ns = 120 * 50 / v.poles; return `Field speed Ns = 120f/P = <b>${ns} rpm</b> · fan <b>${Math.round(ns * (1 - v.slip / 100))} rpm</b> · rotor frequency s·f = <b>${(v.slip / 100 * 50).toFixed(1)} Hz</b>`; },
      draw(g, w, h, t, v) {
        const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.44, ns = 120 * 50 / v.poles, wf = TAU * 0.28 * (ns / 1500), a = wf * t, ar = wf * (1 - v.slip / 100) * t;
        g.fillStyle = COL.panel; g.strokeStyle = COL.line; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill(); g.stroke();
        for (let k = 0; k < 6; k++) {
          const p = k % 3, ang = (k * 60) * Math.PI / 180, sign = k < 3 ? 1 : -1;
          const i = Math.sin(a - p * TAU / 3) * sign;
          const x = cx + R * 0.82 * Math.cos(ang), y = cy - R * 0.82 * Math.sin(ang);
          g.fillStyle = [COL.e, COL.cat, COL.an][p]; g.globalAlpha = 0.18 + 0.82 * Math.abs(i); g.beginPath(); g.arc(x, y, R * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        g.strokeStyle = COL.good; g.fillStyle = COL.good; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)); g.lineTo(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a)); g.stroke();
        g.beginPath(); g.arc(cx + R * 0.62 * Math.cos(a), cy - R * 0.62 * Math.sin(a), 6, 0, TAU); g.fill();
        g.save(); g.translate(cx, cy); g.rotate(-ar);
        g.fillStyle = 'rgba(255,181,107,.85)'; for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * TAU / 3); g.beginPath(); g.roundRect(R * 0.05, -R * 0.1, R * 0.4, R * 0.2, R * 0.1); g.fill(); g.restore(); }
        g.fillStyle = COL.bg; g.strokeStyle = COL.dim; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R * 0.12, 0, TAU); g.fill(); g.stroke(); g.restore();
        g.font = '600 11px "JetBrains Mono", monospace'; g.fillStyle = COL.good; g.fillText('field', 12, 18); g.fillStyle = COL.cat; g.fillText('fan', 12, 34);
      },
    },
    {
      id: 'temp', title: 'Temperature and reaction speed', code: 'BACHY105', subject: 'Applied Chemistry', col: COL.cat, rank: 1,
      blurb: 'Why heating speeds a reaction up. Hotter molecules move faster, and more of them hit hard enough to react (more than Ea).',
      ctrl: [{ k: 'T', label: 'Temperature', min: 280, max: 600, step: 5, val: 350, fmt: (v) => v + ' K' }],
      read: (v) => { const k = Math.exp(-50000 / 8.314 * (1 / v.T - 1 / 300)); return `Arrhenius: k = A·e<sup>−Ea/RT</sup>. At <b>${v.T} K</b> the rate is about <b>${k < 10 ? k.toFixed(1) : Math.round(k)}×</b> the rate at 300 K (for Ea = 50 kJ/mol).`; },
      init(w, h) { const P = []; let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; for (let i = 0; i < 46; i++) P.push({ x: r(), y: r(), a: r() * TAU, e: r() }); return P; },
      draw(g, w, h, t, v) {
        const P = this._p || (this._p = this.init(w, h)), sp = Math.sqrt(v.T / 300) * 0.07, hot = Math.min(1, (v.T - 280) / 320);
        g.fillStyle = 'rgba(255,181,107,' + (0.04 + 0.1 * hot) + ')'; g.strokeStyle = COL.line; g.lineWidth = 1.5; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 14); g.fill(); g.stroke();
        let hit = 0;
        P.forEach((p, i) => {
          const a = p.a + Math.sin(t * 0.7 + i) * 0.6, x = 14 + ((p.x + Math.cos(a) * sp * t * (0.6 + p.e)) % 1 + 1) % 1 * (w - 28), y = 14 + ((p.y + Math.sin(a) * sp * t * (0.6 + p.e)) % 1 + 1) % 1 * (h - 28);
          const en = p.e * (v.T / 300) * 1.15, rea = en > 1.25; if (rea) hit++;
          g.fillStyle = rea ? COL.cat : COL.e; g.globalAlpha = rea ? 1 : 0.7; g.shadowColor = COL.cat; g.shadowBlur = rea ? 12 : 0;
          g.beginPath(); g.arc(x, y, rea ? 5 : 3.6, 0, TAU); g.fill(); g.shadowBlur = 0; g.globalAlpha = 1;
        });
        g.fillStyle = COL.text; g.font = '600 12px "Nunito", sans-serif'; g.fillText(v.T + ' K · ' + hit + ' of ' + P.length + ' have enough energy', 18, h - 18);
      },
    },
    {
      id: 'grammar', title: 'Fix the sentence', code: 'BAENG101', subject: 'Technical English', col: COL.an, rank: 1,
      blurb: 'Technical writing is about small fixes. Slide to correct the sentence one mistake at a time.',
      ctrl: [{ k: 'fix', label: 'Fixes applied', min: 0, max: 3, step: 1, val: 0, fmt: (v) => v + ' of 3' }],
      read: (v) => ['<b>Three mistakes.</b> Can you spot them? Slide to fix them one by one.', '<b>Fixed 1:</b> "The data show", because data is plural in formal writing.', '<b>Fixed 2:</b> "were collected", passive voice for a method.', '<b>Fixed 3:</b> "which", because a comma needs a non-defining clause. Clean and formal now.'][v.fix],
      draw(g, w, h, t, v) {
        const lines = [['The data ', 'shows', ' that the samples ', 'was', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'was', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'were', ' collected, ', 'that', ' were tested twice.'], ['The data ', 'show', ' that the samples ', 'were', ' collected, ', 'which', ' were tested twice.']][v.fix];
        const bad = [v.fix < 1, v.fix < 2, v.fix < 3], fs = Math.max(13, Math.min(w / 24, 20));
        g.font = '600 ' + fs + 'px "Nunito", sans-serif'; g.textBaseline = 'middle';
        const full = lines.join(''), maxW = w - 36; let words = [], cur = '', ln = [];
        let x = 18, y = h * 0.34, k = 0; const lh = fs * 1.9;
        lines.forEach((seg, i) => { const isW = i % 2 === 1, isBad = isW && bad[(i - 1) / 2]; seg.split(/(\s+)/).forEach((tok) => { if (!tok) return; const tw = g.measureText(tok).width; if (x + tw > w - 18 && tok.trim()) { x = 18; y += lh; } if (isW) { g.fillStyle = isBad ? 'rgba(240,140,140,.22)' : 'rgba(134,212,169,.2)'; g.beginPath(); g.roundRect(x - 3, y - fs * 0.8, tw + 6, fs * 1.6, 6); g.fill(); } g.fillStyle = isW ? (isBad ? COL.bad : COL.good) : '#e9e9ee'; g.fillText(tok, x, y); x += tw; }); });
        g.fillStyle = COL.dim; g.font = '600 11px "JetBrains Mono", monospace'; g.fillText(v.fix === 3 ? 'ready to submit' : 'needs ' + (3 - v.fix) + ' more fix' + (3 - v.fix > 1 ? 'es' : ''), 18, h - 18);
      },
    },
  ];
  window.NX_DEMOS = DEMOS; window.NX_COL = COL;
})();
