// One-time changes to an existing installation. Each runs once and records that it ran.
import { all, get, run, getSetting, setSetting, backup, tx } from './db.js';
import { PROMPT_LIBRARY } from './seed/library.js';
import { addBrand, addPrompt } from './seed/demo.js';

const hasUsers = () => get('SELECT COUNT(*) n FROM users').n > 0;

// Remove every simulated (demo) project and switch new projects to real data. A full backup is made first.
function removeDemoData() {
  if (getSetting('migr_remove_demo_v1') || process.env.SEED_DEMO === '1' || !hasUsers()) return;
  const demo = all("SELECT id, name FROM projects WHERE data_mode = 'simulated'");
  if (demo.length) {
    const file = backup('before-removing-demo-data');
    tx(() => { for (const p of demo) run('DELETE FROM projects WHERE id = ?', p.id); });
    console.log(`Removed ${demo.length} demo project(s): ${demo.map(p => p.name).join(', ')}. Backup: ${file}`);
  }
  run("DELETE FROM answers WHERE simulated = 1"); // any simulated answers left anywhere
  setSetting('mode', 'live');
  setSetting('demo_seeded', true);
  setSetting('demo_activities_seeded', true);
  setSetting('migr_remove_demo_v1', new Date().toISOString());
}

// Finnplay as the first real client (questions and competitors ready; real answers once an AI engine is connected).
function addFinnplay() {
  if (getSetting('migr_add_finnplay_v1') || process.env.SEED_DEMO === '1' || !hasUsers()) return;
  const exists = get("SELECT p.id FROM projects p JOIN brands b ON b.project_id = p.id AND b.is_own = 1 WHERE p.data_mode = 'live' AND lower(b.name) = 'finnplay'");
  if (!exists) {
    tx(() => {
      const id = Number(run(`INSERT INTO projects(name, category, data_mode, engines, countries, frequency, discovery) VALUES (?,?,?,?,?,?,?)`,
        'Finnplay', 'platform', 'live', JSON.stringify(['chatgpt', 'gemini', 'perplexity', 'claude']),
        JSON.stringify(['FI', 'SE', 'UK', 'DE', 'GLOBAL']), 'weekly', JSON.stringify({
          competitors: 'SoftSwiss, EveryMatrix, Playtech. Also watch Kambi and Gaming Innovation Group (GiG) for sportsbook.',
          markets: ['FI', 'SE', 'GLOBAL'],
          questions: 'Which iGaming platform is ready for the Finnish licence regime?\nWhat is the best white-label casino platform in Europe?',
          goals: 'Be named when operators ask AI assistants which platform to use for Finland\'s licensed market (opens July 2027).',
        })).lastInsertRowid);
      addBrand(id, { name: 'Finnplay', domain: 'finnplay.com', is_own: true });
      for (const c of ['SoftSwiss', 'EveryMatrix', 'Playtech']) addBrand(id, { name: c });
      for (const p of PROMPT_LIBRARY.filter(p => p.c === 'platform')) addPrompt(id, { ...p, tags: [p.topic, 'B2B'] });
    });
    console.log('Added Finnplay as a client (real data).');
  }
  setSetting('migr_add_finnplay_v1', new Date().toISOString());
}

export function runMigrations() {
  removeDemoData();
  addFinnplay();
}
