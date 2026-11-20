# Plan: move the subject sites to Cloudflare (notix.in)

Sites: Basic Engineering (baeee101), Chemistry (bachy105), English (baeng101), Physics (baphy105).
Not touched: EVS (bachy101, on Render, ends tomorrow). The store (notix.in) is already on Cloudflare.

Each site ends up at `https://<code>.notix.in`, e.g. `https://bachy105.notix.in`.

## Facts this plan is based on (measured, Nov 20 2026)

| Site | Notes data | Protected images | API calls last month (Vercel) | CPU per call (Vercel) |
|---|---|---|---|---|
| Basic Engineering | 2.5 MB (40 free + 39 Pro files) | 1.4 MB, 177 files | 129,835 | ~51 ms |
| Chemistry | 2.4 MB (27 + 30 files) | 5.4 MB, 321 files | 49,098 | ~86 ms |
| English | 2.6 MB (36 + 5 files) | 168 KB, 36 files | 23,199 | ~71 ms |
| Physics | 612 KB (12 + 14 files) | 152 KB, 19 files | 341 | — |

- One visit today = one API call per notes file (5–40) + one per protected image + counters.
- A bundle of the free files is 3–5% smaller than the separate files; Pro bundles 8–12% smaller.
- Building a bundle per request costs 21–42 ms CPU (over Cloudflare's 10 ms free limit), so bundles are built at deploy time.
- Cloudflare free: 100,000 API calls per day **for the whole account** (store + all sites together), 10 ms CPU per call, 5 cron schedules per account.

## Steps

### 1. Safety first
- Work on a new branch in each site's repo; nothing is pushed or deployed until that site's tests pass.
- EVS repo and its Render service: not opened, not changed.
- Old Vercel projects: left as they are (paused until Dec 19) so nothing is lost.

### 2. Cut API calls (in each site's code)
- At deploy time, build: 1 free bundle, and Pro bundles (one per module, so single-module buyers still only get their modules). Bundle names include a content hash (e.g. `free.3f9a1c.js`), so a change in the notes makes a new name and browsers fetch it at once.
- `/api/content` keeps the same checks (signed-in VIT student for free, Pro for Pro) and sends the ready-made bundle. Browser may keep it for a day (safe because of the hash in the name).
- Notes loader in the page asks for 1–8 bundles instead of 5–79 files.
- Visit counter: topic opens sent in one batch when the student leaves, not one call per topic.
- Quiz battle: polls every 1.5 s now; change to every 3 s and stop polling when the tab is hidden.
- Images: unchanged (still behind sign-in, one call each).

### 3. Run each site on Cloudflare
- Same approach as the store: a Worker runs the existing `api/*.js` handlers through the same req/res shim.
- Protected files (bundles, images) go up with the site but under paths that always go through the Worker first, so the Worker checks sign-in/Pro before handing them out. Nobody can fetch them directly. Limits checked: 20,000 files and 25 MB per file allowed; the largest site has ~350 files.
- Code that reads files from disk (`content.js`, `img.js`) reads them from Cloudflare's file store instead.
- The 30-second Payment Link checker (Chemistry's server.js) becomes a scheduled job (see step 4).
- Each site gets its domain `<code>.notix.in` in the same Cloudflare zone.

### 4. One scheduler for everything
- The account allows 5 schedules; store + 4 sites would need 6. So the store keeps one every-minute schedule that runs its own daily/weekly jobs at the right time and pings each site's Payment Link checker (protected by a secret).

### 5. Settings and links
- Secrets per site: Turso and Razorpay are the same values as the store (same database, same Razorpay account) — you paste them once per site; session/cron secrets I generate; `STORE_SECRET` and `ADMIN_KEY` set to the store's values so the store admin page can read each site's numbers.
- `STORE_URL=https://notix.in` on each site, so store purchases unlock Pro.
- Google sign-in: add `https://<code>.notix.in` for each site as an allowed origin.
- Razorpay: nothing changed in settings. Payment Links keep working (they don't need the website approval).

### 6. Protection before advertising
- One rate-limit rule for all of notix.in (the free plan allows one per zone): /api/* limited per IP with a high threshold so a whole hostel on one Wi-Fi IP isn't blocked.
- One firewall rule: block /api/* requests not coming from notix.in pages, except Razorpay's webhook and the scheduler.
- Usage alert: Telegram message when the day's API calls pass 70%.

### 7. Order
1. Physics first (smallest, least traffic) as the trial run.
2. Then Basic Engineering (most traffic), English, Chemistry.
Each site: steps 2–5, then its tests, then it goes live. One at a time.

### 8. Tests (part of each site, before it goes live)
- Signed out: free notes ask for sign-in; Pro bundle refused.
- Signed in, not Pro: free notes load; Pro refused; images load.
- Pro buyer, and single-module buyer: correct notes unlock, others stay locked.
- Payment Link test purchase in test mode (if the site has test keys) or a real ₹ test you approve.
- Change one note, redeploy: the change shows without clearing the browser.
- Measure: API calls per visit (target 4–8), CPU per call on Cloudflare (must stay under 10 ms), page load time before/after on a phone-speed connection.
- EVS check: site, sign-in and payment link still work.

## Cons and how each is handled

| # | Con | How it's handled |
|---|---|---|
| 1 | New code can have bugs | Branch per site, Physics first as trial, full test list (step 8) before each site goes live |
| 2 | Students could see old notes after an update | Content hash in bundle names; tested by changing a note |
| 3 | CPU limit (10 ms per call) | Bundles pre-built; CPU measured on Cloudflare per site; fallback is Workers Paid ($5/month, 30 s per call) |
| 4 | 100K calls/day is shared by all sites + store | Calls per visit cut ~90%; usage alert at 70%; fallback $5/month (10M/month) |
| 5 | Quiz battles poll a lot | Slower polling (3 s) and pause when the tab is hidden |
| 6 | Payment Link Pro grant now up to ~60 s (was 30 s) | Every-minute check, plus the page re-checks when the buyer returns from Razorpay |
| 7 | Only 5 schedules per account | One shared every-minute scheduler in the store |
| 8 | Everyone signs in again once (new address = new cookies) | Unavoidable; one-time |
| 9 | Progress saved only in the browser is tied to the old address | Signed-in students get progress back from their account (`/api/sync`); progress that was never synced can't be carried over |
| 10 | Old `*.vercel.app` links in WhatsApp groups are dead | After Vercel's pause ends (Dec 19), redeploy each old project as a redirect-only site to the new address (redirects use no functions) |
| 11 | Google sign-in rejects new addresses until added | Add all 4 addresses in one go; can take minutes to a few hours to apply, so done early |
| 12 | Shared database limits (Turso) | Current use ~7% of reads, ~13% of writes per month; lighter counters reduce writes further |
| 13 | Pasting secrets 4 times is tedious and error-prone | I open each command for you and check the length of what was pasted, like the store |
| 14 | Downtime | None added: these sites are already down; each goes live only after passing tests |
| 15 | Free-notes login wall | Kept exactly as now |

## Not in this plan
- EVS (ends tomorrow).
- Upcoming CSE/Maths sites (set up the same way when they launch).
