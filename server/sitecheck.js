// AI-readiness check of a client's own website: can AI assistants find, read and quote it?
// Reads at most 4 public files (home page, robots.txt, sitemap.xml, llms.txt). Nothing is changed on the site.
import { safeGet } from './safefetch.js';

// AI crawlers and what blocking them means. "search" bots fetch pages to answer questions right now;
// "training" bots collect pages to train future models — blocking those is a business choice, not an error.
const BOTS = [
  { ua: 'OAI-SearchBot', who: 'ChatGPT search', kind: 'search' },
  { ua: 'ChatGPT-User', who: 'ChatGPT (when a user asks it to open a page)', kind: 'search' },
  { ua: 'Claude-SearchBot', who: 'Claude search', kind: 'search' },
  { ua: 'Claude-User', who: 'Claude (when a user asks it to open a page)', kind: 'search' },
  { ua: 'PerplexityBot', who: 'Perplexity', kind: 'search' },
  { ua: 'Googlebot', who: 'Google Search and Gemini answers', kind: 'search' },
  { ua: 'Bingbot', who: 'Bing and Microsoft Copilot', kind: 'search' },
  { ua: 'GPTBot', who: 'OpenAI model training', kind: 'training' },
  { ua: 'ClaudeBot', who: 'Anthropic model training', kind: 'training' },
  { ua: 'Google-Extended', who: 'Google Gemini training', kind: 'training' },
];
const ORG_TYPES = /^(Organization|Corporation|LocalBusiness|OnlineBusiness|OnlineStore|FinancialService|BankOrCreditUnion|Store|ProfessionalService|SoftwareApplication|MobileApplication|NGO|EducationalOrganization)$/i;

// robots.txt: is the whole site ("/") blocked for this crawler?
export function robotsBlocks(robots, ua) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of String(robots || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else if (cur && (key === 'allow' || key === 'disallow')) { cur.rules.push({ key, val }); lastWasAgent = false; }
    else lastWasAgent = false;
  }
  const mine = groups.filter(g => g.agents.includes(ua.toLowerCase()));
  const use = mine.length ? mine : groups.filter(g => g.agents.includes('*'));
  const rules = use.flatMap(g => g.rules);
  const blocksRoot = rules.some(r => r.key === 'disallow' && r.val === '/');
  const allowsRoot = rules.some(r => r.key === 'allow' && (r.val === '/' || r.val === '/$'));
  return blocksRoot && !allowsRoot;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
};
const decode = s => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

export function analyseHtml(html) {
  const metas = (html.match(/<meta\b[^>]*>/gi) || []).map(t => ({ name: (attr(t, 'name') || attr(t, 'property') || '').toLowerCase(), content: attr(t, 'content') || '' }));
  const meta = n => metas.find(m => m.name === n)?.content;
  const types = [];
  let orgName = null, sameAs = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = [data].flat().flatMap(d => (d && d['@graph'] ? d['@graph'] : [d]));
      for (const n of nodes) {
        for (const t of [n?.['@type']].flat().filter(Boolean)) {
          types.push(String(t));
          if (ORG_TYPES.test(String(t))) { orgName = orgName || n.name; sameAs = Math.max(sameAs, [n.sameAs].flat().filter(Boolean).length); }
        }
      }
    } catch { types.push('(invalid JSON-LD)'); }
  }
  const text = decode(html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return {
    title: decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim(),
    description: decode(meta('description') || '').trim(),
    robotsMeta: (meta('robots') || '').toLowerCase(),
    lang: (html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i) || [])[1] || '',
    h1: (html.match(/<h1\b/gi) || []).length,
    words: text ? text.split(' ').length : 0,
    scripts: (html.match(/<script\b/gi) || []).length,
    types: [...new Set(types)], orgName, sameAs,
    ogTitle: meta('og:title') || '',
  };
}

const add = (list, id, label, status, detail, fix) => list.push({ id, label, status, detail, ...(fix ? { fix } : {}) });

