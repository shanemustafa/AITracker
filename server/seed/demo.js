// Creates the three demo projects (all SIMULATED data) the first time the app starts.
import { get, run, getSetting, setSetting } from '../db.js';
import { BRAND_LIBRARY, PROMPT_LIBRARY } from './library.js';
import { simulateHistory } from '../runner.js';
import { createReport } from '../reports.js';
import { computeActions } from '../actions.js';
import { isoDay } from '../metrics.js';

const lib = name => BRAND_LIBRARY.find(b => b.name === name);

export function nextColorSlot(projectId) {
  const used = new Set((get('SELECT group_concat(color) c FROM brands WHERE project_id = ?', projectId)?.c || '')
    .split(',').filter(Boolean).map(Number));
  for (let i = 2; i <= 8; i++) if (!used.has(i)) return i;
  return 9; // 9+ = shown in neutral grey ("other")
}

export function addBrand(projectId, { name, domain, aliases = [], is_own = false }) {
  const l = lib(name);
  const color = is_own ? 1 : nextColorSlot(projectId);
  return Number(run('INSERT INTO brands(project_id, name, domain, aliases, is_own, color) VALUES (?,?,?,?,?,?)',
    projectId, name, domain ?? l?.domain ?? null, JSON.stringify(aliases.length ? aliases : l?.aliases || []), is_own ? 1 : 0, String(color)).lastInsertRowid);
}

export function addPrompt(projectId, p) {
  return Number(run('INSERT INTO prompts(project_id, text, topic, tags, country, language, active) VALUES (?,?,?,?,?,?,?)',
    projectId, p.text.trim(), p.topic || null, JSON.stringify(p.tags || []), p.country || 'GLOBAL', p.language || 'en', p.active === false ? 0 : 1).lastInsertRowid);
}

function makeProject({ name, category, own, competitors, countries, discovery, frequency = 'daily' }) {
  const id = Number(run('INSERT INTO projects(name, category, data_mode, countries, frequency, discovery) VALUES (?,?,?,?,?,?)',
    name, category, 'simulated', JSON.stringify(countries), frequency, JSON.stringify(discovery)).lastInsertRowid);
  addBrand(id, { name: own, is_own: true });
  for (const c of competitors) addBrand(id, { name: c });
  for (const p of PROMPT_LIBRARY.filter(p => p.c === category)) addPrompt(id, { ...p, tags: [p.topic, p.c === 'operator' ? 'B2C' : 'B2B'] });
  return id;
}

export function seedDemo() {
  if (getSetting('demo_seeded')) return;
  console.log('Creating demo projects with SIMULATED data…');

  // 1) Operator — fully onboarded, 90 days of history, three monthly reports.
  const leo = makeProject({
    name: 'LeoVegas — Nordic & UK (demo)', category: 'operator', own: 'LeoVegas',
    competitors: ['Betsson', 'Unibet', 'Entain', 'Flutter'], countries: ['FI', 'SE', 'UK', 'DE', 'GLOBAL'],
    discovery: {
      competitors: 'Betsson, Unibet, Entain (bwin, Ladbrokes), Flutter (Paddy Power, PokerStars). Locally: Veikkaus and Paf in Finland.',
      markets: ['FI', 'SE', 'UK', 'DE'], questions: 'Best licensed casino in Finland after 2027; fastest withdrawals; best mobile app; safest casino.',
      goals: 'Be the most-recommended brand in Finland before the July 2027 market opening.', contact: 'Head of Brand (demo)',
    },
  });
  simulateHistory(leo, 90);
  const today = Date.now();
  createReport(leo, { to: isoDay(today - 60 * 86400000), days: 30 });
  // Mark a few recommendations as done between reports, so progress tracking has a story.
  const acts = computeActions(leo, { from: isoDay(today - 89 * 86400000), to: isoDay(today - 60 * 86400000) });
  for (const a of acts.slice(0, 3)) run("INSERT OR REPLACE INTO action_status(project_id, key, title, status, note, updated_at) VALUES (?,?,?,'done',?,?)",
    leo, a.key, a.title, 'Done by client team (demo).', new Date(today - 50 * 86400000).toISOString().replace('T', ' ').slice(0, 19));
  if (acts[3]) run("INSERT OR REPLACE INTO action_status(project_id, key, title, status) VALUES (?,?,?,'planned')", leo, acts[3].key, acts[3].title);
  createReport(leo, { to: isoDay(today - 30 * 86400000), days: 30 });
  createReport(leo, { to: isoDay(today), days: 30 });

  // 2) Platform — first run done, first report waiting.
  const finn = makeProject({
    name: 'Finnplay — B2B platform (demo)', category: 'platform', own: 'Finnplay',
    competitors: ['SoftSwiss', 'EveryMatrix', 'Playtech'], countries: ['FI', 'SE', 'UK', 'DE', 'GLOBAL'],
    discovery: {
      competitors: 'SoftSwiss, EveryMatrix, Playtech; also Kambi and GiG for sportsbook.', markets: ['FI', 'SE', 'GLOBAL'],
      questions: 'Which platform is ready for the Finnish licence regime? Best white-label platform in Europe?',
      goals: 'Be named when operators ask AI which platform to use for Finland.',
    },
  });
  simulateHistory(finn, 14);

  // 3) Game studio — discovery and setup done, no run yet (shows the guided flow).
  makeProject({
    name: 'Hacksaw Gaming — studio (demo)', category: 'studio', own: 'Hacksaw Gaming',
    competitors: ['Pragmatic Play', 'Evolution', 'Nolimit City', 'Relax Gaming', "Play'n GO"], countries: ['FI', 'SE', 'UK', 'DE', 'GLOBAL'],
    frequency: 'manual',
    discovery: {
      competitors: "Pragmatic Play, Nolimit City, Relax Gaming, Play'n GO; Evolution for live.", markets: ['FI', 'SE', 'UK', 'DE'],
      questions: 'Best high-volatility slots; most innovative studios; which providers to integrate first.',
    },
  });
  setSetting('demo_seeded', true);
  console.log('Demo projects ready.');
}
