// Reports are frozen snapshots, so you can prove later what the numbers were at that time.
import { all, get, run, parseJSON } from './db.js';
import { summary, sources, perEngine, isoDay } from './metrics.js';
import { computeActions } from './actions.js';
import { getProject } from './runner.js';

export function createReport(projectId, { days = 30, to, title } = {}) {
  const project = getProject(projectId);
  const end = to || isoDay(Date.now());
  const f = { from: isoDay(new Date(end).getTime() - (days - 1) * 86400000), to: end, engines: [] };
  const s = summary(projectId, f);
  if (!s.totalAnswers) throw new Error('There are no answers in this period yet. Run a check first.');
  const previous = get('SELECT * FROM reports WHERE project_id = ? AND period_end < ? ORDER BY period_end DESC LIMIT 1', projectId, end);
  const kind = previous ? 'periodic' : 'first';
  const prevData = previous ? parseJSON(previous.data, null) : null;
  // Actions finished after the previous report's period and up to the end of this one.
  const doneSince = previous ? all(`SELECT key, title, status, note, updated_at FROM action_status WHERE project_id = ? AND status = 'done'
    AND substr(updated_at, 1, 10) > ? AND substr(updated_at, 1, 10) <= ? ORDER BY updated_at`, projectId, previous.period_end, end) : [];
  const src = sources(projectId, f, 15);
  const data = {
    project: { name: project.name, category: project.category },
    filter: f, summary: s,
    engines: perEngine(projectId, f).map(e => ({ engine: e.engine, totalAnswers: e.totalAnswers, brands: e.brands })),
    sources: { byType: src.byType, top: src.domains.slice(0, 12) },
    actions: computeActions(projectId, f).slice(0, 8),
    previous: prevData ? { id: previous.id, title: previous.title, period_end: previous.period_end, summary: prevData.summary } : null,
    actionsDone: doneSince,
  };
  const simulated = s.simulatedAnswers > 0 ? 1 : 0;
  const name = title || (kind === 'first' ? `First report — ${project.name}` : `Progress report — ${new Date(end).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`);
  const id = Number(run('INSERT INTO reports(project_id, title, kind, period_start, period_end, simulated, data) VALUES (?,?,?,?,?,?,?)',
    projectId, name, kind, f.from, f.to, simulated, JSON.stringify(data)).lastInsertRowid);
  return id;
}

export function listReports(projectId) {
  return all('SELECT id, title, kind, period_start, period_end, simulated, created_at FROM reports WHERE project_id = ? ORDER BY period_end DESC', projectId);
}

export function getReport(id) {
  const r = get('SELECT * FROM reports WHERE id = ?', id);
  return r ? { ...r, data: parseJSON(r.data, {}) } : null;
}

// The six client stages, worked out from what exists in the project.
export function workflow(projectId) {
  const p = getProject(projectId);
  const d = p.discovery || {};
  const brands = get('SELECT SUM(is_own) own, SUM(1 - is_own) comps FROM brands WHERE project_id = ?', projectId);
  const prompts = get('SELECT COUNT(*) n FROM prompts WHERE project_id = ?', projectId).n;
  const answers = get('SELECT COUNT(*) n FROM answers WHERE project_id = ? AND error IS NULL', projectId).n;
  const reports = get('SELECT COUNT(*) n FROM reports WHERE project_id = ?', projectId).n;
  const reviewed = get("SELECT COUNT(*) n FROM action_status WHERE project_id = ? AND status IN ('planned','done','dismissed')", projectId).n;
  const discoveryDone = !!(d.competitors?.trim() && d.markets?.length && d.questions?.trim());
  const stages = [
    { key: 'discovery', title: 'Discovery', desc: 'Record the client\'s real competitors, priority markets and example customer questions.', done: discoveryDone, to: 'discovery' },
    { key: 'setup', title: 'Project setup', desc: 'Brand, competitors and questions loaded into the project.', done: !!(brands?.own && brands?.comps && prompts), to: 'competitors',
      detail: `${brands?.comps || 0} competitors · ${prompts} questions` },
    { key: 'first_run', title: 'First run', desc: 'Ask the AI engines every question and collect the first answers.', done: answers > 0, to: 'overview', detail: `${answers} answers collected` },
    { key: 'first_report', title: 'First report', desc: 'The "reveal": client vs competitors on visibility, position, sentiment and the sources behind the gap.', done: reports > 0, to: 'reports' },
    { key: 'recommendations', title: 'Recommendations', desc: 'Agree a short, prioritised action list tied to the evidence.', done: reviewed > 0, to: 'actions', detail: `${reviewed} actions reviewed` },
    { key: 'tracking', title: 'Ongoing tracking', desc: 'Automatic runs plus monthly progress reports that show whether the numbers moved after actions.', done: reports > 1 && p.frequency !== 'manual', to: 'reports',
      detail: `${reports} reports · runs ${p.frequency}` },
  ];
  const current = stages.findIndex(s => !s.done);
  return { stages, current: current < 0 ? stages.length - 1 : current, complete: current < 0 };
}