// base: "https://example.com" (the client's own site). Returns { url, score, checks: [...] }.
export async function runSiteCheck(base) {
  const origin = new URL(base).origin;
  const checks = [];
  let home;
  try { home = await safeGet(origin + '/'); } catch (e) {
    const why = { ENOTFOUND: 'the address does not exist', EAI_AGAIN: 'the address could not be looked up', ECONNREFUSED: 'the server refused the connection',
      ETIMEDOUT: 'the website took too long to answer', ECONNRESET: 'the connection was cut off', EBLOCKED: e.message,
      CERT_HAS_EXPIRED: 'its security certificate has expired', DEPTH_ZERO_SELF_SIGNED_CERT: 'its security certificate is not trusted' }[e.code] || 'the website did not answer normally';
    add(checks, 'reachable', 'Website can be reached', 'fail', `We could not open ${origin}: ${why}.`, 'Check that the website address saved for the brand is correct and that the site is online.');
    return { url: origin, score: 0, checks };
  }
  const ok = home.status >= 200 && home.status < 300;
  add(checks, 'reachable', 'Website can be reached', ok ? 'pass' : 'fail', `The home page answered with status ${home.status} in ${(home.ms / 1000).toFixed(1)} s.`,
    ok ? null : 'Fix the home page so it loads for visitors and crawlers (status 200).');
  const https_ = home.finalUrl.startsWith('https://');
  add(checks, 'https', 'Secure address (https)', https_ ? 'pass' : 'fail', https_ ? 'The site uses https.' : 'The site does not end up on an https address.', https_ ? null : 'Turn on https (a free certificate is available from most hosts) and redirect http to https.');
  if (home.ms > 4000) add(checks, 'speed', 'Loads quickly', 'warn', `The home page took ${(home.ms / 1000).toFixed(1)} s.`, 'Slow pages may be skipped by crawlers. Ask your developer to speed up the home page.');

  const h = analyseHtml(home.body || '');
  const xRobots = String(home.headers['x-robots-tag'] || '').toLowerCase();
  const noindex = /noindex/.test(h.robotsMeta) || /noindex/.test(xRobots);
  add(checks, 'indexable', 'Allowed in search results', noindex ? 'fail' : 'pass', noindex ? 'The home page tells search engines not to list it ("noindex").' : 'No "noindex" instruction found.',
    noindex ? 'Remove the "noindex" setting from the home page, unless the site is meant to be private.' : null);

  // robots.txt and AI crawlers
  let robots = '';
  try { const r = await safeGet(origin + '/robots.txt', { maxBytes: 500_000 }); if (r.status === 200 && !/<html/i.test(r.body)) robots = r.body; } catch { /* missing is fine */ }
  const blocked = BOTS.filter(b => robotsBlocks(robots, b.ua));
  const blockedSearch = blocked.filter(b => b.kind === 'search'), blockedTraining = blocked.filter(b => b.kind === 'training');
  add(checks, 'ai-search-bots', 'AI search crawlers can read the site', blockedSearch.length ? 'fail' : 'pass',
    blockedSearch.length ? `robots.txt blocks: ${blockedSearch.map(b => `${b.ua} (${b.who})`).join(', ')}.` : robots ? 'robots.txt does not block the crawlers AI assistants use to answer questions.' : 'No robots.txt found, so nothing is blocked.',
    blockedSearch.length ? 'Allow these crawlers in robots.txt. While blocked, those assistants cannot read your pages when answering questions about you.' : null);
  add(checks, 'ai-training-bots', 'AI training crawlers', 'info',
    blockedTraining.length ? `Blocked for training: ${blockedTraining.map(b => b.ua).join(', ')}. This is a business choice; it does not stop AI search answers.` : 'Training crawlers are allowed. Blocking them is optional and does not affect AI search answers.');

  add(checks, 'title', 'Page title and description', h.title && h.description ? 'pass' : 'warn',
    h.title ? `Title: "${h.title.slice(0, 90)}"${h.description ? '' : ' (no description)'}` : 'No page title found.',
    h.title && h.description ? null : 'Add a clear page title and a one-sentence description of what the company does and for whom.');
  add(checks, 'h1', 'Main heading', h.h1 >= 1 ? 'pass' : 'warn', h.h1 ? `${h.h1} main heading(s) found.` : 'No main heading (H1) found.', h.h1 ? null : 'Give the home page one main heading that says what you offer.');

  const thin = h.words < 150;
  add(checks, 'no-js', 'Readable without JavaScript', thin ? (h.scripts > 3 ? 'fail' : 'warn') : 'pass',
    thin ? `Only about ${h.words} words are in the page before scripts run.` : `About ${h.words} words are readable without running scripts.`,
    thin ? 'Most AI crawlers do not run JavaScript. Ask your developer to render the main text on the server (server-side rendering or pre-rendering).' : null);

  const hasOrg = h.types.some(t => ORG_TYPES.test(t));
  add(checks, 'schema-org', 'Company facts in structured data', hasOrg ? (h.sameAs ? 'pass' : 'warn') : 'fail',
    hasOrg ? `Found ${h.types.filter(t => ORG_TYPES.test(t)).join(', ')}${h.orgName ? ` for "${h.orgName}"` : ''}${h.sameAs ? `, linked to ${h.sameAs} official profile(s)` : ', but no links to official profiles'}.` : (h.types.length ? `Structured data found (${h.types.join(', ')}), but no Organization.` : 'No structured data (JSON-LD) found.'),
    hasOrg && h.sameAs ? null : 'Add Organization structured data (JSON-LD) with your name, logo, website and "sameAs" links to official profiles. It tells search engines and AI exactly who you are.');
  add(checks, 'faq', 'Questions and answers on the site', h.types.some(t => /FAQPage/i.test(t)) ? 'pass' : 'info',
    h.types.some(t => /FAQPage/i.test(t)) ? 'FAQ structured data found.' : 'No FAQ structured data on the home page.',
    'Optional: an FAQ page answering the questions customers ask AI (fees, safety, who it is for) gives assistants clear text to quote.');
  add(checks, 'lang', 'Language is declared', h.lang ? 'pass' : 'warn', h.lang ? `Language: ${h.lang}.` : 'The page does not say which language it is in.', h.lang ? null : 'Add the language to the page (for example lang="en").');

  // sitemap
  let sitemap = /^\s*sitemap\s*:/im.test(robots);
  if (!sitemap) { try { const r = await safeGet(origin + '/sitemap.xml', { maxBytes: 2_000_000 }); sitemap = r.status === 200 && /<(urlset|sitemapindex)\b/i.test(r.body); } catch { /* none */ } }
  add(checks, 'sitemap', 'Sitemap', sitemap ? 'pass' : 'warn', sitemap ? 'A sitemap was found.' : 'No sitemap found.', sitemap ? null : 'Add a sitemap.xml and mention it in robots.txt so crawlers find all important pages.');

  // llms.txt (emerging, optional)
  let llms = false;
  try { const r = await safeGet(origin + '/llms.txt', { maxBytes: 500_000 }); llms = r.status === 200 && !/<html/i.test(r.body) && r.body.trim().length > 20; } catch { /* none */ }
  add(checks, 'llms-txt', 'llms.txt summary file', 'info', llms ? 'An llms.txt file was found.' : 'No llms.txt file.',
    llms ? null : 'Optional: llms.txt is a new, low-cost way to give AI tools a short summary of your site. Major assistants have not confirmed they use it, so treat it as a small extra.');

  const scored = checks.filter(c => c.status !== 'info');
  const score = Math.round(100 * scored.reduce((s, c) => s + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / (scored.length || 1));
  return { url: origin, score, checks };
}
