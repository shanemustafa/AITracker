// Logins, sessions, invites and the API token.
import crypto from 'node:crypto';
import { get, run, all, getSetting, setSetting } from './db.js';
import { isProduction } from './config.js';
import { rateLimit } from './security.js';

const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 14;
const INVITE_DAYS = 7;
export const newToken = (n = 32) => crypto.randomBytes(n).toString('hex');
// Sign-in tokens are stored only as a hash, so a copy of the database cannot be used to sign in.
const sha256 = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
const DUMMY_HASH = hashPassword(newToken());
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pw), salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}
const validPassword = pw => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

export function createUser({ email, name, password, role = 'member' }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) throw new Error('Please enter a valid email address.');
  if (!validPassword(password)) throw new Error('Password must be 8 to 200 characters.');
  if (get('SELECT id FROM users WHERE email = ?', email)) throw new Error('That email already has an account.');
  const cleanName = String(name || email.split('@')[0]).trim().slice(0, 120);
  return Number(run('INSERT INTO users(email, name, password_hash, role) VALUES (?,?,?,?)', email, cleanName, hashPassword(password), role).lastInsertRowid);
}

export function createSession(req, res, userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  run("INSERT INTO sessions(token, user_id, expires_at, created_at) VALUES (?,?,?,datetime('now'))", sha256(token), userId, expires.toISOString());
  res.cookie('sid', token, { httpOnly: true, sameSite: 'strict', secure: isProduction || req.secure, expires, path: '/' });
}

export function currentUser(req) {
  const token = req.cookies?.sid;
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const row = get('SELECT u.id, u.email, u.name, u.role, s.expires_at, s.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?', sha256(token));
  if (!row || new Date(row.expires_at) < new Date()) return null;
  const cutoff = process.env.REVOKE_SESSIONS_BEFORE && Date.parse(process.env.REVOKE_SESSIONS_BEFORE);
  if (cutoff && Date.parse(row.created_at + 'Z') < cutoff) return null;
  const { expires_at, created_at, ...user } = row; // eslint-disable-line no-unused-vars
  return user;
}
export const clearExpiredSessions = () => run("DELETE FROM sessions WHERE expires_at < ?", new Date().toISOString());

export function apiToken() {
  let t = getSetting('api_token');
  if (!t) { t = 'ait_' + newToken(20); setSetting('api_token', t); }
  return t;
}

// Login wall: everything under /api needs a session, except the few open routes.
// /api/v1 (for Google Sheets, Looker Studio, scripts) uses the API token instead.
const OPEN = ['/auth/login', '/auth/setup', '/auth/state', '/auth/invite/', '/auth/reset', '/legal', '/enquiries/new'];
export function requireAuth(req, res, next) {
  if (req.path.startsWith('/v1/')) {
    const t = req.query.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (typeof t === 'string' && t && safeEqual(t, apiToken())) return next();
    return res.status(401).json({ error: 'Missing or wrong API key. Find it in Settings → API & exports.' });
  }
  if (OPEN.some(p => req.path === p || (p.endsWith('/') && req.path.startsWith(p)))) return next();
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Please log in.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only an admin can do this.' });
  next();
}

// Brute-force protection: per IP, and per account for sign-in.
const authLimit = rateLimit({ windowMs: 15 * 60_000, max: 20, message: 'Too many attempts. Please wait 15 minutes.' });
const accountLimit = rateLimit({ windowMs: 15 * 60_000, max: 8, keyFn: req => 'acct:' + String(req.body?.email || '').trim().toLowerCase(), message: 'Too many attempts for this account. Please wait 15 minutes.' });

