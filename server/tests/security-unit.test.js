// Unit tests for security helpers and the startup configuration check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'housedge-unit-'));
const { redact, startupCheck, configReport } = await import('../config.js');
const { safeHttpUrl, publicError, InputError, Limiter } = await import('../security.js');
const { isGoogleRedirect } = await import('../engines/live.js');

test('redact hides API keys, bearer tokens, key= parameters and known secrets', () => {
  const fake = { openai: 'sk-proj-' + 'A'.repeat(30), anthropic: 'sk-ant-' + 'b'.repeat(30), google: 'AIza' + 'c'.repeat(35), app: 'ait_' + 'd'.repeat(40) };
  const text = `bad key ${fake.openai} and ${fake.anthropic}, ${fake.google}, url?key=${fake.app}&x=1, Authorization: Bearer abcdefghijklmnop123, custom passphrase-secret-value`;
  const out = redact(text, ['passphrase-secret-value']);
  for (const v of [...Object.values(fake), 'abcdefghijklmnop123', 'passphrase-secret-value']) assert.ok(!out.includes(v), `leaked ${v.slice(0, 6)}…`);
  assert.match(out, /\[redacted\]/);
});

test('only plain web links are accepted from AI answers', () => {
  assert.equal(safeHttpUrl('https://example.com/a'), 'https://example.com/a');
  for (const u of ['javascript:alert(1)', 'JAVASCRIPT://example.com/%0aalert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'vbscript:x', 42, null, 'https://' + 'a'.repeat(3000)])
    assert.equal(safeHttpUrl(u), null, String(u).slice(0, 30));
});

test('Gemini redirect lookups only go to Google\'s redirect host (no SSRF)', () => {
  assert.ok(isGoogleRedirect('https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc'));
  for (const u of ['http://vertexaisearch.cloud.google.com/x', 'https://169.254.169.254/vertexaisearch', 'https://evil.example/grounding-api-redirect',
    'https://vertexaisearch.cloud.google.com.evil.example/x', 'https://vertexaisearch.cloud.google.com:8443/x', 'https://user@vertexaisearch.cloud.google.com/x', 'not a url'])
    assert.equal(isGoogleRedirect(u), false, u);
});

test('internal errors are hidden; our own messages are shown', () => {
  const internal = publicError(new TypeError("Cannot read properties of undefined (reading 'map')"));
  assert.equal(internal.status, 500);
  assert.match(internal.body.error, /Reference: [0-9a-f]{8}/);
  assert.ok(!internal.body.error.includes('undefined'));
  const sql = publicError(Object.assign(new Error('no such column: secret'), { code: 'ERR_SQLITE_ERROR' }));
  assert.equal(sql.status, 500);
  const own = publicError(new InputError('Name is too long.'));
  assert.deepEqual(own, { status: 400, body: { error: 'Name is too long.' } });
});

test('rate limiter blocks after the limit and forgets old entries', () => {
  const l = new Limiter({ windowMs: 50, max: 2 });
  assert.ok(l.check('a').ok); assert.ok(l.check('a').ok); assert.equal(l.check('a').ok, false);
  assert.ok(l.check('b').ok);
});

test('startup check: production refuses to start without a strong SETUP_CODE, never printing values', () => {
  const logs = []; let code = null;
  const log = { log: m => logs.push(m), error: m => logs.push(m), warn: m => logs.push(m) };
  startupCheck({ env: { NODE_ENV: 'production' }, exit: c => { code = c; }, log });
  assert.equal(code, 1);
  assert.match(logs.join('\n'), /SETUP_CODE is missing/);
  code = null; logs.length = 0;
  startupCheck({ env: { NODE_ENV: 'production', SETUP_CODE: 'short' }, exit: c => { code = c; }, log });
  assert.equal(code, 1);
  assert.ok(!logs.join('\n').includes('short'), 'value printed');
  code = null; logs.length = 0;
  const strong = 'a-long-test-passphrase-123';
  startupCheck({ env: { NODE_ENV: 'production', SETUP_CODE: strong, KEY_OPENAI: ['sk', 'test', 'x'.repeat(24)].join('-') }, exit: c => { code = c; }, log });
  assert.equal(code, null);
  assert.ok(!logs.join('\n').includes(strong) && !logs.join('\n').includes('sk-test'), 'value printed');
});

test('startup check: AI endpoint overrides (key exfiltration risk) stop production', () => {
  let code = null;
  const log = { log() {}, error() {}, warn() {} };
  startupCheck({ env: { NODE_ENV: 'production', SETUP_CODE: 'a-long-test-passphrase-123', ANTHROPIC_BASE_URL: 'https://evil.example' }, exit: c => { code = c; }, log });
  assert.equal(code, 1);
});

test('config report lists names and status only', () => {
  const rows = configReport({ SETUP_CODE: 'a-long-test-passphrase-123' });
  assert.ok(rows.every(r => Object.keys(r).sort().join() === 'name,required,secret,status'));
});

test('the real server process exits in production when SETUP_CODE is missing', () => {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', DATA_DIR: process.env.DATA_DIR, PORT: '0', NO_SCHEDULER: '1' }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr + r.stdout, /refusing to start/);
});

test('production sends plain-http visits to https, but leaves internal health checks alone', async () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `
    process.env.NODE_ENV = 'production';
    const { httpsOnly } = await import('./server/security.js');
    const out = [];
    const res = { redirect: (c, u) => out.push(['redirect', c, u]), status: c => ({ json: () => out.push(['status', c]) }) };
    const mk = (proto, method = 'GET') => ({ headers: proto ? { 'x-forwarded-proto': proto } : {}, method, get: () => 'example.com', originalUrl: '/login?x=1' });
    httpsOnly(mk('http'), res, () => out.push(['next']));
    httpsOnly(mk('http', 'POST'), res, () => out.push(['next']));
    httpsOnly(mk('https'), res, () => out.push(['next']));
    httpsOnly(mk(null), res, () => out.push(['next']));
    console.log(JSON.stringify(out));`], { encoding: 'utf8', env: { PATH: process.env.PATH, DATA_DIR: process.env.DATA_DIR } });
  assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), [['redirect', 301, 'https://example.com/login?x=1'], ['status', 403], ['next'], ['next']]);
});

test('REVOKE_SESSIONS_BEFORE ends older sign-ins without a code change', async () => {
  const { createUser, createSession, currentUser } = await import('../auth.js');
  const id = createUser({ email: 'revoke@test.local', password: 'Revoke-pass-123' });
  let token;
  createSession({ secure: false }, { cookie: (n, v) => { token = v; } }, id);
  const req = { cookies: { sid: token } };
  delete process.env.REVOKE_SESSIONS_BEFORE;
  assert.equal(currentUser(req)?.id, id);
  process.env.REVOKE_SESSIONS_BEFORE = new Date(Date.now() + 60_000).toISOString();
  assert.equal(currentUser(req), null, 'session made before the cutoff must be refused');
  process.env.REVOKE_SESSIONS_BEFORE = new Date(Date.now() - 3_600_000).toISOString();
  assert.equal(currentUser(req)?.id, id, 'sessions after the cutoff still work');
  delete process.env.REVOKE_SESSIONS_BEFORE;
});
