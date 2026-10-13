// Suggested actions: plain-English ideas, each backed by evidence from the tracked answers.
// We only advise. Nothing here promises a ranking change.
import { all } from './db.js';
import { sources, promptTable, summary, suggestions, answerFilter, brandsOf } from './metrics.js';
import { ENGINES } from './engines/index.js';
import { COUNTRIES } from './seed/library.js';

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const PRIORITY = s => (s >= 45 ? 'high' : s >= 20 ? 'medium' : 'low');

const SOURCE_ADVICE = {
  review: d => ({
    title: `Get listed or reviewed on ${d}`,
    steps: [`Check whether ${d} has a page about you, and whether it is accurate and up to date.`,
      'If not, contact their editorial team and offer correct facts (licences, payment times, products).',
      'Follow advertising rules for your markets — no paid fake reviews, and clearly label any paid listing.'],
  }),
  news: d => ({
    title: `Pitch news or data to ${d}`,
    steps: [`AI assistants quote ${d} when answering these questions.`,
      'Offer them real news: market entry, licence news, research or expert comment.'],
  }),
  forum: d => ({
    title: `Be present where people discuss you on ${d}`,
    steps: [`AI answers draw on discussions from ${d}.`,
      'Answer real questions from an official, clearly-labelled account. Never post fake reviews or pose as a customer.'],
  }),
  official: d => ({
    title: `Make sure your official details on ${d} are correct`,
    steps: ['Check your licence and company details listed by the regulator.', 'Make sure your own site links to your licence information.'],
  }),
  reference: d => ({
    title: `Check how you are described on ${d}`,
    steps: [`AI assistants lean on ${d} for basic facts.`, 'If facts are wrong or missing, propose corrections with independent sources (follow the site\'s conflict-of-interest rules).'],
  }),
  other: d => ({ title: `Look at ${d}`, steps: [`${d} is cited in answers where competitors appear but you do not. Check what it says and whether you belong there.`] }),
};

