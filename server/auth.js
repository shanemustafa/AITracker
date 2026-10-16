// Logins, sessions, invites and the API token.
import crypto from 'node:crypto';
import { get, run, all, getSetting, setSetting } from './db.js';

const SESSION_DAYS = 30;
export const newToken = (n = 32) => crypto.randomBytes(n).toString('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

export function createUser({ email, name, password, role = 'member' }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw new Error('That email already has an account.');
  return Number(run('INSERT INTO users(email, name, password_hash, role) VALUES (?,?,?,?)', email, name || email.split('@')[0], hashPassword(password), role).lastInsertRowid);
}

export function createSession(res, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)', token, userId, expires.toISOString());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires });
}

export function currentUser(req) {
  const token = req.cookies?.sid;
  if (!token) return null;
  const row = get('SELECT u.id, u.email, u.name, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', token);
  if (!row || new Date(row.expires_at) < new Date()) return null;
  return row;
}

export function apiToken() {
  let t = getSetting('api_token');
  if (!t) { t = 'ait_' + newToken(20); setSetting('api_token', t); }
  return t;
}

// Login wall: everything under /api needs a session, except the few open routes.
// /api/v1 (for Google Sheets, Looker Studio, scripts) uses the API token instead.
export function requireAuth(req, res, next) {
  if (req.path.startsWith('/v1/')) {
    const t = req.query.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (t && t === apiToken()) return next();
    return res.status(401).json({ error: 'Missing or wrong API key. Find it in Settings → API & exports.' });
  }
  const open = ['/auth/login', '/auth/setup', '/auth/state', '/auth/invite', '/auth/reset'];
  if (open.some(p => req.path.startsWith(p))) return next();
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do this.' });
  next();
}

export function authRoutes(app) {
  app.get('/api/auth/state', (req, res) => {
    const users = get('SELECT COUNT(*) n FROM users').n;
    res.json({ needsSetup: users === 0, setupCodeRequired: !!process.env.SETUP_CODE, user: currentUser(req) });
  });
  app.post('/api/auth/setup', (req, res) => {
    if (get('SELECT COUNT(*) n FROM users').n > 0) return res.status(400).json({ error: 'Setup is already done. Please log in.' });
    if (process.env.SETUP_CODE && req.body.setupCode !== process.env.SETUP_CODE) return res.status(403).json({ error: 'Wrong setup code.' });
    try {
      const id = createUser({ ...req.body, role: 'admin' });
      createSession(res, id);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/auth/login', (req, res) => {
    const u = get('SELECT * FROM users WHERE email = ?', String(req.body.email || '').trim().toLowerCase());
    if (!u || !checkPassword(req.body.password || '', u.password_hash)) return res.status(401).json({ error: 'Wrong email or password.' });
    createSession(res, u.id);
    res.json({ ok: true });
  });
  // Forgot password: proven by the secret SETUP_CODE that only the hosting owner can see.
  const resetTries = new Map(); // ip -> [timestamps]
  app.post('/api/auth/reset', (req, res) => {
    const ip = req.ip || 'unknown';
    const recent = (resetTries.get(ip) || []).filter(t => Date.now() - t < 15 * 60 * 1000);
    if (recent.length >= 10) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
    resetTries.set(ip, [...recent, Date.now()]);
    if (!process.env.SETUP_CODE) return res.status(400).json({ error: 'Password reset is switched off: no setup code is set on the server.' });
    const given = Buffer.from(String(req.body.setupCode || ''));
    const real = Buffer.from(process.env.SETUP_CODE);
    if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) return res.status(403).json({ error: 'Wrong setup code.' });
    const u = get('SELECT id FROM users WHERE email = ?', String(req.body.email || '').trim().toLowerCase());
    if (!u) return res.status(404).json({ error: 'No account uses that email address.' });
    if (!req.body.password || req.body.password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id); // sign out everywhere else
    createSession(res, u.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.cookies?.sid) run('DELETE FROM sessions WHERE token = ?', req.cookies.sid);
    res.clearCookie('sid');
    res.json({ ok: true });
  });
  app.get('/api/auth/invite/:token', (req, res) => {
    const inv = get('SELECT email, accepted_at FROM invites WHERE token = ?', req.params.token);
    if (!inv || inv.accepted_at) return res.status(404).json({ error: 'This invite link is not valid any more.' });
    res.json({ email: inv.email });
  });
  app.post('/api/auth/invite/:token', (req, res) => {
    const inv = get('SELECT * FROM invites WHERE token = ?', req.params.token);
    if (!inv || inv.accepted_at) return res.status(404).json({ error: 'This invite link is not valid any more.' });
    try {
      const id = createUser({ email: inv.email, name: req.body.name, password: req.body.password, role: inv.role });
      run("UPDATE invites SET accepted_at = datetime('now') WHERE token = ?", inv.token);
      createSession(res, id);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Team management
  app.get('/api/team', (req, res) => {
    res.json({
      users: all('SELECT id, email, name, role, created_at FROM users ORDER BY id'),
      invites: all('SELECT token, email, role, created_at FROM invites WHERE accepted_at IS NULL ORDER BY created_at DESC'),
    });
  });
  app.post('/api/team/invite', requireAdmin, (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(400).json({ error: 'That person already has an account.' });
    const token = newToken(16);
    run('INSERT INTO invites(token, email, role, created_by) VALUES (?,?,?,?)', token, email, req.body.role === 'admin' ? 'admin' : 'member', req.user.id);
    res.json({ token });
  });
  app.delete('/api/team/invite/:token', requireAdmin, (req, res) => { run('DELETE FROM invites WHERE token = ?', req.params.token); res.json({ ok: true }); });
  app.delete('/api/team/user/:id', requireAdmin, (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
    run('DELETE FROM users WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/team/password', (req, res) => {
    const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!checkPassword(req.body.current || '', u.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
    if (!req.body.next || req.body.next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.next), req.user.id);
    res.json({ ok: true });
  });
}
