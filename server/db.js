// Database: one SQLite file on disk (data/app.db). Everything the app knows lives here.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, process.env.DB_FILE || 'app.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), accepted_at TEXT
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value TEXT );

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'operator',
  data_mode TEXT NOT NULL DEFAULT 'simulated',           -- 'simulated' or 'live'
  engines TEXT NOT NULL DEFAULT '["chatgpt","gemini","perplexity","claude"]',
  countries TEXT NOT NULL DEFAULT '["FI"]',
  frequency TEXT NOT NULL DEFAULT 'daily',               -- daily | every3 | weekly | manual
  discovery TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), last_run_at TEXT
);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL, domain TEXT, aliases TEXT NOT NULL DEFAULT '[]',
  is_own INTEGER NOT NULL DEFAULT 0, color TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL, topic TEXT, tags TEXT NOT NULL DEFAULT '[]', country TEXT NOT NULL DEFAULT 'GLOBAL',
  language TEXT NOT NULL DEFAULT 'en', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', simulated INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT,
  total INTEGER DEFAULT 0, done INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, cost REAL DEFAULT 0, message TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY, run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  engine TEXT NOT NULL, day TEXT NOT NULL, text TEXT, model TEXT,
  simulated INTEGER NOT NULL DEFAULT 1, cost REAL DEFAULT 0, error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mentions (
  id INTEGER PRIMARY KEY, answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL, brand_id INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  position INTEGER, sentiment INTEGER, snippet TEXT
);
CREATE TABLE IF NOT EXISTS other_brands (
  answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL, name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY, answer_id INTEGER NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL, url TEXT, domain TEXT, title TEXT, category TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'periodic', period_start TEXT, period_end TEXT,
  simulated INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS action_status (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, key TEXT NOT NULL,
  title TEXT, status TEXT NOT NULL, note TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, key)
);
CREATE INDEX IF NOT EXISTS idx_answers_proj_day ON answers(project_id, day);
CREATE INDEX IF NOT EXISTS idx_answers_prompt ON answers(prompt_id);
CREATE INDEX IF NOT EXISTS idx_mentions_answer ON mentions(answer_id);
CREATE INDEX IF NOT EXISTS idx_mentions_proj ON mentions(project_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_citations_answer ON citations(answer_id);
CREATE INDEX IF NOT EXISTS idx_citations_proj ON citations(project_id, domain);
CREATE INDEX IF NOT EXISTS idx_other_proj ON other_brands(project_id, name);
`);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, JSON.stringify(value));
}

export const parseJSON = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

// Backup: a full copy of the database file, kept in data/backups.
export function backup(label = 'manual') {
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `app-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  // keep the 20 newest backups
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 20))) fs.unlinkSync(path.join(dir, f));
  return file;
}
