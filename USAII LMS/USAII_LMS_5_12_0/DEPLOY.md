# Deploying USAII Intuitive LMS 5.12.0

## Why changes used to disappear after 10 to 30 minutes

Earlier versions kept everything in a file (`data/db.json`) and an `uploads/` folder on the server's own
disk. Sandbox and free hosts give an app a throwaway disk: it is wiped whenever the app restarts, is
redeployed, or goes to sleep after a quiet period. On waking, the file was gone, so the LMS built its
starting data again. The sign-in secret was lost the same way, which signed everyone out.

5.11 fixes this at the root:

- With `DATABASE_URL` set, all data **and** all uploaded files live in PostgreSQL.
- In production, the LMS **refuses to start** unless `DATABASE_URL` or `DATA_DIR` is set, so data can
  never again sit on a throwaway disk without anyone noticing.
- During a redeploy the new server waits until the old one has saved and stopped, then takes over.
  Nothing written in between is lost, and learners stay signed in.

## Option A (recommended): any Node host + PostgreSQL

Works on Render, Railway, Fly.io, Hostinger's Node.js hosting, and similar.

1. Create a PostgreSQL database (Neon, Supabase, Render PostgreSQL, Railway PostgreSQL...). Copy its
   **direct** connection string (not a "pooled" or "transaction mode" one: the LMS holds a lock on one
   connection to make sure only one server writes at a time). Check that your database plan does not
   expire or delete data after a trial period.
2. Put this folder in a Git repository and connect it to the host.
3. Settings on the host:
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Node version: 20 or newer
   - Health check path: `/api/health`
   - Run **one** instance (no auto-scaling to several copies).
4. Environment variables (see `.env.example` for all of them). The essentials:
   - `DATABASE_URL`, `NODE_ENV=production`, `PUBLIC_URL`, `TRUST_PROXY=1`
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (your owner account, created on the first start)
   - `SUPPORT_EMAIL`
   - `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` (automatic evaluation of capstones)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (the sender of password reset codes,
     receipts and other emails; check with Payments & Email → Send test email)
   - your payment gateway keys (or enter them later in Payments & Email), and each gateway's webhook
     (the URLs are shown in Payments & Email). The receiving bank account is set in the gateway's own
     dashboard, not in the LMS.
5. Deploy. Open `https://your-site/api/health`: it must say `"status":"ok"` and `"storage":"postgres"`.

Uploaded files are stored in the database in 1 MB pieces, and videos stream with seeking. For long
course videos, unlisted YouTube or Vimeo links keep the database small; the five Course 1 videos
(13 to 17 MB each) are fine to upload directly.

## Option B: a VPS with its own disk (for example a Hostinger VPS)

1. Install Node 20+, copy this folder to the server, run `npm ci && npm run build`.
2. Create a data folder outside the app folder: `sudo mkdir -p /var/lib/usaii-lms && sudo chown $USER /var/lib/usaii-lms`.
3. Set `DATA_DIR=/var/lib/usaii-lms/data` (uploads go to `DATA_DIR/uploads`), plus the other settings.
4. Keep it running with a process manager, for example `pm2 start server.js --name usaii-lms` and `pm2 save`.
5. Put Nginx or Caddy in front for HTTPS, and set `TRUST_PROXY=1`.
6. Back up `/var/lib/usaii-lms` daily (it is the whole LMS).

You can also use `DATABASE_URL` on a VPS. If you move from a file to PostgreSQL later, the first start
with `DATABASE_URL` imports the existing `db.json` automatically.

## After deploying

1. Sign in with `SEED_ADMIN_EMAIL`. Without `SEED_ADMIN_PASSWORD` a one-time password is printed in the
   host's log on the first start; choose your own on first sign-in.
2. Payment Settings: confirm the gateway and set its webhook to `https://your-site/api/payments/webhook/<gateway>`.
3. Follow the launch checklist in README.md.

## Health and logs

`/api/health` shows `status` (`starting` for a few seconds while data loads or during a hand-over),
`storage` and `files`. Log lines start with `[db]`, `[evaluator]`, `[migrate]`, `[mail]` or `[ai]`.

## Running on plain http (no SSL certificate)

The LMS works on http, but browsers switch some features off on http pages. 5.13.2 handles them:
uploaded videos open, transcripts translate on the server, and Copy buttons work. Check these too:

- **Web server in front (nginx, Apache, hosting panel).** Pass the real scheme, not a fixed "https":
  `proxy_set_header X-Forwarded-Proto $scheme;` (nginx). Allow large video uploads:
  `client_max_body_size 1024m;` (nginx) or the panel's upload limit.
- **Serve the LMS at the top of its address** (for example `http://SERVER:4600/` or `http://learn.example.com/`),
  not under a folder such as `/lms/`: video and file links start with `/uploads/`.
- **Video files:** MP4 with H.264 video and AAC audio plays in every browser. MOV files from phones often use
  HEVC, which Chrome and Edge on Windows cannot play: convert those to MP4 first.
- **Best:** add a free certificate (Let's Encrypt) and use https. Then the browser's own features work as well.

