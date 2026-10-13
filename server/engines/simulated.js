// DEMO ONLY. Writes realistic-looking fake AI answers so the app can be explored for free.
// Every answer made here is stored with simulated = 1 and labelled "Simulated data" everywhere.
import { BRAND_LIBRARY } from '../seed/library.js';
import { nameRegex } from '../analysis.js';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const h01 = s => (hash(s) % 1000) / 1000;

const LOCAL_BRANDS = {
  FI: ['Veikkaus', 'Paf'], SE: ['Svenska Spel', 'ATG', 'ComeOn'], UK: ['bet365', 'William Hill'],
  DE: ['Tipico', 'Interwetten'], GLOBAL: ['bet365', 'Mr Green'],
};
const EXTRA_BY_CATEGORY = {
  operator: ['Casumo', 'Mr Green', 'Videoslots', 'Rizk'],
  platform: ['Kambi', 'Gaming Innovation Group', 'BetConstruct', 'Slotegrator'],
  studio: ['NetEnt', 'Push Gaming', 'Yggdrasil', 'ELK Studios', 'Thunderkick'],
};

const SOURCES = {
  FI: ['bonusetu.com', 'kasinohai.com', 'askgamblers.com', 'yle.fi', 'poliisi.fi', 'peluuri.fi', 'reddit.com', 'suomi24.fi', 'hs.fi'],
  SE: ['johnslots.com', 'casinofeber.se', 'spelinspektionen.se', 'di.se', 'flashback.org', 'casino.guru'],
  UK: ['oddschecker.com', 'trustpilot.com', 'gamblingcommission.gov.uk', 'bbc.co.uk', 'reddit.com', 'askgamblers.com'],
  DE: ['casino.org', 'gluecksspiel-behoerde.de', 'reddit.com', 'casino.guru'],
  GLOBAL: ['askgamblers.com', 'casino.guru', 'trustpilot.com', 'wikipedia.org', 'igamingbusiness.com', 'reddit.com'],
  platform: ['sigma.world', 'igamingbusiness.com', 'egr.global', 'gamingintelligence.com', 'g2.com', 'linkedin.com', 'next.io', 'sbcnews.co.uk'],
  studio: ['slotcatalog.com', 'bigwinboard.com', 'casino.guru', 'igamingbusiness.com', 'reddit.com', 'wikipedia.org', 'sbcnews.co.uk'],
};

const PHRASES = {
  operator: {
    pos: ['is known for fast withdrawals and a strong mobile app', 'is a trusted, long-established brand with a wide range of games',
      'is praised for its live casino and smooth user experience', 'is popular with Nordic players thanks to quick payouts',
      'is often recommended for its reliable customer support'],
    neu: ['offers casino, live casino and sports betting', 'holds several European licences', 'has a standard welcome offer and a large game library',
      'operates multiple brands across Europe', 'covers most major sports and markets'],
    neg: ['has some complaints about slow verification and withdrawal delays', 'has faced regulatory fines in the past',
      'has bonus terms that are criticised as confusing', 'has mixed reviews for customer support'],
  },
  platform: {
    pos: ['is a leading platform with strong compliance tooling', 'offers a flexible, modular platform and fast time to market',
      'is well known for robust multi-jurisdiction licensing support', 'is praised for its large game aggregation library'],
    neu: ['provides a turnkey and white-label casino platform', 'includes game aggregation and payment integrations',
      'serves operators in several regulated markets', 'offers both casino and sportsbook modules'],
    neg: ['can be expensive for smaller operators', 'has limited customisation on its standard package', 'has slow integration timelines according to some operators'],
  },
  studio: {
    pos: ['is known for innovative, high-volatility slots', 'is a market leader with high-quality games',
      'is popular for its strong hit titles and bonus-buy features', 'is praised for creative maths and design'],
    neu: ['produces video slots for regulated markets', 'has a large portfolio of slots and table games', 'releases new titles every month'],
    neg: ['makes games some players find too volatile', 'has older titles that feel outdated', 'has limited availability in some regulated markets'],
  },
};

