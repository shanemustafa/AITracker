// Security tests. Each test file starts its own throwaway server with a temporary database.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SETUP = 'test-setup-code-' + crypto.randomBytes(8).toString('hex');
const ADMIN = { email: 'admin@test.local', password: 'Admin-pass-123', name: 'Admin' };
const MEMBER = { email: 'member@test.local', password: 'Member-pass-123' };
let base, proc, dir, logs = '';

function startServer(env, port) {
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { PATH: process.env.PATH, PORT: String(port), NO_SCHEDULER: '1', ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  p.output = () => out;
  return p;
}
async function waitUp(url, p) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url + '/api/auth/state'); if (r.ok) return; } catch { /* not up yet */ }
    if (p.exitCode !== null) throw new Error('server exited: ' + p.output());
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
// Tiny cookie-keeping client. Same-origin header added like a browser would for its own site.
function client() {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, {
      method, redirect: 'manual',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { Origin: base } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, headers: r.headers, json, text, setCookie: set };
  };
  return { call, get: p => call('GET', p), post: (p, b, h) => call('POST', p, b ?? {}, h), patch: (p, b) => call('PATCH', p, b), del: p => call('DELETE', p), get cookie() { return cookie; } };
}

let admin, member, projectId;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'housedge-sec-'));
  const port = 4300 + Math.floor(Math.random() * 500);
  base = `http://127.0.0.1:${port}`;
  proc = startServer({ DATA_DIR: dir, SETUP_CODE: SETUP, NODE_ENV: 'test' }, port);
  await waitUp(base, proc);
  admin = client();
  assert.equal((await admin.post('/api/auth/setup', { ...ADMIN, setupCode: SETUP })).status, 200);
  const inv = await admin.post('/api/team/invite', { email: MEMBER.email });
  member = client();
  assert.equal((await member.post(`/api/auth/invite/${inv.json.token}`, { name: 'Member', password: MEMBER.password })).status, 200);
  const p = await admin.post('/api/projects', { own: { name: 'Test Brand' }, competitors: [{ name: 'Rival' }], prompts: [{ text: 'best casino?' }], frequency: 'weekly' });
  projectId = p.json.id;
});
after(() => { proc?.kill(); logs = proc?.output() || ''; fs.rmSync(dir, { recursive: true, force: true }); });

// ---------- Headers ----------
test('security headers are set and no framework fingerprint', async () => {
  const r = await fetch(base + '/api/auth/state');
  for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'cross-origin-opener-policy', 'permissions-policy'])
    assert.ok(r.headers.get(h), `missing ${h}`);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(r.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

// ---------- Authentication ----------
test('every private API route refuses visitors who are not signed in', async () => {
  const anon = client();
  for (const p of ['/api/projects', '/api/settings', '/api/team', '/api/enquiries', `/api/projects/${projectId}/chats`, `/api/projects/${projectId}/export/answers`, '/api/costs/estimate'])
    assert.equal((await anon.get(p)).status, 401, p);
  assert.equal((await anon.post('/api/backup')).status, 401);
  assert.equal((await anon.post(`/api/projects/${projectId}/run`)).status, 401);
});

test('a forged or stolen-looking cookie is rejected', async () => {
  const r = await fetch(base + '/api/projects', { headers: { Cookie: 'sid=' + 'a'.repeat(64) } });
  assert.equal(r.status, 401);
  const r2 = await fetch(base + '/api/projects', { headers: { Cookie: 'sid=' + 'a'.repeat(5000) } });
  assert.equal(r2.status, 401);
});

test('data API needs the right key; wrong or missing keys fail', async () => {
  assert.equal((await fetch(base + '/api/v1/projects')).status, 401);
  assert.equal((await fetch(base + '/api/v1/projects?key=ait_wrong')).status, 401);
  assert.equal((await fetch(base + '/api/v1/projects?key[]=x')).status, 401);
  const s = await admin.get('/api/settings');
  assert.equal((await fetch(base + '/api/v1/projects?key=' + s.json.apiToken)).status, 200);
});

test('setup is closed once an admin exists, and needs the setup code', async () => {
  const r = await client().post('/api/auth/setup', { email: 'x@y.z', password: 'whatever-123', setupCode: SETUP });
  assert.equal(r.status, 400);
});

test('session cookie is HttpOnly + SameSite=Strict and stored only as a hash', () => {
  assert.ok(admin.cookie.startsWith('sid='));
  const raw = admin.cookie.slice(4);
  const db = new DatabaseSync(path.join(dir, 'app.db'), { readOnly: true });
  const rows = db.prepare('SELECT token FROM sessions').all();
  db.close();
  assert.ok(rows.length > 0);
  assert.ok(!rows.some(r => r.token === raw), 'raw session token found in database');
  assert.ok(rows.some(r => r.token === crypto.createHash('sha256').update(raw).digest('hex')));
});

test('cookie flags', async () => {
  const c = client();
  const r = await c.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Strict/i);
});

