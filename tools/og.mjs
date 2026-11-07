// Makes the link-preview images in public/og/ (1200x630). Run from the repo root: npm run og
// Renders HTML with the installed Chrome or Edge in headless mode (no extra dependency).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { subjects } from '../src/lib/subjects.mjs';

const root = process.cwd();
const outDir = resolve(root, 'public/og');
const font = (p) => pathToFileURL(resolve(root, 'node_modules/@fontsource-variable', p)).href;

function findBrowser() {
  const env = process.env.CHROME_PATH;
  const pf = process.env.PROGRAMFILES || 'C:\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  const list = [env, join(pf, 'Google/Chrome/Application/chrome.exe'), join(pf86, 'Google/Chrome/Application/chrome.exe'),
    join(local, 'Google/Chrome/Application/chrome.exe'), join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    join(pf, 'Microsoft/Edge/Application/msedge.exe'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((c) => c && existsSync(c)) || null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const css = `
@font-face{font-family:Archivo;src:url("${font('archivo/files/archivo-latin-wdth-normal.woff2')}");font-weight:100 900;font-stretch:62% 125%}
@font-face{font-family:Geist;src:url("${font('geist/files/geist-latin-wght-normal.woff2')}");font-weight:100 900}
@font-face{font-family:"Geist Mono";src:url("${font('geist-mono/files/geist-mono-latin-wght-normal.woff2')}");font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden;background:#08090b}
body{position:relative;color:#f2f3f5;font-family:Geist,sans-serif;
  background-color:#08090b;
  background-image:linear-gradient(to right,rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.07) 1px,transparent 1px);
  background-size:72px 72px;background-position:0 0}
.plus{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px}
.plus:before,.plus:after{content:"";position:absolute;background:rgba(255,255,255,.22)}
.plus:before{left:6px;top:0;width:2px;height:14px}.plus:after{top:6px;left:0;height:2px;width:14px}
.wrap{position:absolute;inset:0;padding:56px 72px 52px 72px;display:flex;flex-direction:column}
.mark{font-family:Archivo;font-weight:900;font-stretch:125%;font-size:34px;letter-spacing:.01em;text-transform:uppercase;line-height:1}
.mark i{font-style:normal;color:#2d5bff}
.h{font-family:Archivo;font-weight:900;font-stretch:125%;text-transform:uppercase;line-height:1;letter-spacing:-.01em}
.mono{font-family:"Geist Mono",monospace}
.code{font-size:24px;font-weight:600;color:#7d9cff;letter-spacing:.08em;margin-top:44px}
.sec{color:#a6abb4}
.price{font-size:30px;margin-top:26px}
.mods{margin-top:auto;display:flex;flex-direction:column;gap:8px;font-size:22px;color:#a6abb4}
.mods span{color:#7d9cff;margin-right:14px}
`;

const plus = (() => {
  let s = '';
  for (let x = 144; x < 1200; x += 144) for (let y = 144; y < 630; y += 144) s += `<div class="plus" style="left:${x}px;top:${y}px"></div>`;
  return s;
})();

const page = (inner, script = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${plus}<div class="wrap">${inner}</div><script>${script}</script></body></html>`;

function subjectCard(s) {
  const mods = s.modules.slice(0, 3)
    .map(([n, t]) => `<div class="mono"><span>${String(n).padStart(2, '0')}</span>${esc(t)}</div>`).join('');
  const fit = `document.fonts.ready.then(()=>{const h=document.getElementById('n');let f=120;
    const lim=()=>h.scrollHeight<=f*1.02*2+2&&h.scrollWidth<=h.clientWidth+1;
    h.style.fontSize=f+'px';while(f>64&&!lim()){f-=4;h.style.fontSize=f+'px'}});`;
  return page(`<div class="mark">Notix</div>
<div class="code mono">${esc(s.code)}</div>
<div class="h" id="n" style="font-size:120px;margin-top:20px;max-width:1056px;line-height:1.02">${esc(s.name)}</div>
<div class="price sec">Free to read · Pro ₹${esc(s.price)} once</div>
<div class="mods">${mods}</div>`, fit);
}

function notixCard() {
  const price = Math.min(...subjects.map((s) => s.price));
  return page(`<div class="mark">Notix</div>
<div class="h" style="font-size:100px;margin-top:120px;line-height:1.06;white-space:nowrap">VIT Notes.<br><span style="color:#7d9cff">Free</span> to read.</div>
<div class="price sec" style="margin-top:auto;font-size:32px">₹${price} a subject for the Pro tools, paid once by UPI</div>`);
}

const browser = findBrowser();
if (!browser) { console.error('No Chrome or Edge found. Set CHROME_PATH.'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'notix-og-'));
const cards = [['notix', notixCard()], ...subjects.map((s) => [s.code.toLowerCase(), subjectCard(s)])];
let failed = 0;
for (const [name, html] of cards) {
  const file = join(tmp, name + '.html');
  const out = join(outDir, name + '.png');
  writeFileSync(file, html);
  const r = spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', '--virtual-time-budget=3000', `--user-data-dir=${join(tmp, 'p-' + name)}`,
    `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'pipe' });
  if (!existsSync(out)) { failed++; console.error('failed:', name, String(r.stderr).slice(0, 300)); } else console.log('wrote', out);
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(failed ? 1 : 0);
