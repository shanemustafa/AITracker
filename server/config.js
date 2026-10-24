// Every environment variable the app reads, checked once at startup.
// Values are never printed: the startup log shows names and "set / missing / invalid" only.

export const isProduction = process.env.NODE_ENV === 'production';

const int = (min, max) => v => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

// secret: rotate after a leak. required: production refuses to start without it.
export const ENV_SPEC = [
  { name: 'SETUP_CODE', secret: true, required: true, check: v => v.length >= 16,
    help: 'Long random passphrase (16+ characters). Needed to create the first admin and to reset a forgotten password.' },
  { name: 'KEY_OPENAI', secret: true, help: 'Optional. OpenAI API key (otherwise pasted in Settings → AI engines).' },
  { name: 'KEY_GEMINI', secret: true, help: 'Optional. Google Gemini API key.' },
  { name: 'KEY_PERPLEXITY', secret: true, help: 'Optional. Perplexity API key.' },
  { name: 'KEY_ANTHROPIC', secret: true, help: 'Optional. Anthropic (Claude) API key.' },
  { name: 'DATA_DIR', help: 'Folder for the database and backups. Must be a persistent volume in production.' },
  { name: 'PORT', check: int(1, 65535), help: 'Web port.' },
  { name: 'NODE_ENV', help: '"production" on the hosting service.' },
  { name: 'SESSION_DAYS', check: int(1, 90), help: 'Optional. How long a sign-in lasts (default 14 days).' },
  { name: 'REVOKE_SESSIONS_BEFORE', check: v => !isNaN(Date.parse(v)), help: 'Optional. Date and time (e.g. 2026-10-22T12:00:00Z); every sign-in made before it is ended. Use after a leak.' },
  { name: 'API_RATE_LIMIT_PER_MIN', check: int(60, 100000), help: 'Optional. Requests per minute per address before the API slows a visitor down (default 600).' },
  { name: 'ALLOWED_ORIGINS', help: 'Optional. Extra website addresses (comma separated) allowed to call the API from a browser.' },
  { name: 'SEED_DEMO', help: 'Optional. "1" loads simulated demo clients on an empty database.' },
];

// Settings that redirect AI traffic. Only for automated tests: in production they could send API keys elsewhere.
export const AI_ENDPOINT_OVERRIDES = ['OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'GEMINI_BASE_URL', 'PERPLEXITY_BASE_URL'];

export function configReport(env = process.env) {
  return ENV_SPEC.map(s => {
    const v = env[s.name];
    const status = v === undefined || v === '' ? 'missing' : s.check && !s.check(v.trim()) ? 'invalid' : 'set';
    return { name: s.name, secret: !!s.secret, required: !!s.required, status };
  });
}

// Logs the configuration (names only). In production, stops the app when something required is wrong,
// so a bad deployment never goes live (the hosting service keeps the previous version running).
export function startupCheck({ env = process.env, exit = code => process.exit(code), log = console } = {}) {
  const rows = configReport(env);
  const problems = [];
  for (const r of rows) {
    if (r.status === 'invalid') problems.push(`${r.name} is set but not valid`);
    if (r.status === 'missing' && r.required) problems.push(`${r.name} is missing`);
  }
  const overrides = AI_ENDPOINT_OVERRIDES.filter(n => env[n]);
  if (env.SITE_CHECK_ALLOW_PRIVATE && env.NODE_ENV === 'production') problems.push('SITE_CHECK_ALLOW_PRIVATE must not be set in production (it would let the website check reach internal addresses)');
  if (overrides.length && env.ALLOW_AI_ENDPOINT_OVERRIDE !== '1') problems.push(`${overrides.join(', ')} must not be set (they redirect AI traffic and API keys)`);
  log.log('Configuration check: ' + rows.map(r => `${r.name}=${r.status}`).join(', '));
  if (!problems.length) return { ok: true, rows };
  if (env.NODE_ENV === 'production') {
    log.error(`FATAL: unsafe configuration, refusing to start: ${problems.join('; ')}. Fix the variables in the hosting dashboard and redeploy.`);
    exit(1);
  } else {
    log.warn(`WARNING (allowed outside production): ${problems.join('; ')}.`);
  }
  return { ok: false, rows, problems };
}

// Removes anything that looks like a key or a configured secret from text before it is logged, stored or shown.
const KEY_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, /AIza[0-9A-Za-z_-]{20,}/g, /pplx-[A-Za-z0-9]{16,}/g,
  /ait_[A-Za-z0-9]{16,}/g, /(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, /([?&](?:key|api_key|token)=)[^&\s"']+/gi,
];
export function redact(text, secrets = []) {
  let s = String(text ?? '');
  for (const v of secrets) if (v && String(v).length >= 6) s = s.split(String(v)).join('[redacted]');
  for (const re of KEY_PATTERNS) s = s.replace(re, (m, p1) => (typeof p1 === 'string' && m.startsWith(p1) ? p1 : '') + '[redacted]');
  return s;
}
