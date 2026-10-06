// Rename the store in one go (name, and optionally the website address).
//   node tools/rebrand.js --name "Notix" [--slug notix] [--domain notix.in]          dry run: lists what would change
//   node tools/rebrand.js --name "Notix" [--slug notix] [--domain notix.in] --write  does it and updates tools/brand.json
// --slug is the short lowercase form (used in the reviewer username, review@<slug>); it defaults to the name in lowercase letters.
// --domain is the bare host without https:// (leave it out to keep the current address).
// Only this repo is touched. The steps outside the code (Vercel, Google, Razorpay, the three subject sites) are printed at the end.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2), get = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : ''; };
const write = args.includes('--write');
const brandFile = path.join(__dirname, 'brand.json');
const old = JSON.parse(fs.readFileSync(brandFile, 'utf8'));
const name = get('name');
if (!name) { console.error('usage: node tools/rebrand.js --name "Notix" [--slug notix] [--domain notix.in] [--write]'); process.exit(1); }
const slug = (get('slug') || name.toLowerCase().replace(/[^a-z0-9]/g, '')), domain = get('domain') || old.domain;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// order matters: the address contains the slug, so it goes first
const rules = [
  [old.domain, domain],
  [cap(old.slug), name],
  [old.slug, slug],
  [old.name.toUpperCase(), name.toUpperCase()],
  [old.name, name],
];
const skip = new Set(['node_modules', '.git']);
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { if (skip.has(f)) continue; const p = path.join(d, f); const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (/\.(html|js|css|json|md)$/.test(f) && f !== 'rebrand.js' && f !== 'brand.json' && f !== 'package-lock.json') files.push(p); } })(root);
let total = 0;
for (const p of files) {
  const o = fs.readFileSync(p, 'utf8'); let t = o, n = 0;
  for (const [a, b] of rules) { if (!a || a === b) continue; const parts = t.split(a); n += parts.length - 1; t = parts.join(b); }
  if (t !== o) { total += n; console.log((write ? 'changed ' : 'would change ') + path.relative(root, p) + '  (' + n + ')'); if (write) fs.writeFileSync(p, t); }
}
console.log(total + ' replacement(s) in total.');
if (write) { fs.writeFileSync(brandFile, JSON.stringify({ name, slug, domain }, null, 2) + '\n'); console.log('tools/brand.json updated.'); } else console.log('Dry run only. Add --write to apply.');
console.log(`
Still to do outside this repo (see README "Renaming the store"):
  1. Vercel: add the new domain to the store project; set STORE_URL on each subject site to https://${domain}
  2. Google Cloud: add https://${domain} as an authorised origin and https://${domain}/api/login as a redirect URI
  3. Razorpay: website ${domain}; Checkout Styling brand name must match the business or website name; webhook URL https://${domain}/api/verify
  4. Subject sites: change the "Notes Pro" wording and links (they read it from the store, plus a few fixed strings); redeploy
  5. Reviewer account: the username is now review@${slug}`);
