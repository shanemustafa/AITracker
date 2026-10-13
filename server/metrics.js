// Turns stored answers into the numbers shown on screen.
import { all, get, parseJSON } from './db.js';
import { SOURCE_TYPES } from './analysis.js';

const DAY = 86400000;
export const isoDay = d => new Date(d).toISOString().slice(0, 10);

export function brandsOf(projectId) {
  return all('SELECT * FROM brands WHERE project_id = ? ORDER BY is_own DESC, id', projectId)
    .map(b => ({ ...b, aliases: parseJSON(b.aliases, []) }));
}

// Filter = { from, to, engines: [], country, tag, topic }. Returns SQL that selects matching answer ids.
export function answerFilter(projectId, f = {}) {
  const where = ['a.project_id = ?', 'a.error IS NULL'];
  const params = [projectId];
  if (f.from) { where.push('a.day >= ?'); params.push(f.from); }
  if (f.to) { where.push('a.day <= ?'); params.push(f.to); }
  if (f.engines?.length) { where.push(`a.engine IN (${f.engines.map(() => '?').join(',')})`); params.push(...f.engines); }
  if (f.country) { where.push('p.country = ?'); params.push(f.country); }
  if (f.topic) { where.push('p.topic = ?'); params.push(f.topic); }
  if (f.tag) { where.push("EXISTS (SELECT 1 FROM json_each(p.tags) WHERE value = ?)"); params.push(f.tag); }
  if (f.promptId) { where.push('a.prompt_id = ?'); params.push(f.promptId); }
  return { sql: `SELECT a.id FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE ${where.join(' AND ')}`, params };
}

export function parseFilter(q) {
  const days = Number(q.days) || 30;
  const to = q.to || isoDay(Date.now());
  const from = q.from || isoDay(new Date(to + 'T00:00:00Z').getTime() - (days - 1) * DAY);
  return {
    from, to, days,
    engines: q.engines ? String(q.engines).split(',').filter(Boolean) : [],
    country: q.country || '', tag: q.tag || '', topic: q.topic || '',
  };
}
export function previousPeriod(f) {
  const len = Math.round((new Date(f.to) - new Date(f.from)) / DAY) + 1;
  const to = isoDay(new Date(f.from).getTime() - DAY);
  const from = isoDay(new Date(to).getTime() - (len - 1) * DAY);
  return { ...f, from, to };
}

function brandStats(projectId, f) {
  const af = answerFilter(projectId, f);
  const total = get(`SELECT COUNT(*) n FROM (${af.sql})`, ...af.params).n;
  const simulated = get(`SELECT COUNT(*) n FROM answers WHERE id IN (${af.sql}) AND simulated = 1`, ...af.params).n;
  const rows = all(`SELECT brand_id, COUNT(DISTINCT answer_id) answers, COUNT(*) mentions, AVG(position) position, AVG(sentiment) sentiment
    FROM mentions WHERE answer_id IN (${af.sql}) GROUP BY brand_id`, ...af.params);
  const allMentions = rows.reduce((s, r) => s + r.mentions, 0);
  const map = new Map(rows.map(r => [r.brand_id, r]));
  return { total, simulated, allMentions, map };
}

const round = (x, d = 1) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d;

export function summary(projectId, f) {
  const brands = brandsOf(projectId);
  const cur = brandStats(projectId, f);
  const prev = brandStats(projectId, previousPeriod(f));
  const make = (s, b) => {
    const r = s.map.get(b.id);
    return {
      visibility: s.total ? round(100 * (r?.answers || 0) / s.total) : null,
      position: r ? round(r.position) : null,
      sentiment: r ? Math.round(r.sentiment) : null,
      sov: s.allMentions ? round(100 * (r?.mentions || 0) / s.allMentions) : null,
      mentions: r?.answers || 0,
    };
  };
  const list = brands.map(b => {
    const now = make(cur, b), before = make(prev, b);
    return {
      id: b.id, name: b.name, is_own: !!b.is_own, color: b.color, domain: b.domain, ...now,
      prev: prev.total ? before : null,
    };
  });
  const ranked = [...list].sort((a, b) => (b.visibility ?? -1) - (a.visibility ?? -1) || (a.position ?? 99) - (b.position ?? 99));
  ranked.forEach((b, i) => { b.rank = i + 1; });
  return { totalAnswers: cur.total, simulatedAnswers: cur.simulated, prevTotal: prev.total, brands: list, filter: f };
}

