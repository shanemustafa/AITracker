// Web server: serves the app and its data API.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { all, get, run, getSetting, setSetting, parseJSON, backup, tx } from './db.js';
import { authRoutes, requireAuth, requireAdmin, apiToken, newToken } from './auth.js';
import { BRAND_LIBRARY, PROMPT_LIBRARY, CATEGORIES, COUNTRIES, LANGUAGES } from './seed/library.js';
import { seedDemo, seedDemoActivities, addBrand, addPrompt } from './seed/demo.js';
import { ENGINES, SUPPORTED_ENGINES, estimateAnswerCost } from './engines/index.js';
import { LIVE_ADAPTERS } from './engines/live.js';
import { SOURCE_TYPES } from './analysis.js';
import * as M from './metrics.js';
import { computeActions } from './actions.js';
import { startRun, activeRun, reanalyzeProject, getProject, monthSpend, spendByEngine, startScheduler } from './runner.js';
import { createReport, listReports, getReport, workflow } from './reports.js';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/api', requireAuth);
authRoutes(app);

const wrap = fn => (req, res) => {
  try {
    const out = fn(req, res);
    if (out instanceof Promise) out.then(v => v !== undefined && !res.headersSent && res.json(v)).catch(e => res.status(e.status || 400).json({ error: e.message }));
    else if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { console.error(e); res.status(e.status || 400).json({ error: e.message }); }
};
const notFound = () => Object.assign(new Error('Not found'), { status: 404 });
const projectOr404 = id => getProject(Number(id)) || (() => { throw notFound(); })();
const mode = () => getSetting('mode', 'demo');

// ---------- Reference data ----------
app.get('/api/meta', wrap(() => ({
  engines: Object.values(ENGINES).map(e => ({ id: e.id, label: e.label, supported: e.supported, via: e.via, caveat: e.caveat, reason: e.reason, color: e.color })),
  categories: CATEGORIES, countries: COUNTRIES, languages: LANGUAGES, sourceTypes: SOURCE_TYPES,
  brandLibrary: BRAND_LIBRARY.filter(b => b.featured), promptLibrary: PROMPT_LIBRARY, mode: mode(),
})));

// ---------- Projects ----------
function projectCard(p) {
  const f = M.parseFilter({ days: 30 });
  const s = M.summary(p.id, f);
  const own = s.brands.find(b => b.is_own);
  const wf = workflow(p.id);
  return {
    id: p.id, name: p.name, category: p.category, data_mode: p.data_mode, frequency: p.frequency, last_run_at: p.last_run_at,
    own: own ? { name: own.name, visibility: own.visibility, position: own.position, sentiment: own.sentiment, sov: own.sov, rank: own.rank } : null,
    totalAnswers: s.totalAnswers, stage: wf.stages[wf.current], stageIndex: wf.current, complete: wf.complete,
    competitors: s.brands.filter(b => !b.is_own).length, running: !!activeRun(p.id),
    prevVisibility: own?.prev?.visibility ?? null, fee: p.fee, currency: p.currency || 'EUR',
    spark: own ? M.daily(p.id, f).series.map(d => ({ day: d.day, v: d[`v_${own.id}`] })) : [],
    activities: activitySummary(p.id),
  };
}

// Next planned activity and how many are overdue, for the status dot on board cards.
function activitySummary(projectId) {
  const now = new Date().toISOString();
  const open = all('SELECT * FROM activities WHERE project_id = ? AND done_at IS NULL ORDER BY due_at IS NULL, due_at', projectId);
  return { open: open.length, overdue: open.filter(a => a.due_at && a.due_at < now).length, next: open[0] || null };
}
app.get('/api/projects', wrap(() => all('SELECT * FROM projects ORDER BY id DESC').map(projectCard)));

app.post('/api/projects', wrap(req => {
  const b = req.body;
  if (!b.own?.name?.trim()) throw new Error('Please enter the brand name.');
  const engines = (b.engines || SUPPORTED_ENGINES).filter(e => ENGINES[e]?.supported);
  const id = tx(() => {
    const id = Number(run('INSERT INTO projects(name, category, data_mode, engines, countries, frequency, discovery) VALUES (?,?,?,?,?,?,?)',
      (b.name || b.own.name).trim(), CATEGORIES[b.category] ? b.category : 'operator', mode() === 'live' ? 'live' : 'simulated',
      JSON.stringify(engines.length ? engines : SUPPORTED_ENGINES), JSON.stringify(b.countries || ['FI']),
      b.frequency || 'daily', JSON.stringify(b.discovery || {})).lastInsertRowid);
    addBrand(id, { name: b.own.name.trim(), domain: cleanDomain(b.own.domain), aliases: b.own.aliases || [], is_own: true });
    for (const c of b.competitors || []) if (c.name?.trim()) addBrand(id, { name: c.name.trim(), domain: cleanDomain(c.domain), aliases: c.aliases || [] });
    for (const p of b.prompts || []) if (p.text?.trim()) addPrompt(id, p);
    return id;
  });
  return { id };
}));

const cleanDomain = d => (d || '').trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase() || null;

app.get('/api/projects/:id', wrap(req => {
  const p = projectOr404(req.params.id);
  return { ...p, brands: M.brandsOf(p.id), workflow: workflow(p.id), activeRun: activeRun(p.id),
    lastRun: get('SELECT * FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT 1', p.id),
    promptCount: get('SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1', p.id).n };
}));

app.patch('/api/projects/:id', wrap(req => {
  const p = projectOr404(req.params.id);
  const b = req.body;
  if (b.name !== undefined) run('UPDATE projects SET name = ? WHERE id = ?', String(b.name).trim() || p.name, p.id);
  if (b.category && CATEGORIES[b.category]) run('UPDATE projects SET category = ? WHERE id = ?', b.category, p.id);
  if (b.engines) run('UPDATE projects SET engines = ? WHERE id = ?', JSON.stringify(b.engines.filter(e => ENGINES[e]?.supported)), p.id);
  if (b.countries) run('UPDATE projects SET countries = ? WHERE id = ?', JSON.stringify(b.countries), p.id);
  if (b.frequency) run('UPDATE projects SET frequency = ? WHERE id = ?', b.frequency, p.id);
  if (b.fee !== undefined) run('UPDATE projects SET fee = ? WHERE id = ?', b.fee === '' || b.fee == null ? null : Math.max(0, Number(b.fee) || 0), p.id);
  if (b.currency && ['EUR', 'USD', 'GBP', 'SEK'].includes(b.currency)) run('UPDATE projects SET currency = ? WHERE id = ?', b.currency, p.id);
  if (b.discovery) run('UPDATE projects SET discovery = ? WHERE id = ?', JSON.stringify({ ...p.discovery, ...b.discovery }), p.id);
  return { ok: true };
}));

app.delete('/api/projects/:id', wrap(req => {
  const p = projectOr404(req.params.id);
  if (req.query.confirm !== p.name) throw new Error('To delete, type the project name exactly.');
  backup('before-delete-project');
  run('DELETE FROM projects WHERE id = ?', p.id);
  return { ok: true };
}));

// Switch a demo project to real data. Simulated answers are removed (a backup is made first).
app.post('/api/projects/:id/go-live', requireAdmin, wrap(req => {
  const p = projectOr404(req.params.id);
  if (req.body.confirm !== true) throw new Error('Please confirm.');
  const file = backup('before-go-live');
  tx(() => {
    run('DELETE FROM answers WHERE project_id = ? AND simulated = 1', p.id);
    run('DELETE FROM runs WHERE project_id = ? AND simulated = 1', p.id);
    run('DELETE FROM reports WHERE project_id = ? AND simulated = 1', p.id);
    run('DELETE FROM action_status WHERE project_id = ?', p.id);
    run("UPDATE projects SET data_mode = 'live', last_run_at = NULL WHERE id = ?", p.id);
  });
  return { ok: true, backup: path.basename(file) };
}));

// ---------- Activities (calls, meetings, emails, tasks per client) ----------
const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'task', 'report'];
app.get('/api/projects/:id/activities', wrap(req => {
  const p = projectOr404(req.params.id);
  return all('SELECT * FROM activities WHERE project_id = ? ORDER BY done_at IS NOT NULL, due_at IS NULL, due_at, id', p.id);
}));
app.post('/api/projects/:id/activities', wrap(req => {
  const p = projectOr404(req.params.id);
  const title = String(req.body.title || '').trim();
  if (!title) throw new Error('Give the activity a short name.');
  const type = ACTIVITY_TYPES.includes(req.body.type) ? req.body.type : 'task';
  const due = req.body.due_at ? new Date(req.body.due_at) : null;
  if (due && isNaN(due)) throw new Error('That date is not valid.');
  const id = Number(run('INSERT INTO activities(project_id, type, title, due_at, note, created_by) VALUES (?,?,?,?,?,?)',
    p.id, type, title.slice(0, 200), due ? due.toISOString() : null, req.body.note || null, req.user.id).lastInsertRowid);
  return get('SELECT * FROM activities WHERE id = ?', id);
}));
app.patch('/api/activities/:id', wrap(req => {
  const a = get('SELECT * FROM activities WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const b = req.body;
  const due = b.due_at === undefined ? a.due_at : b.due_at ? new Date(b.due_at).toISOString() : null;
  run('UPDATE activities SET title = ?, type = ?, due_at = ?, note = ?, done_at = ? WHERE id = ?',
    b.title?.trim() || a.title, ACTIVITY_TYPES.includes(b.type) ? b.type : a.type, due, b.note ?? a.note,
    b.done === undefined ? a.done_at : b.done ? new Date().toISOString() : null, a.id);
  return get('SELECT * FROM activities WHERE id = ?', a.id);
}));
app.delete('/api/activities/:id', wrap(req => { run('DELETE FROM activities WHERE id = ?', Number(req.params.id)); return { ok: true }; }));

// ---------- Runs ----------
app.post('/api/projects/:id/run', wrap(req => {
  const p = projectOr404(req.params.id);
  if (p.data_mode === 'live' && !Number(getSetting('monthly_cap', 0))) throw new Error('Set a monthly spending cap in Settings → Costs before running real checks.');
  if (!get('SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1', p.id).n) throw new Error('Add at least one active question first.');
  return startRun(p.id, 'manual');
}));
app.get('/api/projects/:id/runs', wrap(req => all('SELECT * FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT 20', Number(req.params.id))));
app.get('/api/runs/:id', wrap(req => get('SELECT * FROM runs WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })()));

// ---------- Brands & suggestions ----------
app.post('/api/projects/:id/brands', wrap(req => {
  const p = projectOr404(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) throw new Error('Please enter a name.');
  if (M.brandsOf(p.id).some(b => b.name.toLowerCase() === name.toLowerCase())) throw new Error('That brand is already tracked.');
  const id = addBrand(p.id, { name, domain: cleanDomain(req.body.domain), aliases: req.body.aliases || [] });
  reanalyzeProject(p.id);
  return { id };
}));
app.patch('/api/brands/:id', wrap(req => {
  const b = get('SELECT * FROM brands WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const name = req.body.name !== undefined ? String(req.body.name).trim() || b.name : b.name;
  const domain = req.body.domain !== undefined ? cleanDomain(req.body.domain) : b.domain;
  const aliases = req.body.aliases !== undefined ? JSON.stringify(req.body.aliases.map(a => String(a).trim()).filter(Boolean)) : b.aliases;
  run('UPDATE brands SET name = ?, domain = ?, aliases = ? WHERE id = ?', name, domain, aliases, b.id);
  reanalyzeProject(b.project_id);
  return { ok: true };
}));
app.delete('/api/brands/:id', wrap(req => {
  const b = get('SELECT * FROM brands WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  if (b.is_own) throw new Error('You cannot remove the project\'s own brand.');
  run('DELETE FROM brands WHERE id = ?', b.id);
  reanalyzeProject(b.project_id);
  return { ok: true };
}));
app.get('/api/projects/:id/suggestions', wrap(req => M.suggestions(Number(req.params.id), M.parseFilter(req.query))));
app.post('/api/projects/:id/suggestions/dismiss', wrap(req => {
  const p = projectOr404(req.params.id);
  const list = new Set(p.discovery.dismissedSuggestions || []);
  list.add(req.body.name);
  run('UPDATE projects SET discovery = ? WHERE id = ?', JSON.stringify({ ...p.discovery, dismissedSuggestions: [...list] }), p.id);
  return { ok: true };
}));

// ---------- Prompts ----------
app.get('/api/projects/:id/prompts', wrap(req => M.promptTable(Number(req.params.id), M.parseFilter(req.query))));
app.post('/api/projects/:id/prompts', wrap(req => {
  const p = projectOr404(req.params.id);
  const lines = (req.body.items || String(req.body.text || '').split('\n').map(text => ({ text })))
    .filter(x => x.text && x.text.trim());
  if (!lines.length) throw new Error('Type at least one question (one per line).');
  const existing = new Set(all('SELECT text FROM prompts WHERE project_id = ?', p.id).map(r => r.text.toLowerCase()));
  let added = 0;
  tx(() => {
    for (const l of lines) {
      if (existing.has(l.text.trim().toLowerCase())) continue;
      addPrompt(p.id, {
        text: l.text, topic: l.topic ?? req.body.topic, country: l.country ?? req.body.country,
        language: l.language ?? req.body.language, tags: l.tags ?? req.body.tags ?? [],
      });
      added++;
    }
  });
  return { added, skipped: lines.length - added };
}));
app.patch('/api/prompts/:id', wrap(req => {
  const p = get('SELECT * FROM prompts WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const b = req.body;
  run('UPDATE prompts SET text = ?, topic = ?, tags = ?, country = ?, language = ?, active = ? WHERE id = ?',
    b.text?.trim() || p.text, b.topic ?? p.topic, b.tags ? JSON.stringify(b.tags) : p.tags, b.country ?? p.country,
    b.language ?? p.language, b.active === undefined ? p.active : (b.active ? 1 : 0), p.id);
  return { ok: true };
}));
app.post('/api/projects/:id/prompts/bulk', wrap(req => {
  const p = projectOr404(req.params.id);
  const ids = (req.body.ids || []).map(Number);
  if (!ids.length) throw new Error('Select at least one question.');
  const marks = ids.map(() => '?').join(',');
  if (req.body.action === 'pause') run(`UPDATE prompts SET active = 0 WHERE project_id = ? AND id IN (${marks})`, p.id, ...ids);
  else if (req.body.action === 'resume') run(`UPDATE prompts SET active = 1 WHERE project_id = ? AND id IN (${marks})`, p.id, ...ids);
  else if (req.body.action === 'delete') {
    if (req.body.confirm !== true) throw new Error('Please confirm deletion.');
    backup('before-delete-prompts');
    run(`DELETE FROM prompts WHERE project_id = ? AND id IN (${marks})`, p.id, ...ids);
  } else if (req.body.action === 'tag') {
    for (const id of ids) {
      const row = get('SELECT tags FROM prompts WHERE id = ? AND project_id = ?', id, p.id);
      if (row) run('UPDATE prompts SET tags = ? WHERE id = ?', JSON.stringify([...new Set([...parseJSON(row.tags, []), req.body.tag].filter(Boolean))]), id);
    }
  } else throw new Error('Unknown action');
  return { ok: true };
}));

// ---------- Metrics ----------
const metric = fn => wrap(req => { const p = projectOr404(req.params.id); return fn(p, M.parseFilter(req.query), req); });
app.get('/api/projects/:id/summary', metric((p, f) => M.summary(p.id, f)));
app.get('/api/projects/:id/daily', metric((p, f) => M.daily(p.id, f)));
app.get('/api/projects/:id/engines', metric((p, f) => M.perEngine(p.id, f)));
app.get('/api/projects/:id/countries', metric((p, f) => M.visibilityByCountry(p.id, f)));
app.get('/api/projects/:id/sources', metric((p, f) => M.sources(p.id, f)));
app.get('/api/projects/:id/chats', metric((p, f, req) => M.chats(p.id, { ...f, promptId: Number(req.query.prompt) || undefined }, {
  limit: Math.min(100, Number(req.query.limit) || 20), offset: Number(req.query.offset) || 0,
  brandId: Number(req.query.brand) || null, q: req.query.q || '',
})));
app.get('/api/projects/:id/filters', wrap(req => {
  const id = Number(req.params.id);
  return {
    tags: [...new Set(all('SELECT tags FROM prompts WHERE project_id = ?', id).flatMap(r => parseJSON(r.tags, [])))].sort(),
    topics: all('SELECT DISTINCT topic FROM prompts WHERE project_id = ? AND topic IS NOT NULL ORDER BY topic', id).map(r => r.topic),
    countries: all('SELECT DISTINCT country FROM prompts WHERE project_id = ? ORDER BY country', id).map(r => r.country),
    engines: all('SELECT DISTINCT engine FROM answers WHERE project_id = ?', id).map(r => r.engine),
  };
}));

// ---------- Actions ----------
app.get('/api/projects/:id/actions', metric((p, f) => computeActions(p.id, f)));
app.post('/api/projects/:id/actions', wrap(req => {
  const p = projectOr404(req.params.id);
  const { key, title, status, note } = req.body;
  if (!['open', 'planned', 'done', 'dismissed'].includes(status)) throw new Error('Unknown status');
  run(`INSERT INTO action_status(project_id, key, title, status, note, updated_at) VALUES (?,?,?,?,?, datetime('now'))
    ON CONFLICT(project_id, key) DO UPDATE SET status = excluded.status, note = COALESCE(excluded.note, note), updated_at = datetime('now')`,
  p.id, key, title || key, status, note ?? null);
  return { ok: true };
}));

// ---------- Reports ----------
app.get('/api/projects/:id/reports', wrap(req => listReports(Number(req.params.id))));
app.post('/api/projects/:id/reports', wrap(req => {
  const p = projectOr404(req.params.id);
  return { id: createReport(p.id, { days: Number(req.body.days) || 30, title: req.body.title }) };
}));
app.get('/api/reports-batch', wrap(req => String(req.query.ids || '').split(',').map(Number).filter(Boolean).map(id => {
  const r = getReport(id);
  if (!r) return null;
  const own = r.data.summary?.brands?.find(b => b.is_own);
  return { id, period_end: r.period_end, own: own && { visibility: own.visibility, sov: own.sov, position: own.position, sentiment: own.sentiment }, actionsDone: r.data.actionsDone?.length || 0 };
}).filter(Boolean)));
app.get('/api/reports/:id', wrap(req => getReport(Number(req.params.id)) || (() => { throw notFound(); })()));
app.delete('/api/reports/:id', wrap(req => { backup('before-delete-report'); run('DELETE FROM reports WHERE id = ?', Number(req.params.id)); return { ok: true }; }));
app.get('/api/projects/:id/workflow', wrap(req => workflow(projectOr404(req.params.id).id)));

// ---------- CSV exports (also used by Google Sheets / Looker Studio through /api/v1) ----------
const csvCell = v => {
  if (v == null) return '';
  const s = String(v);
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s; // stops spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
function csv(rows, columns) {
  return [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\n') + '\n';
}
function exportData(projectId, kind, f) {
  const p = getProject(projectId);
  const sim = p.data_mode !== 'live' ? 'yes' : 'no';
  if (kind === 'summary') {
    const s = M.summary(projectId, f);
    return csv(s.brands.map(b => ({ ...b, project: p.name, from: f.from, to: f.to, simulated: sim, own: b.is_own ? 'yes' : 'no' })),
      ['project', 'from', 'to', 'name', 'own', 'visibility', 'position', 'sentiment', 'sov', 'mentions', 'rank', 'simulated']);
  }
  if (kind === 'daily') {
    const d = M.daily(projectId, f);
    const rows = d.series.flatMap(day => d.brands.map(b => ({ day: day.day, brand: b.name, own: b.is_own ? 'yes' : 'no', answers: day.total,
      visibility: day[`v_${b.id}`], share_of_voice: day[`s_${b.id}`], position: day[`p_${b.id}`], sentiment: day[`t_${b.id}`], simulated: sim })));
    return csv(rows, ['day', 'brand', 'own', 'answers', 'visibility', 'share_of_voice', 'position', 'sentiment', 'simulated']);
  }
  if (kind === 'answers') {
    const af = M.answerFilter(projectId, f);
    const rows = all(`SELECT a.id, a.day, a.engine, a.model, p.text question, p.country, p.language, p.topic, a.text answer, a.simulated,
      (SELECT group_concat(b.name || ' #' || m.position, '; ') FROM mentions m JOIN brands b ON b.id = m.brand_id WHERE m.answer_id = a.id) brands,
      (SELECT group_concat(url, ' ') FROM citations c WHERE c.answer_id = a.id) sources
      FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE a.id IN (${af.sql}) ORDER BY a.day, a.id`, ...af.params)
      .map(r => ({ ...r, simulated: r.simulated ? 'yes' : 'no' }));
    return csv(rows, ['id', 'day', 'engine', 'model', 'question', 'country', 'language', 'topic', 'brands', 'sources', 'answer', 'simulated']);
  }
  if (kind === 'sources') {
    return csv(M.sources(projectId, f, 1000).domains.map(d => ({ ...d, simulated: sim })), ['domain', 'label', 'answers', 'share', 'citations', 'with_own', 'simulated']);
  }
  if (kind === 'prompts') {
    return csv(M.promptTable(projectId, f).map(r => ({ ...r, tags: r.tags.join('|'), top_brand: r.topBrand?.name, active: r.active ? 'yes' : 'no', simulated: sim })),
      ['id', 'text', 'topic', 'tags', 'country', 'language', 'active', 'answers', 'visibility', 'position', 'sentiment', 'top_brand', 'simulated']);
  }
  throw new Error('Unknown export type');
}
function sendCsv(res, p, kind, body) {
  const prefix = p.data_mode !== 'live' ? 'SIMULATED-DATA-' : '';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${prefix}${p.name.replace(/[^a-z0-9]+/gi, '-')}-${kind}.csv"`);
  res.send('﻿' + body);
}
app.get('/api/projects/:id/export/:kind', wrap((req, res) => {
  const p = projectOr404(req.params.id);
  sendCsv(res, p, req.params.kind, exportData(p.id, req.params.kind, M.parseFilter(req.query)));
}));

// ---------- Public data API (token protected) ----------
app.get('/api/v1/projects', wrap(() => all('SELECT id, name, category, data_mode FROM projects ORDER BY id')
  .map(p => ({ ...p, simulated: p.data_mode !== 'live' }))));
app.get('/api/v1/projects/:id/summary', wrap(req => {
  const p = projectOr404(req.params.id);
  return { project: p.name, simulated: p.data_mode !== 'live', ...M.summary(p.id, M.parseFilter(req.query)) };
}));
app.get('/api/v1/projects/:id/:kind.csv', wrap((req, res) => {
  const p = projectOr404(req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(exportData(p.id, req.params.kind, M.parseFilter(req.query)));
}));

// ---------- Settings, engines and costs ----------
function settingsView() {
  const prices = getSetting('prices', {});
  const engines = Object.values(ENGINES).filter(e => e.supported).map(e => {
    const key = getSetting(e.keySetting) || process.env[e.keySetting.toUpperCase()];
    return {
      id: e.id, label: e.label, via: e.via, caveat: e.caveat,
      connected: !!key, keyHint: key ? `…${String(key).slice(-4)}` : null, fromEnv: !getSetting(e.keySetting) && !!key,
      model: getSetting(e.modelSetting) || e.defaultModel, defaultModel: e.defaultModel,
      price: { ...e.price, ...(prices[e.id] || {}) }, perAnswer: estimateAnswerCost(e.id, prices),
    };
  });
  return {
    mode: mode(), monthly_cap: Number(getSetting('monthly_cap', 0)), run_hour_utc: Number(getSetting('run_hour_utc', 5)),
    engines, spend: monthSpend(), spendByEngine: spendByEngine(), apiToken: apiToken(),
  };
}
app.get('/api/settings', wrap(() => settingsView()));
app.patch('/api/settings', requireAdmin, wrap(req => {
  const b = req.body;
  if (b.mode && ['demo', 'live'].includes(b.mode)) setSetting('mode', b.mode);
  if (b.monthly_cap !== undefined) setSetting('monthly_cap', Math.max(0, Number(b.monthly_cap) || 0));
  if (b.run_hour_utc !== undefined) setSetting('run_hour_utc', Math.min(23, Math.max(0, Number(b.run_hour_utc) || 0)));
  for (const e of Object.values(ENGINES).filter(x => x.supported)) {
    const k = b.keys?.[e.id];
    if (k !== undefined) setSetting(e.keySetting, String(k).trim() || null);
    const m = b.models?.[e.id];
    if (m !== undefined) setSetting(e.modelSetting, String(m).trim() || null);
    const pr = b.prices?.[e.id];
    if (pr) {
      const prices = getSetting('prices', {});
      prices[e.id] = Object.fromEntries(Object.entries(pr).filter(([, v]) => v !== '' && !isNaN(Number(v))).map(([k2, v]) => [k2, Number(v)]));
      setSetting('prices', prices);
    }
  }
  return settingsView();
}));
app.post('/api/settings/rotate-api-token', requireAdmin, wrap(() => { setSetting('api_token', 'ait_' + newToken(20)); return { apiToken: apiToken() }; }));

// Sends ONE short real question to check a key works. Costs about one answer.
app.post('/api/settings/test/:engine', requireAdmin, wrap(async req => {
  const e = ENGINES[req.params.engine];
  if (!e?.supported) throw new Error('Unknown engine');
  const key = getSetting(e.keySetting) || process.env[e.keySetting.toUpperCase()];
  if (!key) throw new Error('No key saved for this engine yet.');
  const model = getSetting(e.modelSetting) || e.defaultModel;
  const t0 = Date.now();
  const r = await LIVE_ADAPTERS[e.id]({ question: 'In one sentence: which authority supervises gambling in Finland?', country: 'FI', apiKey: key, model });
  return { ok: true, ms: Date.now() - t0, model: r.model, text: r.text.slice(0, 400), citations: r.citations.slice(0, 3) };
}));

app.get('/api/costs/estimate', wrap(() => {
  const prices = getSetting('prices', {});
  const runsPerMonth = { daily: 30, every3: 10, weekly: 4.3, manual: 1 };
  const projects = all('SELECT * FROM projects ORDER BY id').map(p => {
    const prompts = get('SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1', p.id).n;
    const engines = parseJSON(p.engines, []).filter(e => ENGINES[e]?.supported);
    const perRun = engines.reduce((s, e) => s + prompts * estimateAnswerCost(e, prices), 0);
    const monthly = perRun * (runsPerMonth[p.frequency] || 30);
    return { id: p.id, name: p.name, data_mode: p.data_mode, prompts, engines, frequency: p.frequency, perRun, monthly,
      byEngine: engines.map(e => ({ engine: e, monthly: prompts * estimateAnswerCost(e, prices) * (runsPerMonth[p.frequency] || 30) })) };
  });
  return { projects, liveTotal: projects.filter(p => p.data_mode === 'live').reduce((s, p) => s + p.monthly, 0) };
}));

app.post('/api/backup', requireAdmin, wrap(() => ({ file: path.basename(backup('manual')) })));

// ---------- Front end ----------
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (!process.env.NO_SEED) { seedDemo(); seedDemoActivities(); }
if (!process.env.NO_SCHEDULER) startScheduler();
// Daily safety backup.
setInterval(() => { try { backup('daily'); } catch (e) { console.error('Backup failed', e); } }, 24 * 3600 * 1000);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`AI Answer Tracker running on http://localhost:${port}`));
