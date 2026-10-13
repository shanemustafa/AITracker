// Reads one AI answer and works out: which brands it mentions, their order, the tone, and the cited sources.
import { BRAND_LIBRARY } from './seed/library.js';

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");

// Builds a matcher that finds a name only as a whole word ("Relax" must not match "relaxing").
export function nameRegex(names) {
  const parts = names.filter(Boolean).map(n => escapeRe(n.trim())).filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!parts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

function firstIndex(text, re) {
  if (!re) return -1;
  re.lastIndex = 0;
  const m = re.exec(text);
  return m ? m.index : -1;
}

// Some aliases are common words. "Relax" or "Pragmatic" alone only count if written with a capital letter.
const CASE_SENSITIVE_ALIASES = new Set(['relax', 'pragmatic', 'evolution', 'coral', 'paf', 'atg', 'flutter', 'hacksaw']);

function brandMatcher(brand) {
  const names = [brand.name, ...(brand.aliases || [])];
  const loose = names.filter(n => !CASE_SENSITIVE_ALIASES.has(n.toLowerCase()));
  const strict = names.filter(n => CASE_SENSITIVE_ALIASES.has(n.toLowerCase()));
  const looseRe = nameRegex(loose);
  const strictRe = strict.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${strict.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null;
  return text => {
    const a = firstIndex(text, looseRe), b = firstIndex(text, strictRe);
    if (a < 0) return b;
    if (b < 0) return a;
    return Math.min(a, b);
  };
}

// Small, transparent tone word lists. Tone = 0 (very negative) to 100 (very positive), 50 = neutral.
const POSITIVE = [
  'best', 'top', 'trusted', 'reliable', 'reputable', 'excellent', 'great', 'popular', 'leading', 'strong', 'fast',
  'quick', 'safe', 'secure', 'recommended', 'innovative', 'well-known', 'well known', 'award', 'awarded', 'generous',
  'smooth', 'user-friendly', 'easy', 'wide range', 'large selection', 'premium', 'favourite', 'favorite', 'solid',
  'standout', 'stands out', 'praised', 'highly rated', 'high-quality', 'high quality', 'robust', 'flexible', 'market leader',
  'paras', 'parhaat', 'luotettava', 'nopea', 'suosittu', 'turvallinen', 'bästa', 'pålitlig', 'snabb', 'populär',
  'beste', 'zuverlässig', 'schnell', 'beliebt', 'seriös',
];
const NEGATIVE = [
  'complaint', 'complaints', 'slow', 'delay', 'delays', 'delayed', 'fine', 'fined', 'penalty', 'sanction', 'warning',
  'issue', 'issues', 'problem', 'problems', 'poor', 'bad', 'worst', 'avoid', 'unreliable', 'criticised', 'criticized',
  'controversy', 'controversial', 'lacks', 'lacking', 'limited', 'outdated', 'expensive', 'high fees', 'restricted',
  'banned', 'unlicensed', 'negative', 'concerns', 'concern', 'mixed reviews', 'frustrating', 'confusing', 'weak',
  'hidas', 'huono', 'valitus', 'ongelma', 'långsam', 'dålig', 'klagomål', 'langsam', 'schlecht', 'beschwerde',
];
const POS_RE = nameRegex(POSITIVE);
const NEG_RE = nameRegex(NEGATIVE);
const countMatches = (s, re) => { re.lastIndex = 0; return (s.match(re) || []).length; };

export function toneOf(sentence) {
  const p = countMatches(sentence, POS_RE), n = countMatches(sentence, NEG_RE);
  return Math.max(0, Math.min(100, Math.round(50 + 14 * p - 18 * n)));
}

// Split into sentences / list lines so tone is judged next to the brand, not across the whole answer.
function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

const LIBRARY_DOMAINS = BRAND_LIBRARY.map(b => b.domain).filter(Boolean);
const LIBRARY_MATCHERS = BRAND_LIBRARY.map(b => ({ name: b.name, find: brandMatcher(b) }));

// brands: [{id, name, aliases, is_own}] tracked in the project.
export function analyzeAnswer(text, brands) {
  text = text || '';
  const lines = sentences(text);
  const tracked = brands.map(b => ({ ...b, find: brandMatcher(b) }));
  const found = [];
  for (const b of tracked) {
    const idx = b.find(text);
    if (idx >= 0) found.push({ kind: 'tracked', brand: b, idx });
  }
  // Untracked brands that the AI named (from our library) — used for competitor suggestions.
  const trackedNames = new Set(tracked.flatMap(b => [b.name, ...(b.aliases || [])].map(n => n.toLowerCase())));
  const others = [];
  for (const lb of LIBRARY_MATCHERS) {
    if (trackedNames.has(lb.name.toLowerCase())) continue;
    const idx = lb.find(text);
    if (idx >= 0) others.push({ name: lb.name, idx });
  }
  // Bold list items like "1. **Brand**" that we don't know yet also count as possible brands.
  const known = new Set([...trackedNames, ...others.map(o => o.name.toLowerCase())]);
  const boldRe = /^\s*(?:\d+[.)]|[-*•])\s*\*\*([^*\n]{2,40})\*\*/gm;
  let m;
  while ((m = boldRe.exec(text))) {
    const name = m[1].replace(/[:–—-]\s*$/, '').trim();
    if (!known.has(name.toLowerCase()) && /^[A-ZÅÄÖ0-9]/.test(name) && name.split(/\s+/).length <= 4
      && !tracked.some(b => b.find(name) >= 0)) {
      known.add(name.toLowerCase());
      others.push({ name, idx: m.index, unlisted: true });
    }
  }

  // Position = rank by first appearance among every brand the answer names (1 = named first).
  const order = [...found.map(f => f.idx), ...others.map(o => o.idx)].sort((a, b) => a - b);
  const mentions = found.map(f => {
    const rank = order.indexOf(f.idx) + 1;
    const own = lines.filter(l => f.brand.find(l) >= 0);
    const tones = own.map(toneOf);
    const sentiment = tones.length ? Math.round(tones.reduce((a, b) => a + b, 0) / tones.length) : 50;
    return { brand_id: f.brand.id, position: rank, sentiment, snippet: (own[0] || '').slice(0, 400) };
  });
  return { mentions, others: others.map(o => o.name) };
}

// ---------- Sources ----------
export const SOURCE_TYPES = {
  own: 'Your website',
  competitor: 'Competitor website',
  brand: 'Other brands\' websites',
  review: 'Review & comparison sites',
  forum: 'Forums & communities',
  news: 'News & trade media',
  official: 'Regulators & official',
  reference: 'Reference (e.g. Wikipedia)',
  other: 'Other',
};

const DOMAIN_TYPES = {
  review: ['askgamblers.com', 'casino.guru', 'bonusfinder.com', 'oddschecker.com', 'trustpilot.com', 'bettingexpert.com',
    'bonusetu.com', 'kasinohai.com', 'casino.org', 'casinotopsonline.com', 'johnslots.com', 'casinofeber.se',
    'slotcatalog.com', 'bigwinboard.com', 'g2.com', 'gamblingsites.com', 'covers.com', 'legalbet.com', 'kasinot.fi',
    'vegasslotsonline.com', 'casinoreviews.com', 'clutch.co', 'capterra.com', 'casinomeister.com/reviews'],
  forum: ['reddit.com', 'quora.com', 'casinomeister.com', 'suomi24.fi', 'vauva.fi', 'flashback.org', 'stackexchange.com',
    'linkedin.com', 'x.com', 'twitter.com', 'facebook.com', 'youtube.com'],
  news: ['igamingbusiness.com', 'sbcnews.co.uk', 'egr.global', 'gamblinginsider.com', 'yle.fi', 'hs.fi', 'reuters.com',
    'bbc.co.uk', 'bbc.com', 'next.io', 'calvinayre.com', 'sigma.world', 'gamingintelligence.com', 'igamingtoday.com',
    'yogonet.com', 'focusgn.com', 'kauppalehti.fi', 'is.fi', 'iltalehti.fi', 'di.se', 'theguardian.com', 'ft.com',
    'bloomberg.com', 'gambling.com', 'vixio.com', 'igamingfuture.com', 'europeangaming.eu', 'casinobeats.com'],
  official: ['gamblingcommission.gov.uk', 'poliisi.fi', 'spelinspektionen.se', 'gluecksspiel-behoerde.de', 'mga.org.mt',
    'finlex.fi', 'valtioneuvosto.fi', 'stm.fi', 'gov.uk', 'europa.eu', 'peluuri.fi', 'begambleaware.org', 'stodlinjen.se'],
  reference: ['wikipedia.org', 'britannica.com', 'investopedia.com'],
};

export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
}
const matchesDomain = (d, list) => list.some(x => d === x || d.endsWith('.' + x) || (x.includes('/') && d === x.split('/')[0]));
const brandDomains = b => [b.domain, ...(b.extra_domains || [])].filter(Boolean).map(x => x.replace(/^www\./, '').toLowerCase());

export function classifySource(domain, brands) {
  if (!domain) return 'other';
  const own = brands.find(b => b.is_own);
  if (own && matchesDomain(domain, brandDomains(own))) return 'own';
  if (brands.some(b => !b.is_own && matchesDomain(domain, brandDomains(b)))) return 'competitor';
  for (const [type, list] of Object.entries(DOMAIN_TYPES)) if (matchesDomain(domain, list)) return type;
  if (LIBRARY_DOMAINS.some(x => matchesDomain(domain, [x]))) return 'brand';
  if (/\.(gov|gouv)\.|\.gov$/.test(domain)) return 'official';
  if (/forum|community|board/.test(domain)) return 'forum';
  if (/casino|bonus|odds|slots|kasino|betting|bet.*review/.test(domain)) return 'review';
  if (/news|times|post|herald|journal|daily/.test(domain)) return 'news';
  return 'other';
}