export function authRoutes(app) {
  app.get('/api/auth/state', (req, res) => {
    const users = get('SELECT COUNT(*) n FROM users').n;
    res.json({ needsSetup: users === 0, setupCodeRequired: !!process.env.SETUP_CODE, user: currentUser(req) });
  });
  app.post('/api/auth/setup', authLimit, (req, res) => {
    if (get('SELECT COUNT(*) n FROM users').n > 0) return res.status(400).json({ error: 'Setup is already done. Please log in.' });
    if (!process.env.SETUP_CODE && isProduction) return res.status(503).json({ error: 'Setup is switched off: no setup code is set on the server.' });
    if (process.env.SETUP_CODE && !safeEqual(req.body?.setupCode, process.env.SETUP_CODE)) return res.status(403).json({ error: 'Wrong setup code.' });
    try {
      const id = createUser({ ...req.body, role: 'admin' });
      createSession(req, res, id);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/auth/login', authLimit, accountLimit, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    const u = get('SELECT * FROM users WHERE email = ?', email);
    // Same amount of work whether or not the account exists, so timing does not reveal registered emails.
    const ok = checkPassword(String(req.body?.password || '').slice(0, 200), u ? u.password_hash : DUMMY_HASH) && !!u;
    if (!ok) return res.status(401).json({ error: 'Wrong email or password.' });
    accountLimit.limiter.reset('acct:' + email);
    createSession(req, res, u.id);
    res.json({ ok: true });
  });
  // Forgot password: proven by the secret SETUP_CODE that only the hosting owner can see.
  app.post('/api/auth/reset', authLimit, (req, res) => {
    if (!process.env.SETUP_CODE) return res.status(400).json({ error: 'Password reset is switched off: no setup code is set on the server.' });
    if (!safeEqual(req.body?.setupCode, process.env.SETUP_CODE)) return res.status(403).json({ error: 'Wrong setup code.' });
    const u = get('SELECT id FROM users WHERE email = ?', String(req.body?.email || '').trim().toLowerCase());
    if (!u) return res.status(404).json({ error: 'No account uses that email address.' });
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'New password must be 8 to 200 characters.' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.password), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id); // sign out everywhere else
    createSession(req, res, u.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (typeof req.cookies?.sid === 'string') run('DELETE FROM sessions WHERE token = ?', sha256(req.cookies.sid));
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });
  const openInvite = token => {
    const inv = get('SELECT * FROM invites WHERE token = ?', sha256(token));
    if (!inv || inv.accepted_at || Date.now() - Date.parse(inv.created_at + 'Z') > INVITE_DAYS * 86400000) return null;
    return inv;
  };
  app.get('/api/auth/invite/:token', authLimit, (req, res) => {
    const inv = openInvite(req.params.token);
    if (!inv) return res.status(404).json({ error: 'This invite link is not valid any more.' });
    res.json({ email: inv.email });
  });
  app.post('/api/auth/invite/:token', authLimit, (req, res) => {
    const inv = openInvite(req.params.token);
    if (!inv) return res.status(404).json({ error: 'This invite link is not valid any more.' });
    try {
      const id = createUser({ email: inv.email, name: req.body?.name, password: req.body?.password, role: inv.role });
      run("UPDATE invites SET accepted_at = datetime('now') WHERE token = ?", inv.token);
      createSession(req, res, id);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // Team management. Pending invites (and their links) are visible to admins only:
  // an invite link for an admin role would otherwise let a member make themselves admin.
  app.get('/api/team', (req, res) => {
    const isAdmin = req.user.role === 'admin';
    res.json({
      users: all('SELECT id, email, name, role, created_at FROM users ORDER BY id'),
      invites: isAdmin ? all("SELECT rowid AS id, email, role, created_at FROM invites WHERE accepted_at IS NULL AND created_at > datetime('now', ?) ORDER BY created_at DESC", `-${INVITE_DAYS} days`) : [],
    });
  });
  app.post('/api/team/invite', requireAdmin, (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(400).json({ error: 'That person already has an account.' });
    const token = newToken(24);
    run('INSERT INTO invites(token, email, role, created_by) VALUES (?,?,?,?)', sha256(token), email, req.body?.role === 'admin' ? 'admin' : 'member', req.user.id);
    res.json({ token, expiresInDays: INVITE_DAYS }); // the link is shown once; only its hash is kept
  });
  app.delete('/api/team/invite/:id', requireAdmin, (req, res) => { run('DELETE FROM invites WHERE rowid = ?', Number(req.params.id)); res.json({ ok: true }); });
  app.delete('/api/team/user/:id', requireAdmin, (req, res) => {
    if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'You cannot remove yourself.' });
    run('DELETE FROM sessions WHERE user_id = ?', Number(req.params.id));
    run('DELETE FROM users WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });
  app.post('/api/team/password', authLimit, (req, res) => {
    const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!checkPassword(String(req.body?.current || '').slice(0, 200), u.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
    if (!validPassword(req.body?.next)) return res.status(400).json({ error: 'New password must be 8 to 200 characters.' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(req.body.next), req.user.id);
    run('DELETE FROM sessions WHERE user_id = ?', req.user.id); // end every other sign-in, then keep this one
    createSession(req, res, req.user.id);
    res.json({ ok: true });
  });
  // After a leak: end every sign-in for everyone except the admin pressing the button.
  app.post('/api/team/sign-out-everyone', requireAdmin, (req, res) => {
    const n = run('DELETE FROM sessions').changes;
    createSession(req, res, req.user.id);
    res.json({ ok: true, ended: Number(n) });
  });
}
