// Web server: serves the app and its data API.
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { all, get, run, getSetting, setSetting, parseJSON, backup, tx } from './db.js';
import { authRoutes, requireAuth, requireAdmin, apiToken, newToken, clearExpiredSessions } from './auth.js';
import { startupCheck, redact } from './config.js';
import { securityHeaders, httpsOnly, sameOriginOnly, rateLimit, publicError, errorHandler, v, InputError } from './security.js';
import { BRAND_LIBRARY, PROMPT_LIBRARY, GENERAL_PROMPTS, CATEGORIES, COUNTRIES, LANGUAGES } from './seed/library.js';
import { seedDemo, seedDemoActivities, addBrand, addPrompt } from './seed/demo.js';
import { runMigrations } from './migrations.js';
import { ENGINES, SUPPORTED_ENGINES, estimateAnswerCost } from './engines/index.js';
import { LIVE_ADAPTERS } from './engines/live.js';
import { SOURCE_TYPES } from './analysis.js';
import * as M from './metrics.js';
import { computeActions } from './actions.js';
import { startRun, activeRun, reanalyzeProject, getProject, monthSpend, spendByEngine, startScheduler } from './runner.js';
import { createReport, listReports, getReport, workflow } from './reports.js';

// Stop here (in production) if a required secret is missing or an unsafe override is set.
startupCheck();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
// Health check for the hosting service: no data, no redirects.
app.get('/healthz', (req, res) => res.set('Cache-Control', 'no-store').json({ ok: true }));
app.use(httpsOnly);
app.use(securityHeaders);
// This is a private tool: ask search engines not to list it.
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.use('/api', sameOriginOnly);
app.use('/api', rateLimit({ windowMs: 60_000, max: Number(process.env.API_RATE_LIMIT_PER_MIN) || 600 }));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });
app.use(cookieParser());
app.use('/api', requireAuth);
authRoutes(app);

const sendError = (res, e) => { const { status, body } = publicError(e); res.status(status).json(body); };
const wrap = fn => (req, res) => {
  try {
    const out = fn(req, res);
    if (out instanceof Promise) out.then(val => val !== undefined && !res.headersSent && res.json(val)).catch(e => sendError(res, e));
    else if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { sendError(res, e); }
};
// Requests that cost money (AI calls) are limited per person, on top of the monthly spending cap.
const perUser = req => 'u' + (req.user?.id ?? req.ip);
const runLimit = rateLimit({ windowMs: 60 * 60_000, max: 20, keyFn: perUser, message: 'Too many check runs this hour. Please wait a little.' });
const testLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, keyFn: perUser, message: 'Too many key tests this hour. Please wait a little.' });
const enquiryLimit = rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Too many messages from this connection. Please try again in an hour.' });
const MAX_ACTIVE_PROMPTS = 300;
const countryOk = c => (COUNTRIES[c] ? c : undefined);
const langOk = l => (LANGUAGES[l] ? l : undefined);
const FREQUENCIES = ['daily', 'every3', 'weekly', 'manual'];
const brandInput = (b, label) => ({
  name: v.str(b?.name, { max: 120, label }), domain: v.str(b?.domain, { max: 200, label: `${label} website` }),
  aliases: v.list(b?.aliases, { max: 20, label: `${label} other names`, item: a => v.str(a, { max: 80, label: 'Other name' }) }) || [],
});
const promptInput = p => ({
  text: v.str(p?.text, { max: 500, label: 'Question' }), topic: v.str(p?.topic, { max: 80, label: 'Topic' }) || null,
  country: countryOk(p?.country), language: langOk(p?.language),
  tags: v.list(p?.tags, { max: 10, label: 'Tags', item: t => v.str(t, { max: 40, label: 'Tag' }) }),
});
const activePrompts = id => get('SELECT COUNT(*) n FROM prompts WHERE project_id = ? AND active = 1', id).n;
const notFound = () => Object.assign(new Error('Not found'), { status: 404 });
const projectOr404 = id => getProject(Number(id)) || (() => { throw notFound(); })();
const mode = () => getSetting('mode', 'demo');