const INTROS = [
  'Here are some of the most frequently recommended options{where}, based on reviews, licensing and player feedback:',
  'Several brands stand out{where}. A quick overview:',
  'There is no single best choice, but these names come up most often{where}:',
  'Based on current reviews and industry coverage{where}, these are worth looking at:',
];
const WHERE = { FI: ' for Finland', SE: ' for Sweden', UK: ' in the UK', DE: ' for Germany', GLOBAL: '' };
const CLOSINGS = {
  FI: 'Note: Finland is moving from the Veikkaus monopoly to a licensing system, with licensed operators expected to start in July 2027. Gamble responsibly — help is available from Peluuri.',
  SE: 'Only use sites licensed by Spelinspektionen. Help is available from Stödlinjen.',
  UK: 'Only use UKGC-licensed operators. Set deposit limits; help is available from GamCare and BeGambleAware.',
  DE: 'Only use operators on the GGL whitelist. Play responsibly.',
  GLOBAL: 'Always check that an operator is licensed where you live, and gamble responsibly.',
};

// brands: tracked brands in the project [{id, name, aliases, is_own, domain}]
export function simulateAnswer({ prompt, engine, day, brands, category, projectId }) {
  const seed = hash(`${projectId}|${prompt.id}|${engine}|${day}`);
  const r = rng(seed);
  const daysAgo = Math.max(0, Math.round((Date.now() - new Date(day + 'T12:00:00Z')) / 86400000));
  const country = prompt.country || 'GLOBAL';

  // Candidate brands: tracked ones + a few untracked ones the "AI" also likes to mention.
  const lib = new Map(BRAND_LIBRARY.map(b => [b.name, b]));
  const extras = [...(category === 'operator' ? LOCAL_BRANDS[country] || [] : []), ...EXTRA_BY_CATEGORY[category]]
    .filter(n => !brands.some(b => b.name === n)).map(n => ({ name: n, domain: lib.get(n)?.domain, untracked: true }));
  const pool = [...brands, ...extras];

  // Citations: a mix of review sites, news, forums, regulators and brand websites.
  const srcPool = category === 'operator' ? SOURCES[country] : SOURCES[category];
  const n = { perplexity: 5, gemini: 4, chatgpt: 3, claude: 3 }[engine] + Math.floor(r() * 3);
  const citations = [];
  const shuffled = [...srcPool].sort(() => r() - 0.5);
  for (const d of shuffled.slice(0, n)) citations.push({ url: `https://${d}/${slug(prompt.topic)}-${country.toLowerCase()}`, title: `${prompt.topic || 'Guide'} — ${d}` });
  // Some review sites rarely mention the own brand: that creates a believable gap to act on.
  const antiOwn = citations.filter(c => h01(new URL(c.url).hostname + 'gap') < 0.4).length;

  const weightOf = b => {
    let w = 0.5 + 0.35 * h01(b.name + 'base');
    w *= 0.75 + 0.5 * h01(b.name + engine);             // each engine has its favourites
    if (b.untracked) w *= 0.7;
    if (b.is_own) {
      // Own brand is weaker at first, and improves over the last ~45 days (shows "progress" in the demo).
      const progress = 1 / (1 + Math.exp((daysAgo - 40) / 7));
      w = (0.42 + 0.33 * progress + 0.12 * h01(b.name + engine)) * Math.pow(0.85, antiOwn);
    }
    return w * (0.35 + 1.1 * r());
  };

  // Brands named in the question itself are always discussed.
  const forced = pool.filter(b => { const re = nameRegex([b.name, ...(b.aliases || [])]); return re && re.test(prompt.text); });
  const count = /Regulation|Licensing/.test(prompt.topic || '') && r() < 0.35 ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 4);
  const ranked = pool.filter(b => !forced.includes(b)).map(b => ({ b, w: weightOf(b) })).sort((a, b) => b.w - a.w);
  const chosen = [...forced, ...ranked.slice(0, Math.max(0, count - forced.length)).filter(x => x.w > 0.3).map(x => x.b)];

  const phrases = PHRASES[category];
  const lines = chosen.map((b, i) => {
    const mood = h01(b.name + 'tone') + (r() - 0.5) * 0.6;
    const set = mood > 0.62 ? phrases.pos : mood < 0.2 ? phrases.neg : phrases.neu;
    return `${i + 1}. **${b.name}** ${pick(r, set)}.`;
  });
  const where = category === 'operator' ? WHERE[country] : WHERE[country] || '';
  const text = [
    pick(r, INTROS).replace('{where}', where), '', ...lines, '',
    category === 'operator' ? CLOSINGS[country] : 'Shortlist two or three and ask each for references from operators in your target markets.',
  ].join('\n');

  for (const b of chosen) {
    const p = b.is_own ? 0.12 : 0.3;
    if (b.domain && r() < p) citations.push({ url: `https://www.${b.domain}/${slug(prompt.topic)}`, title: `${b.name} — ${prompt.topic}` });
  }
  return { text, citations, model: 'simulated' };
}

const slug = s => (s || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
