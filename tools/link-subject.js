// node tools/link-subject.js <repo path> <CODE> "<Subject name>"
// Patches a subject site so that, once STORE_URL (and STORE_SECRET) are set in its Vercel env:
//   - Pro is also granted to students who bought it on the store (api/_lib.js hasAccess -> store /api/entitlement),
//   - the paywall page links to the store instead of opening Razorpay (app/js/gate.js),
//   - /api/create-order refuses to take payments (api/create-order.js),
//   - /api/session reports storeUrl, storeCode and storeName (api/session.js).
// With STORE_URL unset nothing changes. Every anchor must match exactly once or nothing is written.
const fs = require('fs'), path = require('path');
const [repo, CODE, NAME] = process.argv.slice(2);
if (!repo || !CODE || !NAME) throw new Error('usage: link-subject.js <repo> <CODE> "<name>"');
const files = new Map();
function edit(file, anchor, fn) {
  const p = path.join(repo, file); const t = files.has(p) ? files.get(p) : fs.readFileSync(p, 'utf8');
  if (t.split(anchor).length !== 2) throw new Error(file + ': anchor not found exactly once: ' + anchor.slice(0, 70));
  files.set(p, fn(t, anchor));
}

// ---- api/_lib.js
edit('api/_lib.js', '// Who can see the paid modules:', (t, a) => t.replace(a, `// Pro bought on the Notes Pro store (STORE_URL): asked server-to-server with STORE_SECRET. A yes is remembered for a
// minute, a no for 5 seconds, so a student who just paid is unlocked almost at once and the store is not hit on every request.
const STORE_CODE = '${CODE}';
const STORE_CACHE = new Map();
async function storePaid(email) {
  const url = process.env.STORE_URL, secret = process.env.STORE_SECRET;
  if (!url || !secret || !email) return false;
  const hit = STORE_CACHE.get(email);
  if (hit && hit.until > Date.now()) return hit.paid;
  let paid = false;
  try {
    const r = await fetch(url.replace(/\\/$/, '') + '/api/entitlement?product=' + STORE_CODE + '&email=' + encodeURIComponent(email), { headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(3000) });
    if (r.ok) paid = !!(await r.json()).paid; else return false;
  } catch (e) { return false; } // store unreachable: do not lock or unlock anyone because of it
  STORE_CACHE.set(email, { paid, until: Date.now() + (paid ? 60e3 : 5e3) });
  return paid;
}

` + a));
edit('api/_lib.js', "  if (paid != null) return { email: u.e, paid: true, modules: null };\n", (t, a) => t.replace(a, a + "  if (await storePaid(u.e)) return { email: u.e, paid: true, modules: null, store: true };\n"));

// ---- api/session.js
edit('api/session.js', "googleClientId: process.env.GOOGLE_CLIENT_ID || null, domain: DOMAIN,", (t, a) => t.replace(a, a + `\n    storeUrl: process.env.STORE_URL ? process.env.STORE_URL.replace(/\\/$/, '') : null, storeCode: '${CODE}', storeName: '${NAME}',`));

// ---- api/create-order.js
edit('api/create-order.js', "  const u = getUser(req);\n", (t, a) => t.replace(a, "  if (process.env.STORE_URL) return send(res, 403, { error: 'Pro is bought on Notes Pro: ' + process.env.STORE_URL });\n" + a));

// ---- app/js/gate.js
edit('app/js/gate.js', '  function paywall(msg) {\n', (t, a) => t.replace(a, a + '    if (S.storeUrl && S.user) return storeGate();\n'));
edit('app/js/gate.js', '  // ---------------------------------------------------------------- pay\n', (t, a) => t.replace(a, `  // Pro is bought on the Notes Pro store: send the student there (signed in, with this subject highlighted)
  function storeGate() {
    const go = S.storeUrl + '/?subject=' + encodeURIComponent(S.storeCode);
    root.innerHTML = \`
      <div class="gate">
        <div class="gate-card">
          <div class="gate-eyebrow">\${esc(S.storeCode)} · \${esc(S.storeName)}</div>
          <h1 class="gate-title">\${esc(S.storeCode)} Pro</h1>
          <p class="gate-lead">The notes stay free. Pro adds the study tools: interactive models, the question bank, quizzes, flashcards, formula sheets and more. Pro is bought on <b>Notes Pro</b>, one payment per subject with UPI, and it opens here as soon as you are back.</p>
          <p><a class="btn primary gate-pay" id="gate-store" href="\${esc(go)}">Get Pro on Notes Pro</a></p>
          <p class="gate-muted gate-small">Sign in there with the same student account (<b>\${esc(S.user || '')}</b>). After paying, come back to this page and reload it.</p>
          <p><button class="btn" type="button" id="gate-reload">I have paid, reload</button></p>
          <p class="gate-signed">Signed in as \${esc(S.user || '')} · <button type="button" class="linkish" id="gate-out">Sign out</button></p>
          <p style="margin-top:14px"><a class="btn ghost" href="./" id="gate-back">← Back to the notes</a></p>
          <p class="gate-muted gate-small gate-legal">\${legal}</p>
        </div>
      </div>\`;
    funnel('paywall');
    document.getElementById('gate-out').addEventListener('click', signOut);
    document.getElementById('gate-reload').addEventListener('click', () => reload());
  }

` + a));

for (const [p, t] of files) fs.writeFileSync(p, t);
console.log('patched', repo, files.size, 'files');