export function daily(projectId, f) {
  const brands = brandsOf(projectId);
  const af = answerFilter(projectId, f);
  const totals = all(`SELECT day, COUNT(*) n FROM answers WHERE id IN (${af.sql}) GROUP BY day ORDER BY day`, ...af.params);
  const rows = all(`SELECT a.day, m.brand_id, COUNT(DISTINCT m.answer_id) answers, COUNT(*) mentions, AVG(m.position) pos, AVG(m.sentiment) sent
    FROM mentions m JOIN answers a ON a.id = m.answer_id WHERE m.answer_id IN (${af.sql}) GROUP BY a.day, m.brand_id`, ...af.params);
  const byDay = new Map(totals.map(t => [t.day, { day: t.day, total: t.n, allMentions: 0 }]));
  for (const r of rows) { const d = byDay.get(r.day); if (d) d.allMentions += r.mentions; }
  for (const r of rows) {
    const d = byDay.get(r.day); if (!d) continue;
    d[`v_${r.brand_id}`] = round(100 * r.answers / d.total);
    d[`s_${r.brand_id}`] = d.allMentions ? round(100 * r.mentions / d.allMentions) : 0;
    d[`p_${r.brand_id}`] = round(r.pos);
    d[`t_${r.brand_id}`] = Math.round(r.sent);
  }
  const series = [...byDay.values()];
  for (const d of series) for (const b of brands) {
    d[`v_${b.id}`] ??= 0; d[`s_${b.id}`] ??= 0;
  }
  return { brands: brands.map(b => ({ id: b.id, name: b.name, color: b.color, is_own: !!b.is_own })), series };
}

export function perEngine(projectId, f) {
  const brands = brandsOf(projectId);
  const engines = all(`SELECT DISTINCT engine FROM answers WHERE project_id = ?`, projectId).map(r => r.engine);
  return engines.map(engine => {
    const s = summary(projectId, { ...f, engines: [engine] });
    return { engine, totalAnswers: s.totalAnswers, brands: s.brands };
  }).filter(e => e.totalAnswers > 0).map(e => ({ ...e, brandOrder: brands.map(b => b.id) }));
}

export function sources(projectId, f, limit = 100) {
  const af = answerFilter(projectId, f);
  const own = get('SELECT id FROM brands WHERE project_id = ? AND is_own = 1', projectId);
  const total = get(`SELECT COUNT(*) n FROM (${af.sql})`, ...af.params).n;
  const domains = all(`SELECT c.domain, c.category, COUNT(DISTINCT c.answer_id) answers, COUNT(*) citations,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM mentions m WHERE m.answer_id = c.answer_id AND m.brand_id = ?) THEN 1 ELSE 0 END) with_own
    FROM citations c WHERE c.answer_id IN (${af.sql}) GROUP BY c.domain ORDER BY answers DESC LIMIT ?`, own?.id ?? -1, ...af.params, limit);
  const byType = all(`SELECT category, COUNT(DISTINCT answer_id) answers, COUNT(*) citations FROM citations
    WHERE answer_id IN (${af.sql}) GROUP BY category ORDER BY citations DESC`, ...af.params)
    .map(r => ({ ...r, label: SOURCE_TYPES[r.category] || r.category }));
  const urls = all(`SELECT url, title, domain, category, COUNT(*) n FROM citations WHERE answer_id IN (${af.sql})
    GROUP BY url ORDER BY n DESC LIMIT 50`, ...af.params);
  return {
    totalAnswers: total, byType,
    domains: domains.map(d => ({ ...d, label: SOURCE_TYPES[d.category], share: total ? round(100 * d.answers / total) : 0 })),
    urls,
  };
}

