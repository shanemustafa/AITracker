// Asks every active question to every chosen engine, stores the answers, and analyses them.
import { all, get, run, tx, getSetting, parseJSON } from './db.js';
import { analyzeAnswer, classifySource, domainOf } from './analysis.js';
import { ENGINES, estimateAnswerCost, actualCost } from './engines/index.js';
import { LIVE_ADAPTERS } from './engines/live.js';
import { simulateAnswer } from './engines/simulated.js';
import { brandsOf, isoDay } from './metrics.js';

export function storeAnalysis(answerId, projectId, text, citations, brands) {
  const { mentions, others } = analyzeAnswer(text, brands);
  for (const m of mentions) run('INSERT INTO mentions(answer_id, project_id, brand_id, position, sentiment, snippet) VALUES (?,?,?,?,?,?)',
    answerId, projectId, m.brand_id, m.position, m.sentiment, m.snippet);
  for (const o of others) run('INSERT INTO other_brands(answer_id, project_id, name) VALUES (?,?,?)', answerId, projectId, o);
  for (const c of citations || []) {
    const domain = domainOf(c.url);
    if (!domain) continue;
    run('INSERT INTO citations(answer_id, project_id, url, domain, title, category) VALUES (?,?,?,?,?,?)',
      answerId, projectId, c.url, domain, (c.title || '').slice(0, 300), classifySource(domain, brands));
  }
}

export function storeAnswer({ runId, project, prompt, engine, day, result, simulated, cost, brands }) {
  const info = run(`INSERT INTO answers(run_id, project_id, prompt_id, engine, day, text, model, simulated, cost)
    VALUES (?,?,?,?,?,?,?,?,?)`, runId, project.id, prompt.id, engine, day, result.text, result.model, simulated ? 1 : 0, cost || 0);
  storeAnalysis(Number(info.lastInsertRowid), project.id, result.text, result.citations, brands);
}

// Re-reads every stored answer after brands change (e.g. a competitor was added), so history is recounted.
export function reanalyzeProject(projectId) {
  const brands = brandsOf(projectId);
  tx(() => {
    run('DELETE FROM mentions WHERE project_id = ?', projectId);
    run('DELETE FROM other_brands WHERE project_id = ?', projectId);
    const answers = all('SELECT id, text FROM answers WHERE project_id = ? AND error IS NULL', projectId);
    const stmt = { m: 'INSERT INTO mentions(answer_id, project_id, brand_id, position, sentiment, snippet) VALUES (?,?,?,?,?,?)', o: 'INSERT INTO other_brands(answer_id, project_id, name) VALUES (?,?,?)' };
    for (const a of answers) {
      const { mentions, others } = analyzeAnswer(a.text, brands);
      for (const m of mentions) run(stmt.m, a.id, projectId, m.brand_id, m.position, m.sentiment, m.snippet);
      for (const o of others) run(stmt.o, a.id, projectId, o);
    }
    for (const c of all('SELECT id, domain FROM citations WHERE project_id = ?', projectId))
      run('UPDATE citations SET category = ? WHERE id = ?', classifySource(c.domain, brands), c.id);
  });
}

export function monthSpend() {
  const month = new Date().toISOString().slice(0, 7);
  return get("SELECT COALESCE(SUM(cost), 0) s FROM answers WHERE simulated = 0 AND substr(created_at, 1, 7) = ?", month).s;
}
export function spendByEngine() {
  const month = new Date().toISOString().slice(0, 7);
  return all("SELECT engine, COUNT(*) answers, COALESCE(SUM(cost),0) cost FROM answers WHERE simulated = 0 AND substr(created_at,1,7) = ? GROUP BY engine", month);
}

export function getProject(id) {
  const p = get('SELECT * FROM projects WHERE id = ?', id);
  if (!p) return null;
  return { ...p, engines: parseJSON(p.engines, []), countries: parseJSON(p.countries, []), discovery: parseJSON(p.discovery, {}) };
}

// Simulated history for demo projects (fast, synchronous).
export function simulateHistory(projectId, days, trigger = 'seed') {
  const project = getProject(projectId);
  const brands = brandsOf(projectId);
  const prompts = all('SELECT * FROM prompts WHERE project_id = ? AND active = 1', projectId);
  tx(() => {
    const runId = Number(run("INSERT INTO runs(project_id, trigger, status, simulated, total, done, finished_at) VALUES (?,?, 'done', 1, ?, ?, datetime('now'))",
      projectId, trigger, prompts.length * project.engines.length * days, prompts.length * project.engines.length * days).lastInsertRowid);
    for (let d = days - 1; d >= 0; d--) {
      const day = isoDay(Date.now() - d * 86400000);
      for (const prompt of prompts) for (const engine of project.engines) {
        const result = simulateAnswer({ prompt, engine, day, brands, category: project.category, projectId });
        storeAnswer({ runId, project, prompt, engine, day, result, simulated: true, cost: 0, brands });
      }
    }
    run("UPDATE projects SET last_run_at = datetime('now') WHERE id = ?", projectId);
  });
}

const running = new Map(); // projectId -> runId

export function activeRun(projectId) {
  const id = running.get(projectId);
  return id ? get('SELECT * FROM runs WHERE id = ?', id) : null;
}

