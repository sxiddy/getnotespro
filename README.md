# Notes Pro (store), https://getnotespro.vercel.app

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
node tools/fakeredis.js          # in-memory Redis on :5288
UPSTASH_REDIS_REST_URL=http://localhost:5288 UPSTASH_REDIS_REST_TOKEN=x SESSION_SECRET=x STORE_SECRET=x DEV_LOGIN=1 node tools/serve.js 4180
node tools/legal.js              # regenerates the terms, privacy, refund and contact pages
```

## Adding a subject
1. `api/_lib.js` PRODUCTS: add one line (`CODE: { name, tag, site, price }`). The first three subjects show on the page as usual; once there are more, a search box finds the rest by code or name. `tag` is an optional label that search also matches.
2. `app/js/store.js` INFO: add the blurb and the list of Pro tools for that subject (an `ICON` entry is optional).
3. Link the subject site: `node tools/link-subject.js <repo> <CODE> "<name>"`, then set `STORE_URL` and `STORE_SECRET` on it.
The cards, search and filters, the "Read free" links, the footer list and the subject count all follow PRODUCTS. Live previews in `app/js/ui.js` (DEMOS) only show for subjects that exist.

## Renaming the store
`node tools/rebrand.js --name "Notix" --domain notix.in` is a dry run; add `--write` to apply it (name, address, reviewer username, legal pages). Then do the steps it prints (Vercel domain, Google origins, Razorpay website and brand name and webhook, `STORE_URL` on every subject site).