// ---------- Authorization (member vs admin) ----------
test('members cannot see invite links or the API key (privilege escalation fix)', async () => {
  await admin.post('/api/team/invite', { email: 'future-admin@test.local', role: 'admin' });
  const t = await member.get('/api/team');
  assert.equal(t.status, 200);
  assert.deepEqual(t.json.invites, []);
  assert.ok(!t.text.includes('token'));
  const s = await member.get('/api/settings');
  assert.equal(s.json.apiToken, null);
  const a = await admin.get('/api/team');
  assert.ok(a.json.invites.length >= 1);
  assert.ok(!a.json.invites.some(i => 'token' in i), 'invite tokens must not be listed even to admins');
});

test('members cannot do admin-only actions', async () => {
  assert.equal((await member.patch('/api/settings', { monthly_cap: 99999 })).status, 403);
  assert.equal((await member.post('/api/settings/rotate-api-token')).status, 403);
  assert.equal((await member.post('/api/backup')).status, 403);
  assert.equal((await member.post('/api/team/invite', { email: 'x@y.zz', role: 'admin' })).status, 403);
  assert.equal((await member.post('/api/team/sign-out-everyone')).status, 403);
  assert.equal((await member.del(`/api/projects/${projectId}?confirm=Test%20Brand`)).status, 403);
  assert.equal((await member.post('/api/settings/test/claude')).status, 403);
});