// Starts a check in the background and returns the run id straight away.
export function startRun(projectId, trigger = 'manual') {
  if (running.has(projectId)) return { runId: running.get(projectId), already: true };
  const project = getProject(projectId);
  if (!project) throw new Error('Project not found');
  const simulated = project.data_mode !== 'live';
  const prompts = all('SELECT * FROM prompts WHERE project_id = ? AND active = 1', projectId);
  const engines = project.engines.filter(e => ENGINES[e]?.supported);
  const runId = Number(run('INSERT INTO runs(project_id, trigger, simulated, total) VALUES (?,?,?,?)',
    projectId, trigger, simulated ? 1 : 0, prompts.length * engines.length).lastInsertRowid);
  running.set(projectId, runId);
  execute(runId, project, prompts, engines, simulated)
    .catch(e => run("UPDATE runs SET status = 'failed', message = ?, finished_at = datetime('now') WHERE id = ?", String(e.message || e), runId))
    .finally(() => running.delete(projectId));
  return { runId };
}

async function execute(runId, project, prompts, engines, simulated) {
  const brands = brandsOf(project.id);
  const day = isoDay(Date.now());
  const messages = [];
  let done = 0, failed = 0, cost = 0;
  const bump = () => run('UPDATE runs SET done = ?, failed = ?, cost = ? WHERE id = ?', done, failed, cost, runId);

  if (simulated) {
    // Pretend it takes a little time, so the demo feels like the real thing.
    for (const prompt of prompts) {
      for (const engine of engines) {
        const result = simulateAnswer({ prompt, engine, day: day, brands, category: project.category, projectId: project.id + 1000 * runId });
        storeAnswer({ runId, project, prompt, engine, day, result, simulated: true, cost: 0, brands });
        done++;
      }
      bump();
      await new Promise(r => setTimeout(r, 60));
    }
  } else {
    const prices = getSetting('prices', {});
    const cap = Number(getSetting('monthly_cap', 0));
    const keys = Object.fromEntries(engines.map(e => [e, getSetting(ENGINES[e].keySetting) || process.env[ENGINES[e].keySetting.toUpperCase()]]));
    const usable = engines.filter(e => keys[e]);
    for (const e of engines) if (!keys[e]) messages.push(`${ENGINES[e].label} skipped: no API key connected.`);
    const jobs = prompts.flatMap(prompt => usable.map(engine => ({ prompt, engine })));
    let stopped = false;
    const worker = async () => {
      while (jobs.length && !stopped) {
        const { prompt, engine } = jobs.shift();
        const est = estimateAnswerCost(engine, prices);
        if (!cap || monthSpend() + est > cap) {
          stopped = true;
          messages.push(cap ? `Stopped: the monthly spending cap ($${cap}) would be exceeded.` : 'Stopped: no monthly spending cap is set. Set one in Settings → Costs first.');
          break;
        }
        try {
          const model = getSetting(ENGINES[engine].modelSetting) || ENGINES[engine].defaultModel;
          const result = await LIVE_ADAPTERS[engine]({ question: prompt.text, country: prompt.country, apiKey: keys[engine], model });
          const c = actualCost(engine, result.usage, prices);
          storeAnswer({ runId, project, prompt, engine, day, result, simulated: false, cost: c, brands });
          cost += c; done++;
        } catch (e) {
          failed++;
          const msg = String(e?.message || e).slice(0, 500);
          run('INSERT INTO answers(run_id, project_id, prompt_id, engine, day, simulated, error) VALUES (?,?,?,?,?,0,?)', runId, project.id, prompt.id, engine, day, msg);
          if (!messages.some(m => m.startsWith(ENGINES[engine].label))) messages.push(`${ENGINES[engine].label}: ${msg}`);
        }
        bump();
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (!usable.length) messages.push('No engine has an API key yet. Connect one in Settings → AI engines.');
  }
  bump();
  run("UPDATE runs SET status = ?, message = ?, finished_at = datetime('now') WHERE id = ?",
    failed && !done ? 'failed' : messages.length ? 'partial' : 'done', messages.join(' ') || null, runId);
  run("UPDATE projects SET last_run_at = datetime('now') WHERE id = ?", project.id);
}

// ---- Daily schedule ----
const INTERVAL_DAYS = { daily: 1, every3: 3, weekly: 7 };
export function startScheduler() {
  const tick = () => {
    const hour = Number(getSetting('run_hour_utc', 5));
    if (new Date().getUTCHours() < hour) return;
    for (const p of all("SELECT id, frequency, last_run_at, data_mode, engines FROM projects WHERE frequency != 'manual'")) {
      // Real-data projects only run automatically once an engine key and a spending cap are set.
      if (p.data_mode === 'live') {
        const keys = parseJSON(p.engines, []).filter(e => ENGINES[e]?.supported && (getSetting(ENGINES[e].keySetting) || process.env[ENGINES[e].keySetting.toUpperCase()]));
        if (!keys.length || !Number(getSetting('monthly_cap', 0))) continue;
      }
      const every = INTERVAL_DAYS[p.frequency] || 1;
      const last = p.last_run_at ? new Date(p.last_run_at + 'Z') : new Date(0);
      const due = isoDay(last.getTime() + every * 86400000) <= isoDay(Date.now());
      if (due) { try { startRun(p.id, 'scheduled'); } catch (e) { console.error('Scheduled run failed', e); } }
    }
  };
  setInterval(tick, 10 * 60 * 1000);
  setTimeout(tick, 30 * 1000);
}
