// Brand library. Names checked October 2026 (ownership notes are for context, not shown as fact in reports).
// `featured` = the editable examples offered in setup. The rest help us spot untracked brands in answers.
export const BRAND_LIBRARY = [
  // Operators
  { name: 'Betsson', domain: 'betsson.com', category: 'operator', featured: true, aliases: ['Betsson Group'], note: 'Betsson AB (Sweden).' },
  { name: 'LeoVegas', domain: 'leovegas.com', category: 'operator', featured: true, aliases: ['Leo Vegas'], note: 'LeoVegas Group, owned by MGM Resorts since 2022.' },
  { name: 'Unibet', domain: 'unibet.com', category: 'operator', featured: true, aliases: [], note: 'Part of FDJ United (formerly Kindred Group) since the 2024 FDJ takeover.' },
  { name: 'Entain', domain: 'entain.com', category: 'operator', featured: true, aliases: ['bwin', 'Ladbrokes', 'Coral', 'PartyCasino'], note: 'Group. Consumer brands added as aliases; edit if you only want the group name counted.' },
  { name: 'Flutter', domain: 'flutter.com', category: 'operator', featured: true, aliases: ['Paddy Power', 'Betfair', 'PokerStars', 'Sky Bet'], note: 'Flutter Entertainment. Consumer brands added as aliases; edit as needed.' },
  // Platforms and aggregators
  { name: 'Finnplay', domain: 'finnplay.com', category: 'platform', featured: true, aliases: [], note: 'Finnish-founded iGaming platform provider.' },
  { name: 'SoftSwiss', domain: 'softswiss.com', category: 'platform', featured: true, aliases: ['SOFTSWISS'], note: 'Casino platform and game aggregator.' },
  { name: 'EveryMatrix', domain: 'everymatrix.com', category: 'platform', featured: true, aliases: [], note: 'Platform, aggregation and content provider.' },
  { name: 'Playtech', domain: 'playtech.com', category: 'platform', featured: true, aliases: [], note: 'Platform and content supplier (LSE-listed).' },
  // Game studios
  { name: 'Pragmatic Play', domain: 'pragmaticplay.com', category: 'studio', featured: true, aliases: ['Pragmatic'], note: '' },
  { name: 'Evolution', domain: 'evolution.com', category: 'studio', featured: true, aliases: ['Evolution Gaming'], note: 'Live casino leader; owns NetEnt, Red Tiger, Nolimit City, Big Time Gaming.' },
  { name: 'Hacksaw Gaming', domain: 'hacksawgaming.com', category: 'studio', featured: true, aliases: ['Hacksaw'], note: '' },
  { name: 'Nolimit City', domain: 'nolimitcity.com', category: 'studio', featured: true, aliases: ['NoLimit City'], note: 'Owned by Evolution.' },
  { name: 'Relax Gaming', domain: 'relax-gaming.com', category: 'studio', featured: true, aliases: ['Relax'], note: 'Owned by Kindred, now FDJ United.' },
  { name: "Play'n GO", domain: 'playngo.com', category: 'studio', featured: true, aliases: ["Play'n Go", 'Play n GO', 'PlaynGO'], note: '' },

  // Not featured: used to suggest competitors that appear in answers.
  { name: 'Veikkaus', domain: 'veikkaus.fi', category: 'operator' },
  { name: 'Paf', domain: 'paf.com', category: 'operator' },
  { name: 'bet365', domain: 'bet365.com', category: 'operator' },
  { name: 'Mr Green', domain: 'mrgreen.com', category: 'operator' },
  { name: 'Casumo', domain: 'casumo.com', category: 'operator' },
  { name: 'ComeOn', domain: 'comeon.com', category: 'operator' },
  { name: 'Svenska Spel', domain: 'svenskaspel.se', category: 'operator' },
  { name: 'ATG', domain: 'atg.se', category: 'operator' },
  { name: 'Tipico', domain: 'tipico.de', category: 'operator' },
  { name: 'William Hill', domain: 'williamhill.com', category: 'operator' },
  { name: '888', domain: '888.com', category: 'operator', aliases: ['888casino', '888sport'] },
  { name: 'Videoslots', domain: 'videoslots.com', category: 'operator' },
  { name: 'Rizk', domain: 'rizk.com', category: 'operator' },
  { name: 'Interwetten', domain: 'interwetten.com', category: 'operator' },
  { name: 'Kambi', domain: 'kambi.com', category: 'platform' },
  { name: 'Gaming Innovation Group', domain: 'gig.com', category: 'platform', aliases: ['GiG'] },
  { name: 'BetConstruct', domain: 'betconstruct.com', category: 'platform' },
  { name: 'Altenar', domain: 'altenar.com', category: 'platform' },
  { name: 'Sportradar', domain: 'sportradar.com', category: 'platform' },
  { name: 'Slotegrator', domain: 'slotegrator.pro', category: 'platform' },
  { name: 'NetEnt', domain: 'netent.com', category: 'studio' },
  { name: 'Red Tiger', domain: 'redtiger.com', category: 'studio' },
  { name: 'Big Time Gaming', domain: 'bigtimegaming.com', category: 'studio' },
  { name: 'Yggdrasil', domain: 'yggdrasilgaming.com', category: 'studio' },
  { name: 'Push Gaming', domain: 'pushgaming.com', category: 'studio' },
  { name: 'Thunderkick', domain: 'thunderkick.com', category: 'studio' },
  { name: 'Quickspin', domain: 'quickspin.com', category: 'studio' },
  { name: 'ELK Studios', domain: 'elk-studios.com', category: 'studio' },
  { name: 'Light & Wonder', domain: 'lnw.com', category: 'studio' },
  { name: 'Games Global', domain: 'gamesglobal.com', category: 'studio' },
];

