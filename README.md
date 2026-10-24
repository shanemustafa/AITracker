# Housedge

*Give your brand the house edge in AI answers.*

Tracks how AI assistants (ChatGPT, Gemini, Perplexity, Claude) talk about brands, for any business, with a specialty in iGaming. Think "Google Analytics, but for what AI says about a brand".

It **measures and advises**. It never tries to change what AI models say, never posts reviews, and never promises better rankings. It asks real questions through official APIs and records the answers.

## What it does

- **Guided setup**: discovery → brand → competitors → questions → engines → first run, with results in minutes.
- **Headline numbers** per brand: Visibility (% of answers that mention it), Position (average rank, 1 = first), Sentiment (0–100 tone), Share of voice — each with change vs the previous period.
- **Charts**: trends, share of voice over time, competitor ranking, visibility-vs-sentiment map, per-engine and per-country comparison.
- **Questions**: general starter questions for any business (written from what the client offers), plus 40 pre-written iGaming questions (Finland first, plus Sweden, UK, Germany, global), bulk add, tags, topics, country, language, pause, delete.
- **Competitor suggestions**: brands the AI keeps naming that you don't track yet, added with one click (history is recounted).
- **Sources**: which websites the AI cites, grouped by type (review sites, forums, news, regulators, your site, competitor sites).
- **Chats**: the real answers, with brands highlighted.
- **AI readiness**: a website check (can AI crawlers read the client's site: robots.txt rules for AI crawlers, structured data, text readable without JavaScript, sitemap, llms.txt) and a fact check (Claude compares real answers with facts the client confirmed and flags contradictions).
- **Suggested actions**: prioritised, plain-English ideas, each with its evidence.
- **Client journey**: six visible stages per project — Discovery, Setup, First run, First report, Recommendations, Ongoing tracking.
- **Reports**: frozen snapshots ("reveal" report, then monthly progress reports), printable to PDF.
- **Exports**: CSV downloads, a token-protected API, Google Sheets (`IMPORTDATA`) and Looker Studio (via the sheet).
- **Team**: logins, invite links, admin/member roles.
- **Daily automatic runs** plus a "Run now" button, a **monthly spending cap**, and automatic backups.
- Apple-style design: system font, large titles, frosted-glass menus, light and dark mode.
- **Public website** at `/` for visitors (the app is behind **Sign in**): what the service does, how it works, FAQ and a contact form. Messages land in **Enquiries** inside the app. No invented customers, quotes or numbers; the product picture is a labelled illustration.
- **Legal pages**: Privacy policy, Terms of use and Legal notice (public), filled from Settings → Company & legal. No tracking cookies, no third-party fonts or scripts, security headers, hidden from search engines.

## Engines

| Engine | Supported? | How |
|---|---|---|
| ChatGPT | Yes | OpenAI Responses API + web search tool |
| Gemini | Yes | Gemini API + Grounding with Google Search |
| Perplexity | Yes | Perplexity Agent API (official) |
| Claude | Yes | Anthropic Messages API + web search tool |
| Microsoft Copilot | No | No public API returns Copilot's answers; Bing Search API retired Aug 2025 |
| Google AI Mode | No | No official API; only reachable by scraping Google |
| Google AI Overviews | No | No official API; only reachable by scraping Google |

API answers come from the same model families as the consumer apps but are not identical to what one person sees in the app.

## Demo mode

With `SEED_DEMO=1` the app starts in **demo mode** with three example projects (LeoVegas, Finnplay, Hacksaw Gaming). All demo answers are **simulated** and labelled as such on every screen, in every export (`simulated` column, `SIMULATED-DATA-` file names) and in every report (banner + watermark).

## Running it on a computer

```
npm install
npm run build
npm start          # http://localhost:3000
npm test           # automated tests
```

Data lives in `data/app.db` (or the folder in `DATA_DIR`). Backups go to `data/backups/`.

## Settings via environment variables (optional)

| Variable | Purpose |
|---|---|
| `SETUP_CODE` | **Required in production** (16+ characters). Creates the first (admin) account and resets forgotten passwords. |
| `SEED_DEMO` | Set to `1` to load the three simulated demo clients on a new installation. Leave unset for a real installation. |
| `DATA_DIR` | Where the database and backups are stored (use a persistent disk). |
| `PORT` | Web port (default 3000). |
| `KEY_OPENAI`, `KEY_GEMINI`, `KEY_PERPLEXITY`, `KEY_ANTHROPIC` | API keys, if you prefer not to paste them in Settings. |

Security and key rotation: [docs/SECURITY.md](docs/SECURITY.md). Every variable name is listed in `.env.example`.

See [docs/GOING_LIVE.md](docs/GOING_LIVE.md) for the step-by-step guide to connecting the real AI services and publishing online.