export function suggestions(projectId, f) {
  const af = answerFilter(projectId, f);
  const total = get(`SELECT COUNT(*) n FROM (${af.sql})`, ...af.params).n;
  const tracked = new Set(brandsOf(projectId).flatMap(b => [b.name, ...b.aliases].map(n => n.toLowerCase())));
  const dismissed = new Set(parseJSON(get("SELECT discovery FROM projects WHERE id = ?", projectId)?.discovery, {}).dismissedSuggestions || []);
  return all(`SELECT name, COUNT(DISTINCT answer_id) answers FROM other_brands WHERE answer_id IN (${af.sql})
    GROUP BY name HAVING answers >= 2 ORDER BY answers DESC LIMIT 25`, ...af.params)
    .filter(r => !tracked.has(r.name.toLowerCase()) && !dismissed.has(r.name))
    .map(r => ({ ...r, visibility: total ? round(100 * r.answers / total) : 0 }));
}

export function promptTable(projectId, f) {
  const own = get('SELECT id FROM brands WHERE project_id = ? AND is_own = 1', projectId);
  const prompts = all('SELECT * FROM prompts WHERE project_id = ? ORDER BY id', projectId);
  const af = answerFilter(projectId, f);
  const counts = new Map(all(`SELECT prompt_id, COUNT(*) n FROM answers WHERE id IN (${af.sql}) GROUP BY prompt_id`, ...af.params).map(r => [r.prompt_id, r.n]));
  const ownRows = new Map(all(`SELECT a.prompt_id, COUNT(DISTINCT m.answer_id) n, AVG(m.position) pos, AVG(m.sentiment) sent FROM mentions m
    JOIN answers a ON a.id = m.answer_id WHERE m.brand_id = ? AND m.answer_id IN (${af.sql}) GROUP BY a.prompt_id`, own?.id ?? -1, ...af.params)
    .map(r => [r.prompt_id, r]));
  const top = all(`SELECT a.prompt_id, b.name, COUNT(DISTINCT m.answer_id) n FROM mentions m JOIN answers a ON a.id = m.answer_id
    JOIN brands b ON b.id = m.brand_id WHERE m.answer_id IN (${af.sql}) GROUP BY a.prompt_id, m.brand_id ORDER BY n DESC`, ...af.params);
  const topBy = new Map();
  for (const t of top) if (!topBy.has(t.prompt_id)) topBy.set(t.prompt_id, t);
  return prompts.map(p => {
    const n = counts.get(p.id) || 0, o = ownRows.get(p.id), t = topBy.get(p.id);
    return {
      ...p, tags: parseJSON(p.tags, []), answers: n,
      visibility: n ? round(100 * (o?.n || 0) / n) : null, position: o ? round(o.pos) : null, sentiment: o ? Math.round(o.sent) : null,
      topBrand: t ? { name: t.name, visibility: n ? round(100 * t.n / n) : 0 } : null,
    };
  });
}

export function chats(projectId, f, { limit = 30, offset = 0, brandId, q } = {}) {
  const af = answerFilter(projectId, f);
  const extra = [];
  const params = [...af.params];
  if (brandId) { extra.push('EXISTS (SELECT 1 FROM mentions m WHERE m.answer_id = a.id AND m.brand_id = ?)'); params.push(brandId); }
  if (q) { extra.push('(a.text LIKE ? OR p.text LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = `a.id IN (${af.sql})` + (extra.length ? ' AND ' + extra.join(' AND ') : '');
  const total = get(`SELECT COUNT(*) n FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE ${where}`, ...params).n;
  const rows = all(`SELECT a.id, a.engine, a.day, a.text, a.model, a.simulated, p.text prompt, p.country, p.language, p.topic
    FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE ${where} ORDER BY a.day DESC, a.id DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
  for (const r of rows) {
    r.mentions = all('SELECT m.brand_id, m.position, m.sentiment, b.name, b.is_own, b.color FROM mentions m JOIN brands b ON b.id = m.brand_id WHERE answer_id = ? ORDER BY position', r.id);
    r.citations = all('SELECT url, title, domain, category FROM citations WHERE answer_id = ?', r.id);
    r.others = all('SELECT name FROM other_brands WHERE answer_id = ?', r.id).map(o => o.name);
  }
  return { total, rows };
}

export function visibilityByCountry(projectId, f) {
  const countries = all('SELECT DISTINCT country FROM prompts WHERE project_id = ?', projectId).map(r => r.country);
  return countries.map(c => ({ country: c, ...summary(projectId, { ...f, country: c }) }))
    .filter(c => c.totalAnswers > 0)
    .map(c => ({ country: c.country, totalAnswers: c.totalAnswers, brands: c.brands }));
}
