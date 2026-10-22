# Security runbook

Plain-English guide to the app's secrets and what to do after a leak. Values never go in git or in chat.

## Where secrets live

| Secret | Where it is stored | What it protects | How to rotate (no code change) |
|---|---|---|---|
| `SETUP_CODE` | Hosting variables (Railway → service → Variables) | Creating the first admin; resetting a forgotten password | Put a new long random passphrase (16+ characters) in Railway. The app restarts with it. |
| AI provider keys (`KEY_OPENAI`, `KEY_GEMINI`, `KEY_PERPLEXITY`, `KEY_ANTHROPIC`) | Either hosting variables, or pasted in **Settings → AI engines** (stored in the database) | Paying for AI answers | Create a new key in the provider's dashboard, delete the old one there, then paste the new key in Settings (or update the Railway variable). A key saved in Settings wins over a hosting variable. |
| Data API key (`ait_…`) | Database | Read-only access to exported data (Google Sheets, Looker Studio, scripts) | **Settings → API & exports → Make a new key**, then update any spreadsheet formulas. |
| Sign-ins (sessions) | Database, stored only as a hash | Being logged in | **Settings → Team → Sign out everyone**, or set `REVOKE_SESSIONS_BEFORE` in Railway to the current date/time (e.g. `2026-10-22T12:00:00Z`). |
| Passwords | Database, scrypt hash only | Accounts | Each person: **Settings → Team → Change my password** (this signs out their other devices). |

## Startup check

On every start the app logs `Configuration check:` with each variable's **name** and `set / missing / invalid`. It never prints values.
In production it **refuses to start** if `SETUP_CODE` is missing or shorter than 16 characters, or if any of
`OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL`, `GEMINI_BASE_URL`, `PERPLEXITY_BASE_URL` is set (these would send AI keys to another server).
Railway then keeps the previous version running, so a bad setting never goes live.

## After a hosting-provider breach (checklist)

1. Rotate `SETUP_CODE` in Railway.
2. Rotate every AI provider key in the provider's dashboard (delete old keys there). Set a spending limit in each provider dashboard as well.
3. In the app: **Make a new API key**, then **Sign out everyone**.
4. Ask every team member to change their password.
5. In Railway: check the Variables list for anything you did not add (especially `NODE_OPTIONS` or any `*_BASE_URL`), review recent deployments, enable two-factor sign-in, and revoke unused Railway API tokens.
6. In GitHub: Settings → Applications → review the Railway app's access; check the repository for unexpected commits, deploy keys and webhooks.

## Built-in protections

- Security headers (CSP, HSTS, frame blocking, no MIME sniffing, COOP/CORP); https redirect in production.
- No cross-origin API access (no CORS headers); data-changing requests from other websites are rejected.
- Rate limits: 600 API requests/min per address (`API_RATE_LIMIT_PER_MIN`), sign-in 20 per 15 min per address and 8 per account, 20 check runs/hour per person, 10 key tests/hour, 5 contact messages/hour.
- Request bodies limited to 100 kB; every input is type- and length-checked.
- Unexpected errors are logged with a reference number; the browser only sees the reference.
- AI answers are treated as untrusted text: only http/https links are stored or shown; Gemini redirect lookups only contact Google's redirect host.
- Monthly spending cap counts requests still in progress, so parallel requests cannot overshoot it.
- Automated tests: `npm test` (includes `server/tests/security*.test.js`).
