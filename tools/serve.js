// Local preview of the production build: static dist/ (run `npm run build` first) plus the api/ functions.
// For day-to-day work use `npm run dev` instead: Astro serves the pages and runs api/ itself (astro.config.mjs).
//   node tools/fakeredis.js      (in another terminal; in-memory stand-in for the Upstash store on port 5288)
//   DEV_LOGIN=1 node tools/serve.js [port]   -> sign in with any @vitstudent.ac.in address, no Google needed
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
if (fs.existsSync(path.join(ROOT, '.env'))) {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const dir = path.join(ROOT, 'dist'), port = +(process.argv[2] || 4180);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/api/verify-payment') req.url = '/api/verify';
  if (u === '/admin') req.url = '/admin.html';
  u = req.url.split('?')[0];
  const m = u.match(/^\/api\/([a-z-]+)$/);
  if (m && fs.existsSync(path.join(ROOT, 'api', m[1] + '.js'))) return require(path.join(ROOT, 'api', m[1] + '.js'))(req, res);
  let p = decodeURIComponent(u); if (p.endsWith('/')) p += 'index.html'; else if (!path.extname(p)) p += '/index.html';
  const f = path.join(dir, p);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('store on http://localhost:' + port));
