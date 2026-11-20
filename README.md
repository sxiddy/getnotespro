# Notix (store), https://notix.in

One website that sells Pro access for the subject note sites (BACHY105, BAEEE101, BAENG101). Only this site needs Razorpay website approval.
Students sign in here with their VIT Google account, pay by UPI for one subject, and the subject site then asks this store whether they own it.

## Flow
1. On a subject site, "Unlock" links to `https://<store>/?subject=<CODE>`.
2. The store opens its sign-in window (remembered afterwards), highlights that subject, and takes the UPI payment.
3. Payment is recorded in Redis hash `paid:<CODE>` (email -> payment). The page callback, "Check my payment" and the Razorpay webhook all record it.
4. The subject site calls `GET /api/entitlement?product=<CODE>&email=<email>` with `Authorization: Bearer <STORE_SECRET>`; `{ "paid": true }` unlocks Pro there.

## Vercel environment variables
| Name | What |
|---|---|
| `SESSION_SECRET` | any long random string (signs the sign-in cookie) |
| `GOOGLE_CLIENT_ID` | Google OAuth web client id; add this site's origin and `https://<store>/api/login` redirect URI in Google Cloud |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay keys for the approved account |
| `RAZORPAY_WEBHOOK_SECRET` | secret for a webhook pointed at `https://<store>/api/verify` (events payment.authorized, payment.captured, order.paid, refund.processed, payment.refunded; the last two make refunds made in the Razorpay dashboard end Pro here too) |
| `ADMIN_KEY` | passphrase for the admin portal at /admin (a long random string; keep it private) |
| `STORE_SECRET` | long random string, the SAME value on the store and on each subject site |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (Vercel Storage) |
| `STUDENT_DOMAIN` | optional, default `vitstudent.ac.in` |
| `PRICE_BACHY105`, `PRICE_BAEEE101`, `PRICE_BAENG101` | optional price in paise (default: 1000 (₹10) for each; minimum 100). Keep these equal to each subject site's own price |

## Local
```
npm install
npm run dev:local               # http://127.0.0.1:4321 : pages + api/ + in-memory Redis, DEV_LOGIN on
npm run build && npm run preview # the production build (dist/) plus api/ on :4180
node tools/legal.js              # regenerates the terms, privacy, refund and contact pages (public/)
```
The site is Astro (static output, `src/` → `dist/`); `api/` stays plain Vercel functions (CommonJS, so package.json has no `"type": "module"`). Old pages that are not ported yet (admin, review, legal) are served as they are from `public/`. `legacy/` holds the old home page for reference while its checkout code is moved over; delete it before launch.

## Adding a subject
1. `api/_lib.js` PRODUCTS: add one line (`CODE: { name, tag, site, price }`). The first three subjects show on the page as usual; once there are more, a search box finds the rest by code or name. `tag` is an optional label that search also matches.
2. `src/data/subjects.mjs`: add the blurb, nicknames, modules and Pro list. The build stops with a clear message if this list and PRODUCTS disagree.
3. Link the subject site: `node tools/link-subject.js <repo> <CODE> "<name>"`, then set `STORE_URL` and `STORE_SECRET` on it.
The home tiles, search, marquee and counts all follow these two lists. Site-wide settings (SITE_URL, support email, footer links) are in `src/data/site.mjs`.

## Renaming the store
`node tools/rebrand.js --name "Notix" --domain notix.in` is a dry run; add `--write` to apply it (name, address, reviewer username, legal pages). Then do the steps it prints (Vercel domain, Google origins, Razorpay website and brand name and webhook, `STORE_URL` on every subject site).

## Alerts and backups

Set these in Vercel (Project, Settings, Environment Variables). Everything is optional; with nothing set, nothing is sent.

| Variable | What for |
| --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram messages to you. In Telegram message @BotFather, send /newbot, pick a name, and copy the token it gives. Then open your new bot and press Start (send it any message), and message @userinfobot to get your numeric chat id |
| `RESEND_API_KEY`, `OWNER_EMAIL` | The weekly backup email. Free key from resend.com; OWNER_EMAIL must be the email of that Resend account |
| `CRON_SECRET` | Any long random text. Vercel sends it with the scheduled jobs so only Vercel can start them |

What you get: an instant Telegram message when a store page crashes (once an hour per problem, 8 an hour at most); a daily check of the store, its database, Razorpay and the three sites (a message only if something is wrong); and every Monday a Telegram summary of the week plus an email with a JSON backup of all payments, refunds and sign-ins.
Try a job by hand (replace KEY with your ADMIN_KEY): `/api/cron?job=check&key=KEY` or `/api/cron?job=weekly&key=KEY`.
