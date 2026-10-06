// Local testing only: a tiny in-memory stand-in for the Upstash REST pipeline on port 5288.
//   node tools/fakeredis.js   (then start the "notes-admin" preview from .claude/launch.json)
const http = require('http');
const db = {};
const S = (k) => db[k] || (db[k] = new Set());
const H = (k) => db[k] || (db[k] = {});
const Z = (k) => db[k] || (db[k] = { __z: 1 });
const zkeys = (z) => Object.keys(z || {}).filter((x) => x !== '__z');
const run = ([c, k, ...a]) => {
  switch (String(c).toUpperCase()) {
    case 'GET': return typeof db[k] === 'string' || typeof db[k] === 'number' ? String(db[k]) : null;
    case 'SET': { if (a.includes('NX') && k in db) return null; db[k] = String(a[0]); return 'OK'; }
    case 'TTL': return k in db ? 604000 : -2;
    case 'EXPIRE': return 1;
    case 'INCR': db[k] = (+db[k] || 0) + 1; return db[k];
    case 'DEL': { let n = 0; [k, ...a].forEach((x) => { if (x in db) { delete db[x]; n++; } }); return n; }
    case 'KEYS': { const re = new RegExp('^' + k.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'); return Object.keys(db).filter((x) => re.test(x)); }
    case 'SADD': S(k).add(a[0]); return 1;
    case 'SCARD': return S(k).size;
    case 'SISMEMBER': return S(k).has(a[0]) ? 1 : 0;
    case 'HSET': { const h = H(k); for (let i = 0; i + 1 < a.length; i += 2) h[a[i]] = String(a[i + 1]); return a.length / 2; }
    case 'HSETNX': { const h = H(k); if (a[0] in h) return 0; h[a[0]] = String(a[1]); return 1; }
    case 'HGET': return (db[k] || {})[a[0]] ?? null;
    case 'HMGET': return a.map((f) => (db[k] || {})[f] ?? null);
    case 'HGETALL': return Object.entries(db[k] || {}).flat();
    case 'HDEL': { let n = 0; a.forEach((f) => { if (db[k] && f in db[k]) { delete db[k][f]; n++; } }); return n; }
    case 'HEXISTS': return db[k] && a[0] in db[k] ? 1 : 0;
    case 'HINCRBY': { const h = H(k); h[a[0]] = String((+h[a[0]] || 0) + +a[1]); return +h[a[0]]; }
    case 'ZADD': Z(k)[a[1]] = +a[0]; return 1;
    case 'ZCARD': return zkeys(db[k]).length;
    case 'ZSCORE': { const z = db[k]; return z && a[0] in z && a[0] !== '__z' ? String(z[a[0]]) : null; }
    case 'ZREMRANGEBYRANK': { const z = db[k] || {}; const ks = zkeys(z).sort((p, q) => z[p] - z[q]).slice(+a[0], +a[1] + 1); ks.forEach((x) => delete z[x]); return ks.length; }
    case 'LPUSH': (db[k] || (db[k] = [])).unshift(...a); return db[k].length;
    case 'LRANGE': return (db[k] || []).slice(+a[0], +a[1] < 0 ? undefined : +a[1] + 1);
    case 'LTRIM': return 'OK';
  }
  return null;
};
http.createServer((q, r) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { try { r.end(JSON.stringify(JSON.parse(b).map((x) => ({ result: run(x) })))); } catch (e) { r.statusCode = 400; r.end('[]'); } }); }).listen(5288, () => console.log('fake store on :5288'));
