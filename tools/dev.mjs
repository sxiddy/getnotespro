// One command for a full local store: `npm run dev:local`
// Starts the in-memory Redis stand-in (tools/fakeredis.js, port 5288) and the Astro dev server, which also runs
// api/ (astro.config.mjs). Local-only defaults are filled in for anything .env or the shell hasn't set:
// DEV_LOGIN=1 lets you sign in with any @vitstudent.ac.in address, no Google needed. No real keys are used.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dev } from 'astro';

const require = createRequire(import.meta.url);
process.chdir(fileURLToPath(new URL('..', import.meta.url))); // run from the repo root wherever it's started
const port = Number(process.argv[2] || process.env.PORT || 4321);
// a second copy on another port (e.g. 4322) gets its own in-memory store (port + 1967), so two runs can sit side by side
if (!process.env.FAKEREDIS_PORT) process.env.FAKEREDIS_PORT = String(port === 4321 ? 5288 : port + 1967);
const defaults = {
  UPSTASH_REDIS_REST_URL: 'http://localhost:' + process.env.FAKEREDIS_PORT,
  UPSTASH_REDIS_REST_TOKEN: 'local',
  SESSION_SECRET: 'local-only-session-secret',
  STORE_SECRET: 'local-only-store-secret',
  DEV_LOGIN: '1',
  ADMIN_KEY: 'local-admin', // /admin password for local runs only
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;

require('./fakeredis.js');
await dev({ root: process.cwd(), server: { port, host: '127.0.0.1' } });