export const CATEGORIES = {
  business: 'Any business',
  operator: 'iGaming operator',
  platform: 'Platform / aggregator',
  studio: 'Game studio',
};

export const COUNTRIES = {
  FI: 'Finland', SE: 'Sweden', UK: 'United Kingdom', DE: 'Germany', GLOBAL: 'Global',
};
export const LANGUAGES = { en: 'English', fi: 'Finnish', sv: 'Swedish', de: 'German' };

// 40 starter questions, written the way real customers or buyers ask AI assistants.
// c = which kind of company the question is for.
export const PROMPT_LIBRARY = [
  // Operators — Finland
  { c: 'operator', country: 'FI', language: 'en', topic: 'Best casinos', text: 'What are the best licensed online casinos for players in Finland?' },
  { c: 'operator', country: 'FI', language: 'fi', topic: 'Best casinos', text: 'Mitkä ovat parhaat nettikasinot Suomessa uuden lisenssijärjestelmän jälkeen?' },
  { c: 'operator', country: 'FI', language: 'en', topic: 'Licensing', text: 'Which betting companies have applied for a Finnish gambling licence?' },
  { c: 'operator', country: 'FI', language: 'en', topic: 'Regulation', text: "How will Finland's new gambling licensing system change which casinos Finnish players can use?" },
  { c: 'operator', country: 'FI', language: 'en', topic: 'Payments', text: 'Which online casino in Finland has the fastest withdrawals?' },
  { c: 'operator', country: 'FI', language: 'fi', topic: 'Sports betting', text: 'Mikä vedonlyöntisivusto on paras jääkiekkoon?' },
  { c: 'operator', country: 'FI', language: 'en', topic: 'Comparison', text: 'Is LeoVegas or Unibet better for Finnish players?' },
  { c: 'operator', country: 'FI', language: 'en', topic: 'Responsible gambling', text: 'Which casinos are the safest and most responsible choice for Finnish players?' },
  // Operators — Sweden
  { c: 'operator', country: 'SE', language: 'sv', topic: 'Best casinos', text: 'Vilka är de bästa licensierade onlinecasinona i Sverige?' },
  { c: 'operator', country: 'SE', language: 'en', topic: 'Sports betting', text: 'Which Swedish-licensed betting sites have the best odds for football?' },
  { c: 'operator', country: 'SE', language: 'en', topic: 'Payments', text: 'Which online casinos in Sweden support BankID and fast payouts?' },
  // Operators — UK
  { c: 'operator', country: 'UK', language: 'en', topic: 'Trust', text: 'What are the most trusted online betting sites in the UK?' },
  { c: 'operator', country: 'UK', language: 'en', topic: 'Mobile', text: 'Which UK online casino has the best mobile app?' },
  { c: 'operator', country: 'UK', language: 'en', topic: 'Sports betting', text: 'Which UK bookmakers are best for horse racing?' },
  // Operators — Germany
  { c: 'operator', country: 'DE', language: 'de', topic: 'Licensing', text: 'Welche Online-Casinos haben eine deutsche GGL-Lizenz?' },
  { c: 'operator', country: 'DE', language: 'en', topic: 'Licensing', text: 'Which sports betting providers are legal in Germany?' },
  // Operators — Global
  { c: 'operator', country: 'GLOBAL', language: 'en', topic: 'Trust', text: 'Which online casino brands are considered the most reputable in Europe?' },
  { c: 'operator', country: 'GLOBAL', language: 'en', topic: 'Responsible gambling', text: 'Which gambling operators have the best responsible gambling tools?' },
  { c: 'operator', country: 'GLOBAL', language: 'en', topic: 'Live casino', text: 'Which online casino has the best live casino section?' },
  { c: 'operator', country: 'GLOBAL', language: 'en', topic: 'Industry', text: 'What are the biggest online gambling companies in Europe?' },

  // Platforms and aggregators (B2B buyers)
  { c: 'platform', country: 'FI', language: 'en', topic: 'Platform choice', text: 'Which iGaming platform is best for launching a casino in the new Finnish regulated market?' },
  { c: 'platform', country: 'FI', language: 'en', topic: 'Compliance', text: "Which casino platform providers are ready for Finland's new licensing regime?" },
  { c: 'platform', country: 'FI', language: 'en', topic: 'Vendors', text: 'Who are the leading Nordic iGaming platform providers?' },
  { c: 'platform', country: 'SE', language: 'en', topic: 'Compliance', text: 'Which iGaming platform providers have strong compliance tools for the Swedish market?' },
  { c: 'platform', country: 'UK', language: 'en', topic: 'Platform choice', text: 'Which turnkey sportsbook and casino platforms are best for the UK market?' },
  { c: 'platform', country: 'DE', language: 'en', topic: 'Compliance', text: 'Which iGaming platform providers are certified for the German market?' },
  { c: 'platform', country: 'GLOBAL', language: 'en', topic: 'Platform choice', text: 'What is the best white-label casino platform for a new operator in Europe?' },
  { c: 'platform', country: 'GLOBAL', language: 'en', topic: 'Comparison', text: 'Compare SoftSwiss, EveryMatrix and Playtech as iGaming platforms.' },
  { c: 'platform', country: 'GLOBAL', language: 'en', topic: 'Buying guide', text: 'What should an operator look for when choosing an iGaming platform?' },
  { c: 'platform', country: 'GLOBAL', language: 'en', topic: 'Aggregation', text: 'Which B2B casino aggregators offer the most game content?' },

  // Game studios
  { c: 'studio', country: 'FI', language: 'en', topic: 'Popularity', text: 'Which slot game providers are most popular in Finland?' },
  { c: 'studio', country: 'FI', language: 'fi', topic: 'Popularity', text: 'Mitkä peliyhtiöt tekevät parhaat kolikkopelit?' },
  { c: 'studio', country: 'FI', language: 'en', topic: 'Licensing', text: 'Which game studios will need a Finnish game software licence from 2027?' },
  { c: 'studio', country: 'SE', language: 'sv', topic: 'Popularity', text: 'Vilka spelleverantörer gör de bästa slotsen?' },
  { c: 'studio', country: 'UK', language: 'en', topic: 'Licensing', text: 'Which casino game providers are licensed in the UK?' },
  { c: 'studio', country: 'DE', language: 'en', topic: 'Popularity', text: 'Which slot providers are popular with German players?' },
  { c: 'studio', country: 'GLOBAL', language: 'en', topic: 'Game types', text: 'Who makes the best high-volatility slots?' },
  { c: 'studio', country: 'GLOBAL', language: 'en', topic: 'Live casino', text: 'Which live casino provider is the best?' },
  { c: 'studio', country: 'GLOBAL', language: 'en', topic: 'Innovation', text: 'Which slot studios are the most innovative right now?' },
  { c: 'studio', country: 'GLOBAL', language: 'en', topic: 'Buying guide', text: 'Which game providers should a new online casino integrate first?' },
];

// Starter questions for any other business. The setup wizard fills in {offer} (what the client sells,
// in the customer's words), {brand} and {where} (the market), so they read like real customer questions.
export const GENERAL_PROMPTS = [
  { topic: 'Best options', t: 'What are the best {offer}{where}?' },
  { topic: 'Best options', t: 'Which {offer} would you recommend{where}, and why?' },
  { topic: 'Trust', t: 'What are the most trusted {offer}{where}?' },
  { topic: 'Price', t: 'What are the most affordable {offer}{where}?' },
  { topic: 'Buying guide', t: 'What should I look for when choosing {offer}?' },
  { topic: 'Comparison', t: 'What are the best alternatives to {brand}?', brand: true },
  { topic: 'Reputation', t: 'Is {brand} any good? What do customers say about it?', brand: true },
  { topic: 'Reputation', t: 'What are the pros and cons of {brand}?', brand: true },
];
