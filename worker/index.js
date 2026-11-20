// Cloudflare Worker for the Notix store (replaces Vercel). Static pages come from dist/ (the Astro build) through the
// ASSETS binding; /api/* runs the same api/*.js handlers as before, through a small Node-style req/res shim.
// Scheduled jobs (wrangler.jsonc "triggers") call api/cron.js the way Vercel Cron did.
import admin from '../api/admin.js';
import community from '../api/community.js';
import createOrder from '../api/create-order.js';
import donate from '../api/donate.js';
import cron from '../api/cron.js';
import entitlement from '../api/entitlement.js';
import login from '../api/login.js';
import offers from '../api/offers.js';
import session from '../api/session.js';
import track from '../api/track.js';
import verify from '../api/verify.js';

const API = {
  admin, community, 'create-order': createOrder, cron, donate, entitlement, login, offers, session, track, verify,
};
// the rewrites vercel.json used to do
const REWRITES = { '/api/notify': '/api/entitlement', '/api/verify-payment': '/api/verify', '/api/logout': '/api/login?out=1' };

function rewrite(url) {
  const to = REWRITES[url.pathname];
  if (!to) return url;
  const next = new URL(to, url);
  for (const [k, v] of url.searchParams) next.searchParams.append(k, v);
  return next;
}

// Run a Node-style (req, res) handler and turn what it writes into a Response.
async function runNode(handler, request, url, ctx) {
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers['x-forwarded-for'] = ip;
  const bodyBuf = request.method === 'GET' || request.method === 'HEAD' ? null : Buffer.from(await request.arrayBuffer());
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    socket: { remoteAddress: ip || '' },
    async *[Symbol.asyncIterator]() { if (bodyBuf && bodyBuf.length) yield bodyBuf; },
  };

  return new Promise((resolve) => {
    const out = new Headers();
    const chunks = [];
    let done = false;
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader(k, v) {
        out.delete(k);
        for (const x of Array.isArray(v) ? v : [v]) out.append(k, String(x));
        return res;
      },
      getHeader: (k) => out.get(k) ?? undefined,
      removeHeader: (k) => out.delete(k),
      writeHead(status, a, b) {
        res.statusCode = status;
        const h = typeof a === 'object' && a ? a : b;
        if (h) for (const k in h) res.setHeader(k, h[k]);
        return res;
      },
      write(c) { if (c != null) chunks.push(typeof c === 'string' ? Buffer.from(c) : Buffer.from(c)); return true; },
      end(c) {
        if (done) return res;
        done = true;
        res.headersSent = true;
        if (c != null) res.write(c);
        const body = request.method === 'HEAD' || res.statusCode === 204 || res.statusCode === 304 ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status: res.statusCode, headers: out }));
        return res;
      },
    };
    const run = (async () => {
      try {
        await handler(req, res);
      } catch (e) {
        console.error('api error', url.pathname, e && e.stack || e);
        if (!done) {
          res.statusCode = (e && e.status) || 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: (e && e.status && e.message) || 'Server error. Try again.' }));
        }
      }
      if (!done) res.end(); // handler returned without answering
    })();
    ctx.waitUntil(run); // let work after res.end() (notifications, counters) finish
  });
}

function runCron(job, env, ctx) {
  const url = new URL('https://notix.in/api/cron?job=' + job);
  const request = new Request(url, { headers: { authorization: 'Bearer ' + (env.CRON_SECRET || '') } });
  ctx.waitUntil(runNode(cron, request, url, ctx).then((r) => console.log('cron', job, r.status)));
}

export default {
  async fetch(request, env, ctx) {
    let url = new URL(request.url);
    if (url.hostname === 'www.notix.in') {
      url.hostname = 'notix.in';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/admin') return env.ASSETS.fetch(new Request(new URL('/admin.html', url), request));
    if (url.pathname.startsWith('/api/')) {
      url = rewrite(url);
      const name = url.pathname.slice(5);
      const handler = Object.prototype.hasOwnProperty.call(API, name) && API[name];
      if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });
      return runNode(handler, request, url, ctx);
    }
    return env.ASSETS.fetch(request);
  },

  // One cron trigger at 03:30 UTC (09:00 IST) every day (the account allows 5 schedules; each subject site needs one
  // for its Payment Link checker): the daily check runs every day, plus the weekly report on Mondays.
  async scheduled(event, env, ctx) {
    if (new Date(event.scheduledTime).getUTCDay() === 1) runCron('weekly', env, ctx);
    runCron('check', env, ctx);
  },
};