export function computeActions(projectId, f) {
  const brands = brandsOf(projectId);
  const own = brands.find(b => b.is_own);
  if (!own) return [];
  const actions = [];
  const sum = summary(projectId, f);
  const total = sum.totalAnswers;
  if (!total) return [];
  const af = answerFilter(projectId, f);
  const ownStats = sum.brands.find(b => b.is_own);
  const competitors = sum.brands.filter(b => !b.is_own);

  // 1) Sources where competitors show up and you don't.
  const src = sources(projectId, f, 60);
  for (const d of src.domains) {
    if (['own', 'competitor', 'brand'].includes(d.category)) continue;
    const ownShare = d.answers ? d.with_own / d.answers : 1;
    if (d.answers < Math.max(3, total * 0.03) || ownShare > 0.4) continue;
    const comp = all(`SELECT b.name, COUNT(DISTINCT m.answer_id) n FROM mentions m JOIN brands b ON b.id = m.brand_id
      WHERE b.is_own = 0 AND m.answer_id IN (SELECT DISTINCT answer_id FROM citations WHERE domain = ? AND answer_id IN (${af.sql}))
      GROUP BY m.brand_id ORDER BY n DESC LIMIT 3`, d.domain, ...af.params);
    if (!comp.length) continue;
    const advice = (SOURCE_ADVICE[d.category] || SOURCE_ADVICE.other)(d.domain);
    const score = Math.min(100, Math.round((100 * d.answers / total) * 2.2 * (1 - ownShare)));
    const examples = all(`SELECT DISTINCT url, title FROM citations WHERE domain = ? AND answer_id IN (${af.sql}) LIMIT 3`, d.domain, ...af.params);
    actions.push({
      key: `source:${d.domain}`, type: 'source', score, ...advice,
      why: `${d.domain} is cited in ${d.answers} of ${total} answers (${pct(d.answers, total)}%). You are named in only ${d.with_own} of those, while ${comp[0].name} is named in ${comp[0].n}.`,
      evidence: {
        stats: [`Cited in ${d.answers} answers`, `You appear in ${pct(d.with_own, d.answers)}% of them`, ...comp.map(c => `${c.name}: ${pct(c.n, d.answers)}%`)],
        links: examples,
      },
    });
  }

  // 2) Competitor pages that AI cites (their content is doing work yours isn't).
  const ownCites = src.domains.find(d => d.category === 'own')?.answers || 0;
  for (const d of src.domains.filter(x => x.category === 'competitor')) {
    if (d.answers < Math.max(3, total * 0.02) || d.answers <= ownCites) continue;
    const b = brands.find(x => x.domain && d.domain.endsWith(x.domain.replace(/^www\./, '')));
    const pages = all(`SELECT url, title, COUNT(*) n FROM citations WHERE domain = ? AND answer_id IN (${af.sql}) GROUP BY url ORDER BY n DESC LIMIT 3`, d.domain, ...af.params);
    actions.push({
      key: `content:${d.domain}`, type: 'content', score: Math.min(90, Math.round(100 * (d.answers - ownCites) / total * 2.5)),
      title: `${b?.name || d.domain} has pages that AI quotes — create your own equivalent`,
      why: `AI answers cite ${d.domain} ${d.answers} times; your own site is cited in ${ownCites} answers.`,
      steps: ['Open the competitor pages below and note which questions they answer.', 'Publish a clear, factual page on your own site that answers the same questions for your brand.'],
      evidence: { stats: [`${d.domain}: cited in ${d.answers} answers`, `Your site: ${ownCites}`], links: pages },
    });
  }

  // 3) Questions where a competitor dominates and you are missing.
  for (const p of promptTable(projectId, f)) {
    if (!p.active || p.answers < 3 || !p.topBrand) continue;
    const ownVis = p.visibility ?? 0;
    if (p.topBrand.name === own.name || ownVis >= 30 || p.topBrand.visibility < 40) continue;
    actions.push({
      key: `prompt:${p.id}`, type: 'content', score: Math.min(80, Math.round((p.topBrand.visibility - ownVis) * 0.8)),
      title: `Content gap: "${p.text.length > 80 ? p.text.slice(0, 77) + '…' : p.text}"`,
      why: `${p.topBrand.name} appears in ${p.topBrand.visibility}% of answers to this question; you appear in ${ownVis}%.`,
      steps: ['Read a few answers to this question in Chats to see what the AI is looking for.',
        'Make sure your website clearly answers it (facts, licences, numbers), and that the review and news sites AI cites know these facts.'],
      evidence: { stats: [`${p.answers} answers checked`, `You: ${ownVis}%`, `${p.topBrand.name}: ${p.topBrand.visibility}%`], promptId: p.id },
    });
  }

  // 4) Engines where you are much weaker than average.
  const avgVis = ownStats.visibility ?? 0;
  const engines = all(`SELECT DISTINCT engine FROM answers WHERE id IN (${af.sql})`, ...af.params).map(r => r.engine);
  for (const e of engines) {
    const s = summary(projectId, { ...f, engines: [e] });
    const v = s.brands.find(b => b.is_own)?.visibility ?? 0;
    if (s.totalAnswers < 5 || avgVis < 8 || v > avgVis * 0.65) continue;
    const topSrc = sources(projectId, { ...f, engines: [e] }, 5).domains.map(d => d.domain);
    actions.push({
      key: `engine:${e}`, type: 'engine', score: Math.round((avgVis - v) * 1.5),
      title: `You are weaker on ${ENGINES[e]?.label || e}`,
      why: `Your visibility on ${ENGINES[e]?.label || e} is ${v}%, against ${avgVis}% across all engines.`,
      steps: [`This engine leans most on: ${topSrc.join(', ')}.`, 'Start with the source actions above for those websites.'],
      evidence: { stats: [`${ENGINES[e]?.label}: ${v}%`, `All engines: ${avgVis}%`] },
    });
  }

  // 5) Countries where you are weak.
  const countries = all(`SELECT DISTINCT p.country FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE a.id IN (${af.sql})`, ...af.params).map(r => r.country);
  if (countries.length > 1) for (const c of countries) {
    const s = summary(projectId, { ...f, country: c });
    const v = s.brands.find(b => b.is_own)?.visibility ?? 0;
    const leader = [...s.brands].sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0))[0];
    if (s.totalAnswers < 5 || leader.is_own || leader.visibility - v < 25) continue;
    actions.push({
      key: `country:${c}`, type: 'market', score: Math.round((leader.visibility - v) * 0.9),
      title: c === 'GLOBAL' ? 'Low visibility in global (non-country) questions' : `Low visibility in ${COUNTRIES[c] || c}`,
      why: `In ${COUNTRIES[c] || c}, ${leader.name} appears in ${leader.visibility}% of answers; you appear in ${v}%.`,
      steps: ['Check the Sources page filtered to this country to see which local sites AI relies on.', 'Prioritise local review sites, local news and local-language content.'],
      evidence: { stats: [`You: ${v}%`, `${leader.name}: ${leader.visibility}%`, `${s.totalAnswers} answers`] },
    });
  }

  // 6) Negative tone about you.
  const neg = all(`SELECT m.snippet, a.engine, a.day FROM mentions m JOIN answers a ON a.id = m.answer_id
    WHERE m.brand_id = ? AND m.sentiment < 40 AND m.answer_id IN (${af.sql}) ORDER BY a.day DESC LIMIT 200`, own.id, ...af.params);
  if (neg.length >= 3) {
    const uniq = [...new Map(neg.map(n => [n.snippet, n])).values()].slice(0, 3);
    actions.push({
      key: 'sentiment:negative', type: 'reputation', score: Math.min(85, 20 + neg.length),
      title: 'Respond to recurring negative points in AI answers',
      why: `${neg.length} answers describe you in a negative tone.`,
      steps: ['Read the examples below. Are they true today?', 'If fixed, publish clear, dated facts (e.g. payout times) and tell the review sites that repeat the old claim.', 'If still true, this is product feedback.'],
      evidence: { stats: [`${neg.length} negative mentions`, `${pct(neg.length, ownStats.mentions || 1)}% of your mentions`], quotes: uniq.map(n => ({ text: n.snippet, engine: n.engine, day: n.day })) },
    });
  }

  // 7) Brands that keep appearing but are not tracked.
  for (const s of suggestions(projectId, f).slice(0, 3)) {
    if (s.visibility < 8) continue;
    actions.push({
      key: `track:${s.name}`, type: 'tracking', score: Math.round(s.visibility * 0.4),
      title: `Start tracking ${s.name}`,
      why: `${s.name} appears in ${s.visibility}% of answers but is not on your competitor list.`,
      steps: ['Add it on the Competitors page (one click) so it is counted in share of voice.'],
      evidence: { stats: [`${s.answers} answers mention ${s.name}`] }, suggestion: s.name,
    });
  }

  // Keep the list short: the best few of each kind.
  const LIMIT = { source: 6, content: 6, engine: 2, market: 3, reputation: 1, tracking: 3 };
  const used = {};
  actions.sort((a, b) => b.score - a.score);
  const short = actions.filter(a => (used[a.type] = (used[a.type] || 0) + 1) <= (LIMIT[a.type] || 3));

  const statuses = new Map(all('SELECT * FROM action_status WHERE project_id = ?', projectId).map(r => [r.key, r]));
  return short
    .map(a => ({ ...a, priority: PRIORITY(a.score), status: statuses.get(a.key)?.status || 'open', note: statuses.get(a.key)?.note || '', status_at: statuses.get(a.key)?.updated_at }))
    .sort((a, b) => b.score - a.score);
}
