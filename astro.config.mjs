// Astro, static output to dist/. The Vercel functions in api/ are not part of the Astro build; Vercel deploys them
// next to dist/. In `npm run dev` the plugin below runs the same api/ handlers inside the dev server, so the whole
// store (pages + sign-in + cart + payments in Razorpay test mode) runs from one command.
import { defineConfig } from 'astro/config';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const require = createRequire(ROOT + '/');

// .env for local runs only (Vercel sets real variables itself)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

// the same rewrites as vercel.json, for local runs
const REWRITES = { '/api/verify-payment': '/api/verify', '/api/logout': '/api/login?out=1' };

function localApi() {
  return {
    name: 'notix-local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [p, q] = req.url.split('?');
        if (REWRITES[p]) req.url = REWRITES[p] + (q ? (REWRITES[p].includes('?') ? '&' : '?') + q : '');
        if (p === '/admin') req.url = '/admin.html';
        const m = req.url.split('?')[0].match(/^\/api\/([a-z-]+)$/);
        const file = m && path.join(ROOT, 'api', m[1] + '.js');
        if (!file || !fs.existsSync(file)) return next();
        try {
          Promise.resolve(require(file)(req, res)).catch((e) => next(e));
        } catch (e) { next(e); }
      });
    },
  };
}

export default defineConfig({
  site: process.env.SITE_URL || 'https://notix-notes.vercel.app',
  output: 'static',
  outDir: './dist',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  server: { port: 4321 },
  devToolbar: { enabled: false },
  vite: { plugins: [localApi()] },
});
