# Going live — plain-English guide

You do the clicking; nothing here needs a terminal. Do the parts in order. Each part is short.

---

## Part A — Put the app online (hosting)

We use **Railway** (railway.com). Why: it builds the app straight from your GitHub project, keeps your data on a disk that survives restarts, runs the daily checks around the clock, and gives you a free web address.

**Cost:** about **$5 a month** (Hobby plan, which includes $5 of usage). This small app should fit in that, maybe a few dollars more. Railway may ask for a card.

1. Go to **railway.com** and click **Login → Continue with GitHub**. Approve access.
2. Click **New Project → Deploy from GitHub repo**. Pick **AITracker**. If you don't see it, click "Configure GitHub App" and give Railway access to that repository.
3. Railway starts building. Click the new box (the "service"), then **Settings → Source**, and set **Branch** to `claude/igaming-ai-analytics-wxj8uh` (or `main` once the work is merged there).
4. Add the disk for your data: in the project canvas, right-click the service (or press Ctrl/Cmd + K) and choose **Add Volume**. Set the **mount path** to `/data`.
5. Open the service's **Variables** tab → **New Variable**: name `SETUP_CODE`, value = a long secret you invent (e.g. 4 random words). Write it down.
6. Open **Settings → Networking → Generate Domain**. You get an address like `ai-tracker-production.up.railway.app`.
7. Wait until the deploy shows **Active** (2–5 minutes). Open the address. You'll see "Create the first account". Enter the setup code, your name, email and a password.

That's it. The login page protects everything: nobody can see anything without an account. Invite colleagues in **Settings → Team**.

**Custom domain (optional):** a name like `tracker.yourcompany.com` costs about **€10–20 per year** from a domain shop (e.g. Cloudflare, Namecheap). Railway connects it for free (Settings → Networking → Custom Domain, then copy one record into your domain shop). You only need it when you want a branded link for clients. For demos the free Railway address is fine.

---

## Part B — Get API keys (one per AI engine)

You can start with just one engine. Each needs an account, a payment card and some prepaid credit. In the app, **Settings → AI engines → "How do I get this key?"** shows the same steps next to each box.

| Engine | Where | Steps |
|---|---|---|
| ChatGPT | platform.openai.com | Log in → Settings → Billing → add card, buy $10 → API keys → Create new secret key → copy (starts `sk-`) |
| Gemini | aistudio.google.com | Log in → Get API key → Create API key → "Set up billing" to go beyond the free tier → copy (starts `AIza`) |
| Perplexity | perplexity.ai/account/api | Log in → API → add card, buy credit → Generate API key → copy (starts `pplx-`) |
| Claude | console.anthropic.com | Log in → Settings → Billing → buy $10 → API keys → Create key → copy (starts `sk-ant-`) |

Paste each key into **Settings → AI engines**, click **Save**, then **Test** (costs about one answer, a cent or so).

**Also set a spending limit inside each provider's billing page.** That is your real safety net.

---

## Part C — Check the cost, set the cap, switch on

1. **Settings → Costs & limits** shows the estimated monthly cost for every project **before** anything real runs.
2. Type a **monthly cap** (for example $50) and Save. With no cap, real checks will not run at all.
3. **Settings → Mode & backups → Live**. New projects now use real answers.
4. For a demo project you want to make real: open it → **Project settings → Switch this project to real data**. Simulated answers are removed (a backup is made first).

**Rough monthly cost** (list prices, October 2026; estimates, not quotes):

| Setup | Answers / month | Rough cost |
|---|---|---|
| 20 questions × 4 engines, every day | 2,400 | $40–100 |
| 40 questions × 4 engines, every day | 4,800 | $80–200 |
| 40 questions × 4 engines, every 3 days | 1,600 | $25–70 |
| 40 questions × ChatGPT + Perplexity only, daily | 2,400 | $25–40 |

Claude (with the default top model) is the most expensive engine per answer. You can pick a cheaper model in Settings, but the answers may differ more from the Claude app.

---

## What was tested, and what wasn't

- **Tested for real:** the whole app in demo mode (every page, the setup wizard, reports, PDF printing, exports, login, invites, light/dark, phone size), the answer analysis, the spending cap, the production build and the setup-code protection.
- **Tested against a fake server only:** the code that talks to OpenAI, Google, Perplexity and Anthropic. The fake server returns answers shaped like each company's documentation. The first time you press **Test** with a real key is the first real call. If a provider has changed something, the Test button will show the error message — send it to your builder.
- **Perplexity:** they replaced their older "Sonar" API with an "Agent API" in September 2026. We use the new one; it is the least certain connection.

## Limits and risks to know

- **API ≠ app.** The API answers come from the same models as the consumer apps, but the apps add personalisation, memory and their own instructions. Treat the numbers as a strong signal, not an exact copy of what each person sees.
- **Answers vary.** The same question can get a different answer tomorrow. That is why we ask daily and show trends, not single answers.
- **Sentiment is a rough guide.** It uses a word list (English, plus some Finnish, Swedish and German words), not a human reading.
- **No demand score.** No AI company publishes how often a question is asked, so we don't show an invented one.
- **Copilot, Google AI Mode and AI Overviews are not covered** — no official API. We won't scrape.
- **Gambling marketing rules.** The tool only measures. But the actions you take must follow each market's rules (Finland's new Gambling Act has strict marketing limits; the UK, Sweden and Germany have their own). Never fake reviews, never pose as a customer, label paid listings.
- **Keys are stored in the app's database** on your Railway disk. Only admins can change them, and only the last 4 characters are shown again.