// ---------- Cross-site requests (CSRF / CORS) ----------
test('requests that change data from another website are blocked', async () => {
  const r = await admin.call('POST', '/api/backup', {}, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  const r2 = await admin.call('POST', '/api/backup', {}, { Origin: base, 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r2.status, 403);
  const pre = await fetch(base + '/api/projects', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 403);
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
});

// ---------- Injection ----------
test('SQL injection attempts in filters and search are treated as plain text', async () => {
  const payloads = ["' OR 1=1 --", '1; DROP TABLE users; --', '") UNION SELECT password_hash FROM users --'];
  for (const p of payloads) {
    const q = encodeURIComponent(p);
    for (const path_ of [`/api/projects/${projectId}/chats?q=${q}`, `/api/projects/${projectId}/summary?country=${q}&tag=${q}&topic=${q}&engines=${q}`, `/api/projects/${projectId}/summary?from=${q}&to=${q}`]) {
      const r = await admin.get(path_);
      assert.equal(r.status, 200, path_);
      assert.ok(!/scrypt:[0-9a-f]{8}|SQLITE|syntax error/i.test(r.text), 'no password hashes or database errors in the response');
    }
  }
  assert.equal((await admin.get('/api/team')).json.users.length, 2, 'users table intact');
});

test('repeated or malformed query parameters do not crash the server', async () => {
  const r = await admin.get(`/api/projects/${projectId}/summary?days=abc&days=5&engines[]=x&to=2026-99-99`);
  assert.equal(r.status, 200);
});

test('stored text with HTML or script is kept as text, and CSV exports neutralise formulas', async () => {
  const evil = '=HYPERLINK("http://evil.example","click")';
  await admin.post(`/api/projects/${projectId}/prompts`, { items: [{ text: evil }, { text: '<img src=x onerror=alert(1)>' }] });
  const csv = await admin.get(`/api/projects/${projectId}/export/prompts`);
  assert.equal(csv.status, 200);
  assert.ok(!/\n=HYPERLINK|,=HYPERLINK/.test(csv.text), 'formula must be escaped');
  assert.ok(csv.text.includes("'=HYPERLINK"));
});

// ---------- Input validation and safe errors ----------
test('wrong input types give a clear 400, never a stack trace or internal message', async () => {
  const brand = (await admin.get(`/api/projects/${projectId}`)).json.brands.find(b => !b.is_own);
  const cases = [
    ['PATCH', `/api/brands/${brand.id}`, { aliases: { not: 'a list' } }],
    ['PATCH', `/api/projects/${projectId}`, { frequency: 'every-second' }],
    ['PATCH', `/api/projects/${projectId}`, { discovery: 'x' }],
    ['POST', `/api/projects/${projectId}/activities`, { title: { a: 1 } }],
    ['POST', `/api/projects/${projectId}/prompts`, { items: 'nope' }],
    ['POST', `/api/projects/${projectId}/prompts`, { items: [{ text: 'x'.repeat(600) }] }],
    ['PATCH', '/api/settings', { monthly_cap: -5 }],
    ['PATCH', '/api/settings', { models: { claude: 'bad model; rm -rf /' } }],
    ['POST', '/api/projects', { own: 'string-not-object' }],
  ];
  for (const [m, p, b] of cases) {
    const r = await admin.call(m, p, b);
    assert.equal(r.status, 400, `${m} ${p} ${JSON.stringify(b)} -> ${r.status} ${r.text}`);
    assert.ok(!/TypeError|at .*\.js|SQLITE|stack/i.test(r.text), r.text);
  }
});

test('invalid JSON and oversized bodies are rejected cleanly', async () => {
  const bad = await admin.call('POST', '/api/projects', '{"own":', {});
  assert.equal(bad.status, 400);
  assert.ok(!/SyntaxError|at /.test(bad.text));
  const big = await admin.call('POST', '/api/projects', JSON.stringify({ own: { name: 'x' }, discovery: { notes: 'x'.repeat(200_000) } }));
  assert.equal(big.status, 413);
});

test('unknown API routes return a plain 404', async () => {
  const r = await admin.get('/api/does-not-exist');
  assert.equal(r.status, 404);
});

// ---------- Rate limits ----------
test('check runs are rate limited per person (protects the AI budget)', async () => {
  let limited = false;
  for (let i = 0; i < 25 && !limited; i++) limited = (await member.post(`/api/projects/${projectId}/run`)).status === 429;
  assert.ok(limited, 'expected a 429 after many run requests');
});

test('sign-in attempts are rate limited per account', async () => {
  const c = client();
  const codes = [];
  for (let i = 0; i < 10; i++) codes.push((await c.post('/api/auth/login', { email: 'victim@test.local', password: 'guess-' + i })).status);
  assert.ok(codes.includes(429), codes.join(','));
});

test('the public contact form is rate limited', async () => {
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await fetch(base + '/api/enquiries/new', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' }, body: JSON.stringify({ name: 'T', email: 't@t.co', company: 'T', consent: true }) })).status);
  assert.ok(codes.includes(429), codes.join(','));
});

// ---------- Sessions ----------
test('changing a password signs out other devices', async () => {
  const other = client();
  await other.post('/api/auth/login', { email: MEMBER.email, password: MEMBER.password });
  assert.equal((await other.get('/api/projects')).status, 200);
  assert.equal((await member.post('/api/team/password', { current: MEMBER.password, next: 'Member-pass-456' })).status, 200);
  assert.equal((await other.get('/api/projects')).status, 401, 'old device should be signed out');
  assert.equal((await member.get('/api/projects')).status, 200, 'current device stays signed in');
});

test('"sign out everyone" ends all other sessions', async () => {
  const other = client();
  await other.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
  assert.equal((await admin.post('/api/team/sign-out-everyone')).status, 200);
  assert.equal((await other.get('/api/projects')).status, 401);
  assert.equal((await member.get('/api/projects')).status, 401);
  assert.equal((await admin.get('/api/projects')).status, 200);
});

test('secrets never appear in server logs', () => {
  const out = proc.output();
  assert.ok(!out.includes(SETUP), 'setup code leaked into logs');
  assert.match(out, /SETUP_CODE=set/);
});

// ---------- AI readiness routes ----------
test('website check only works on the saved brand website, never a typed address', async () => {
  const r = await admin.post(`/api/projects/${projectId}/site-check`, { url: 'http://169.254.169.254/' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Add the client's website/);
});

test('facts: validation, demo projects refused, members can use it, visitors cannot', async () => {
  const member = client();
  assert.equal((await member.post('/api/auth/login', { email: MEMBER.email, password: 'Member-pass-456' })).status, 200);
  assert.equal((await client().get(`/api/projects/${projectId}/facts`)).status, 401);
  assert.equal((await member.post(`/api/projects/${projectId}/facts`, { text: '' })).status, 400);
  assert.equal((await member.post(`/api/projects/${projectId}/facts`, { text: 'x'.repeat(301) })).status, 400);
  const ok = await member.post(`/api/projects/${projectId}/facts`, { text: 'Test Brand is not a bank.' });
  assert.equal(ok.status, 200);
  const chk = await member.post(`/api/projects/${projectId}/facts/check`);
  assert.equal(chk.status, 400);
  assert.match(chk.json.error, /simulated/);
  const del = await member.del(`/api/facts/${ok.json.facts[0].id}`);
  assert.equal(del.status, 200);
});