// ---------- Company & legal details (public, shown on the legal pages) ----------
const COMPANY_FIELDS = ['name', 'businessId', 'vatId', 'address', 'country', 'email', 'phone', 'website', 'representative'];
const company = () => ({ ...Object.fromEntries(COMPANY_FIELDS.map(k => [k, ''])), country: 'Finland', ...getSetting('company', {}) });
app.get('/api/legal', wrap(() => ({ company: company(), updated: [getSetting('legal_updated', ''), '2026-10-20'].sort().pop(), hostingRegion: getSetting('hosting_region', 'United States') })));

// ---------- Website contact form ----------
// Public: anyone can send an enquiry from the website. Limited per IP; a hidden "website" field catches bots.
app.post('/api/enquiries/new', enquiryLimit, wrap(req => {
  const b = req.body;
  if (b.website) return { ok: true }; // bot filled the hidden field: pretend it worked, store nothing
  const clean = (val, max) => (typeof val === 'string' ? val : '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
  const e = { name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), company: clean(b.company, 160), role: clean(b.role, 40), markets: clean(b.markets, 200), message: clean(b.message, 3000) };
  if (!e.name) throw new Error('Please tell us your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) throw new Error('Please enter a valid work email.');
  if (!e.company) throw new Error('Please tell us your company.');
  if (!b.consent) throw new Error('Please tick the box to agree to the privacy policy.');
  run('INSERT INTO enquiries (name, email, company, role, markets, message) VALUES (?,?,?,?,?,?)', e.name, e.email, e.company, e.role, e.markets, e.message);
  return { ok: true };
}));
app.get('/api/enquiries', wrap(() => all('SELECT * FROM enquiries ORDER BY id DESC')));
app.patch('/api/enquiries/:id', wrap(req => {
  if (!['new', 'contacted', 'won', 'closed'].includes(req.body.status)) throw new Error('Unknown status');
  run('UPDATE enquiries SET status = ? WHERE id = ?', req.body.status, v.id(req.params.id));
  return { ok: true };
}));
app.delete('/api/enquiries/:id', requireAdmin, wrap(req => { run('DELETE FROM enquiries WHERE id = ?', Number(req.params.id)); return { ok: true }; }));

// ---------- Reference data ----------
app.get('/api/meta', wrap(() => ({
  engines: Object.values(ENGINES).map(e => ({ id: e.id, label: e.label, supported: e.supported, via: e.via, caveat: e.caveat, reason: e.reason, color: e.color })),
  categories: CATEGORIES, countries: COUNTRIES, languages: LANGUAGES, sourceTypes: SOURCE_TYPES,
  brandLibrary: BRAND_LIBRARY.filter(b => b.featured), promptLibrary: PROMPT_LIBRARY, generalPrompts: GENERAL_PROMPTS, mode: mode(),
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
  const own = brandInput(v.obj(b.own, { label: 'Brand' }) || {}, 'Brand name');
  if (!own.name) throw new InputError('Please enter the brand name.');
  const name = v.str(b.name, { max: 120, label: 'Project name' }) || own.name;
  const competitors = (v.list(b.competitors, { max: 30, label: 'Competitors' }) || []).map(c => brandInput(c, 'Competitor'));
  const prompts = (v.list(b.prompts, { max: MAX_ACTIVE_PROMPTS, label: 'Questions' }) || []).map(promptInput);
  const countries = (v.list(b.countries, { max: 10, label: 'Countries' }) || ['FI']).filter(countryOk);
  const frequency = v.oneOf(b.frequency, FREQUENCIES, 'Frequency') || 'daily';
  const discovery = v.obj(b.discovery, { label: 'Discovery notes' }) || {};
  const engines = (v.list(b.engines, { max: 10, label: 'Engines' }) || SUPPORTED_ENGINES).filter(e => ENGINES[e]?.supported);
  const id = tx(() => {
    const id = Number(run('INSERT INTO projects(name, category, data_mode, engines, countries, frequency, discovery) VALUES (?,?,?,?,?,?,?)',
      name, CATEGORIES[b.category] ? b.category : 'operator', mode() === 'live' ? 'live' : 'simulated',
      JSON.stringify(engines.length ? engines : SUPPORTED_ENGINES), JSON.stringify(countries.length ? countries : ['FI']),
      frequency, JSON.stringify(discovery)).lastInsertRowid);
    addBrand(id, { name: own.name, domain: cleanDomain(own.domain), aliases: own.aliases, is_own: true });
    for (const c of competitors) if (c.name) addBrand(id, { name: c.name, domain: cleanDomain(c.domain), aliases: c.aliases });
    for (const p of prompts) if (p.text) addPrompt(id, p);
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
  const name = v.str(b.name, { max: 120, label: 'Project name' });
  if (name !== undefined) run('UPDATE projects SET name = ? WHERE id = ?', name || p.name, p.id);
  if (b.category && CATEGORIES[b.category]) run('UPDATE projects SET category = ? WHERE id = ?', b.category, p.id);
  const engines = v.list(b.engines, { max: 10, label: 'Engines' });
  if (engines) run('UPDATE projects SET engines = ? WHERE id = ?', JSON.stringify(engines.filter(e => ENGINES[e]?.supported)), p.id);
  const countries = v.list(b.countries, { max: 10, label: 'Countries' });
  if (countries) run('UPDATE projects SET countries = ? WHERE id = ?', JSON.stringify(countries.filter(countryOk)), p.id);
  const frequency = v.oneOf(b.frequency, FREQUENCIES, 'Frequency');
  if (frequency) run('UPDATE projects SET frequency = ? WHERE id = ?', frequency, p.id);
  if (b.fee !== undefined) run('UPDATE projects SET fee = ? WHERE id = ?', b.fee === '' || b.fee == null ? null : v.num(b.fee, { min: 0, max: 10_000_000, label: 'Fee' }), p.id);
  if (b.currency && ['EUR', 'USD', 'GBP', 'SEK'].includes(b.currency)) run('UPDATE projects SET currency = ? WHERE id = ?', b.currency, p.id);
  const discovery = v.obj(b.discovery, { label: 'Discovery notes' });
  if (discovery) {
    const merged = { ...p.discovery, ...discovery };
    if (JSON.stringify(merged).length > 50_000) throw new InputError('Discovery notes are too long.');
    run('UPDATE projects SET discovery = ? WHERE id = ?', JSON.stringify(merged), p.id);
  }
  return { ok: true };
}));

app.delete('/api/projects/:id', requireAdmin, wrap(req => {
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
  const title = v.str(req.body.title, { max: 200, label: 'Activity name' });
  if (!title) throw new InputError('Give the activity a short name.');
  const type = ACTIVITY_TYPES.includes(req.body.type) ? req.body.type : 'task';
  const due = req.body.due_at ? new Date(v.str(req.body.due_at, { max: 40, label: 'Date' })) : null;
  if (due && isNaN(due)) throw new InputError('That date is not valid.');
  const id = Number(run('INSERT INTO activities(project_id, type, title, due_at, note, created_by) VALUES (?,?,?,?,?,?)',
    p.id, type, title, due ? due.toISOString() : null, v.str(req.body.note, { max: 2000, label: 'Note' }) || null, req.user.id).lastInsertRowid);
  return get('SELECT * FROM activities WHERE id = ?', id);
}));
app.patch('/api/activities/:id', wrap(req => {
  const a = get('SELECT * FROM activities WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const b = req.body;
  let due = a.due_at;
  if (b.due_at !== undefined) {
    const d = b.due_at ? new Date(v.str(b.due_at, { max: 40, label: 'Date' })) : null;
    if (d && isNaN(d)) throw new InputError('That date is not valid.');
    due = d ? d.toISOString() : null;
  }
  run('UPDATE activities SET title = ?, type = ?, due_at = ?, note = ?, done_at = ? WHERE id = ?',
    v.str(b.title, { max: 200, label: 'Activity name' }) || a.title, ACTIVITY_TYPES.includes(b.type) ? b.type : a.type, due,
    b.note === undefined ? a.note : v.str(b.note, { max: 2000, label: 'Note' }) || null,
    b.done === undefined ? a.done_at : b.done ? new Date().toISOString() : null, a.id);
  return get('SELECT * FROM activities WHERE id = ?', a.id);
}));
app.delete('/api/activities/:id', wrap(req => { run('DELETE FROM activities WHERE id = ?', Number(req.params.id)); return { ok: true }; }));

// ---------- Runs ----------
app.post('/api/projects/:id/run', runLimit, wrap(req => {
  const p = projectOr404(req.params.id);
  if (p.data_mode === 'live' && !Number(getSetting('monthly_cap', 0))) throw new Error('Set a monthly spending cap in Settings → Costs before running real checks.');
  const n = activePrompts(p.id);
  if (!n) throw new Error('Add at least one active question first.');
  if (n > MAX_ACTIVE_PROMPTS) throw new InputError(`Too many active questions (max ${MAX_ACTIVE_PROMPTS}). Pause some first.`);
  return startRun(p.id, 'manual');
}));
app.get('/api/projects/:id/runs', wrap(req => all('SELECT * FROM runs WHERE project_id = ? ORDER BY id DESC LIMIT 20', Number(req.params.id))));
app.get('/api/runs/:id', wrap(req => get('SELECT * FROM runs WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })()));

// ---------- Brands & suggestions ----------
app.post('/api/projects/:id/brands', wrap(req => {
  const p = projectOr404(req.params.id);
  const input = brandInput(req.body, 'Brand name');
  if (!input.name) throw new InputError('Please enter a name.');
  const existing = M.brandsOf(p.id);
  if (existing.some(b => b.name.toLowerCase() === input.name.toLowerCase())) throw new Error('That brand is already tracked.');
  if (existing.length >= 40) throw new InputError('A project can track at most 40 brands.');
  const id = addBrand(p.id, { name: input.name, domain: cleanDomain(input.domain), aliases: input.aliases });
  reanalyzeProject(p.id);
  return { id };
}));
app.patch('/api/brands/:id', wrap(req => {
  const b = get('SELECT * FROM brands WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const input = brandInput(req.body, 'Brand name');
  const name = input.name || b.name;
  const domain = req.body.domain !== undefined ? cleanDomain(input.domain) : b.domain;
  const aliases = req.body.aliases !== undefined ? JSON.stringify(input.aliases.filter(Boolean)) : b.aliases;
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
  const name = v.str(req.body.name, { max: 120, label: 'Name', required: true });
  if (list.size >= 500) throw new InputError('Too many hidden suggestions.');
  list.add(name);
  run('UPDATE projects SET discovery = ? WHERE id = ?', JSON.stringify({ ...p.discovery, dismissedSuggestions: [...list] }), p.id);
  return { ok: true };
}));

// ---------- Prompts ----------
app.get('/api/projects/:id/prompts', wrap(req => M.promptTable(Number(req.params.id), M.parseFilter(req.query))));
app.post('/api/projects/:id/prompts', wrap(req => {
  const p = projectOr404(req.params.id);
  const raw = v.list(req.body.items, { max: 200, label: 'Questions' }) || v.str(req.body.text, { max: 50_000, label: 'Questions' })?.split('\n').map(text => ({ text })) || [];
  if (raw.length > 200) throw new InputError('Add at most 200 questions at a time.');
  const shared = promptInput({ text: 'x', topic: req.body.topic, country: req.body.country, language: req.body.language, tags: req.body.tags });
  const lines = raw.map(l => promptInput({ ...l, text: l?.text, topic: l?.topic ?? req.body.topic, country: l?.country ?? req.body.country, language: l?.language ?? req.body.language, tags: l?.tags ?? req.body.tags }))
    .filter(x => x.text);
  if (!lines.length) throw new Error('Type at least one question (one per line).');
  if (activePrompts(p.id) + lines.length > MAX_ACTIVE_PROMPTS) throw new InputError(`A project can have at most ${MAX_ACTIVE_PROMPTS} active questions.`);
  const existing = new Set(all('SELECT text FROM prompts WHERE project_id = ?', p.id).map(r => r.text.toLowerCase()));
  let added = 0;
  tx(() => {
    for (const l of lines) {
      if (existing.has(l.text.trim().toLowerCase())) continue;
      addPrompt(p.id, { text: l.text, topic: l.topic ?? shared.topic, country: l.country ?? shared.country, language: l.language ?? shared.language, tags: l.tags ?? shared.tags ?? [] });
      added++;
    }
  });
  return { added, skipped: lines.length - added };
}));
app.patch('/api/prompts/:id', wrap(req => {
  const p = get('SELECT * FROM prompts WHERE id = ?', Number(req.params.id)) || (() => { throw notFound(); })();
  const b = promptInput(req.body);
  if (req.body.active && !p.active && activePrompts(p.project_id) >= MAX_ACTIVE_PROMPTS) throw new InputError(`A project can have at most ${MAX_ACTIVE_PROMPTS} active questions.`);
  run('UPDATE prompts SET text = ?, topic = ?, tags = ?, country = ?, language = ?, active = ? WHERE id = ?',
    b.text || p.text, req.body.topic !== undefined ? b.topic : p.topic, b.tags ? JSON.stringify(b.tags) : p.tags, b.country ?? p.country,
    b.language ?? p.language, req.body.active === undefined ? p.active : (req.body.active ? 1 : 0), p.id);
  return { ok: true };
}));
app.post('/api/projects/:id/prompts/bulk', wrap(req => {
  const p = projectOr404(req.params.id);
  const ids = (v.list(req.body.ids, { max: 1000, label: 'Selection' }) || []).map(v.id);
  if (!ids.length) throw new Error('Select at least one question.');
  if (req.body.action === 'resume' && activePrompts(p.id) + ids.length > MAX_ACTIVE_PROMPTS) throw new InputError(`A project can have at most ${MAX_ACTIVE_PROMPTS} active questions.`);
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
      const tag = v.str(req.body.tag, { max: 40, label: 'Tag' });
      if (row) run('UPDATE prompts SET tags = ? WHERE id = ?', JSON.stringify([...new Set([...parseJSON(row.tags, []), tag].filter(Boolean))].slice(0, 20)), id);
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
  limit: Math.min(100, Math.max(1, Math.floor(Number(req.query.limit)) || 20)), offset: Math.min(1e6, Math.max(0, Math.floor(Number(req.query.offset)) || 0)),
  brandId: Number(req.query.brand) || null, q: typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '',
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
  const { status } = req.body;
  if (!['open', 'planned', 'done', 'dismissed'].includes(status)) throw new Error('Unknown status');
  const key = v.str(req.body.key, { max: 200, label: 'Action', required: true });
  const title = v.str(req.body.title, { max: 300, label: 'Title' });
  const note = v.str(req.body.note, { max: 2000, label: 'Note' });
  run(`INSERT INTO action_status(project_id, key, title, status, note, updated_at) VALUES (?,?,?,?,?, datetime('now'))
    ON CONFLICT(project_id, key) DO UPDATE SET status = excluded.status, note = COALESCE(excluded.note, note), updated_at = datetime('now')`,
  p.id, key, title || key, status, note ?? null);
  return { ok: true };
}));

// ---------- Reports ----------
app.get('/api/projects/:id/reports', wrap(req => listReports(Number(req.params.id))));
app.post('/api/projects/:id/reports', wrap(req => {
  const p = projectOr404(req.params.id);
  return { id: createReport(p.id, { days: v.num(req.body.days, { min: 1, max: 365, integer: true, label: 'Days' }) || 30, title: v.str(req.body.title, { max: 200, label: 'Title' }) }) };
}));
app.get('/api/reports-batch', wrap(req => String(req.query.ids || '').split(',').slice(0, 50).map(Number).filter(Boolean).map(id => {
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
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; // stops spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
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
function settingsView(isAdmin) {
  const prices = getSetting('prices', {});
  const engines = Object.values(ENGINES).filter(e => e.supported).map(e => {
    const key = getSetting(e.keySetting) || process.env[e.keySetting.toUpperCase()];
    return {
      id: e.id, label: e.label, via: e.via, caveat: e.caveat,
      connected: !!key, keyHint: key && isAdmin ? `…${String(key).slice(-4)}` : null, fromEnv: !getSetting(e.keySetting) && !!key,
      model: getSetting(e.modelSetting) || e.defaultModel, defaultModel: e.defaultModel,
      price: { ...e.price, ...(prices[e.id] || {}) }, perAnswer: estimateAnswerCost(e.id, prices),
    };
  });
  return {
    mode: mode(), monthly_cap: Number(getSetting('monthly_cap', 0)), run_hour_utc: Number(getSetting('run_hour_utc', 5)), company: company(),
    hosting_region: getSetting('hosting_region', 'United States'),
    engines, spend: monthSpend(), spendByEngine: spendByEngine(),
    apiToken: isAdmin ? apiToken() : null, // members never see the data API key
  };
}
app.get('/api/settings', wrap(req => settingsView(req.user.role === 'admin')));
app.patch('/api/settings', requireAdmin, wrap(req => {
  const b = req.body;
  if (b.mode && ['demo', 'live'].includes(b.mode)) setSetting('mode', b.mode);
  if (b.company) {
    setSetting('company', { ...company(), ...Object.fromEntries(COMPANY_FIELDS.filter(k => b.company[k] !== undefined).map(k => [k, String(b.company[k]).trim().slice(0, 300)])) });
    setSetting('legal_updated', new Date().toISOString().slice(0, 10));
  }
  if (b.hosting_region) setSetting('hosting_region', String(b.hosting_region).slice(0, 80));
  if (b.monthly_cap !== undefined) setSetting('monthly_cap', v.num(b.monthly_cap, { min: 0, max: 100_000, label: 'Monthly cap' }) || 0);
  if (b.run_hour_utc !== undefined) setSetting('run_hour_utc', v.num(b.run_hour_utc, { min: 0, max: 23, integer: true, label: 'Run hour' }) || 0);
  for (const e of Object.values(ENGINES).filter(x => x.supported)) {
    const k = v.str(b.keys?.[e.id], { max: 400, label: `${e.label} key` });
    if (k !== undefined) {
      if (k && !/^[\x21-\x7E]+$/.test(k)) throw new InputError(`${e.label} key contains invalid characters.`);
      setSetting(e.keySetting, k || null);
    }
    const m = v.str(b.models?.[e.id], { max: 100, label: `${e.label} model` });
    if (m !== undefined) {
      if (m && !/^[A-Za-z0-9._:/-]+$/.test(m)) throw new InputError(`${e.label} model name is not valid.`);
      setSetting(e.modelSetting, m || null);
    }
    const pr = b.prices?.[e.id];
    if (pr) {
      v.obj(pr, { maxBytes: 1000, label: 'Prices' });
      const allowed = ['inPerM', 'outPerM', 'perSearch', 'typicalIn', 'typicalOut', 'typicalSearches'];
      const prices = getSetting('prices', {});
      prices[e.id] = Object.fromEntries(Object.entries(pr).filter(([k2, val]) => allowed.includes(k2) && val !== '' && val != null)
        .map(([k2, val]) => [k2, v.num(val, { min: 0, max: 1_000_000, label: 'Price' })]));
      setSetting('prices', prices);
    }
  }
  return settingsView(true);
}));
app.post('/api/settings/rotate-api-token', requireAdmin, wrap(() => { setSetting('api_token', 'ait_' + newToken(20)); return { apiToken: apiToken() }; }));

// Sends ONE short real question to check a key works. Costs about one answer.
app.post('/api/settings/test/:engine', requireAdmin, testLimit, wrap(async req => {
  const e = ENGINES[req.params.engine];
  if (!e?.supported) throw new Error('Unknown engine');
  const key = getSetting(e.keySetting) || process.env[e.keySetting.toUpperCase()];
  if (!key) throw new Error('No key saved for this engine yet.');
  const model = getSetting(e.modelSetting) || e.defaultModel;
  const t0 = Date.now();
  try {
    const r = await LIVE_ADAPTERS[e.id]({ question: 'In one sentence: which authority supervises gambling in Finland?', country: 'FI', apiKey: key, model });
    return { ok: true, ms: Date.now() - t0, model: r.model, text: r.text.slice(0, 400), citations: r.citations.slice(0, 3) };
  } catch (err) {
    // Show the provider's reason (e.g. "invalid key") but never the key itself.
    throw Object.assign(new Error(redact(`${e.label} said: ${err?.message || err}`, [key]).slice(0, 400)), { status: 400, expose: true });
  }
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

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

// Demo data only when asked for (SEED_DEMO=1). Real installations start empty.
if (!process.env.NO_SEED && process.env.SEED_DEMO === '1') { seedDemo(); seedDemoActivities(); }
runMigrations();
if (!process.env.NO_SCHEDULER) startScheduler();
// Daily safety backup.
setInterval(() => { try { backup('daily'); } catch (e) { console.error('Backup failed', redact(e?.message || e)); } }, 24 * 3600 * 1000);
setInterval(() => { try { clearExpiredSessions(); } catch { /* next time */ } }, 3600 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Housedge running on http://localhost:${port}`));
