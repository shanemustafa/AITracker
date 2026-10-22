// Request-level protection: security headers, same-origin checks, rate limits, input checks and safe errors.
import crypto from 'node:crypto';
import { isProduction, redact } from './config.js';

// ---------- Headers ----------
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.secure || isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', CSP);
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// In production, plain-http visits (reported by the hosting proxy) are sent to https.
// Requests without the proxy header (e.g. the host's internal health check) are left alone.
export function httpsOnly(req, res, next) {
  if (isProduction && req.headers['x-forwarded-proto'] === 'http' && (req.method === 'GET' || req.method === 'HEAD'))
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  if (isProduction && req.headers['x-forwarded-proto'] === 'http') return res.status(403).json({ error: 'Please use https.' });
  next();
}

// ---------- Strict CORS / cross-site request protection ----------
// The API never sends Access-Control-Allow-* headers, so other websites cannot read its responses.
// On top of that, any browser request that changes data must come from this site itself.
const SAFE = new Set(['GET', 'HEAD']);
export function sameOriginOnly(req, res, next) {
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  const own = `${req.protocol}://${req.get('host')}`;
  const allowed = !origin || origin === own || extra.includes(origin);
  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  if (!SAFE.has(req.method)) {
    if (!allowed) return res.status(403).json({ error: 'Cross-site request blocked.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Cross-site request blocked.' });
  }
  next();
}

// ---------- Rate limits ----------
// Small in-memory sliding window. Old entries are swept every minute so memory stays bounded.
export class Limiter {
  constructor({ windowMs, max }) { this.windowMs = windowMs; this.max = max; this.hits = new Map(); }
  check(key) {
    const now = Date.now();
    const list = (this.hits.get(key) || []).filter(t => now - t < this.windowMs);
    if (list.length >= this.max) { this.hits.set(key, list); return { ok: false, retryAfter: Math.ceil((this.windowMs - (now - list[0])) / 1000) }; }
    list.push(now); this.hits.set(key, list);
    return { ok: true };
  }
  reset(key) { this.hits.delete(key); }
  sweep() { const now = Date.now(); for (const [k, l] of this.hits) if (!l.some(t => now - t < this.windowMs)) this.hits.delete(k); }
}
const limiters = [];
setInterval(() => limiters.forEach(l => l.sweep()), 60_000).unref();

// keyFn picks who is limited (default: the visitor's IP address).
export function rateLimit({ windowMs, max, keyFn = req => req.ip || 'unknown', message = 'Too many requests. Please slow down and try again shortly.' }) {
  const l = new Limiter({ windowMs, max });
  limiters.push(l);
  const mw = (req, res, next) => {
    const r = l.check(keyFn(req));
    if (r.ok) return next();
    res.setHeader('Retry-After', String(r.retryAfter));
    res.status(429).json({ error: message });
  };
  mw.limiter = l;
  return mw;
}

// ---------- Input checks ----------
export class InputError extends Error { constructor(msg) { super(msg); this.status = 400; this.expose = true; } }
const bad = msg => { throw new InputError(msg); };

export const v = {
  str(val, { max = 200, required = false, label = 'Text' } = {}) {
    if (val === undefined || val === null) return required ? bad(`${label} is required.`) : undefined;
    if (typeof val !== 'string' && typeof val !== 'number') bad(`${label} must be text.`);
    const s = String(val).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (required && !s) bad(`${label} is required.`);
    if (s.length > max) bad(`${label} is too long (max ${max} characters).`);
    return s;
  },
  oneOf(val, allowed, label = 'Value') {
    if (val === undefined || val === null) return undefined;
    if (!allowed.includes(val)) bad(`${label} is not a valid choice.`);
    return val;
  },
  list(val, { max = 50, item = x => x, label = 'List' } = {}) {
    if (val === undefined || val === null) return undefined;
    if (!Array.isArray(val)) bad(`${label} must be a list.`);
    if (val.length > max) bad(`${label} has too many items (max ${max}).`);
    return val.map(item);
  },
  num(val, { min = 0, max = 1e9, label = 'Number', integer = false } = {}) {
    if (val === undefined || val === null || val === '') return undefined;
    const n = Number(val);
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) bad(`${label} must be a number.`);
    if (n < min || n > max) bad(`${label} must be between ${min} and ${max}.`);
    return n;
  },
  id(val) { const n = Number(val); return Number.isInteger(n) && n > 0 ? n : bad('Invalid id.'); },
  obj(val, { maxBytes = 20000, label = 'Data' } = {}) {
    if (val === undefined || val === null) return undefined;
    if (typeof val !== 'object' || Array.isArray(val)) bad(`${label} must be an object.`);
    if (JSON.stringify(val).length > maxBytes) bad(`${label} is too large.`);
    return val;
  },
};

// Only plain web links may be stored or shown as links (blocks javascript:, data:, file: and the like).
export function safeHttpUrl(u, max = 2000) {
  if (typeof u !== 'string' || u.length > max) return null;
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}

// ---------- Errors ----------
// Our own messages ("Please enter a name") are shown to the user. Anything unexpected (programming errors,
// database or provider internals) is logged on the server with a reference number and hidden from the browser.
const INTERNAL = [TypeError, RangeError, ReferenceError, SyntaxError, EvalError, URIError];
export function publicError(e) {
  const status = Number(e?.status) || 400;
  const internal = !e?.expose && (INTERNAL.some(C => e instanceof C) || status >= 500 || /^(ERR_|SQLITE)/.test(String(e?.code || '')));
  if (!internal) return { status, body: { error: redact(String(e?.message || 'Request failed.')).slice(0, 500) } };
  const ref = crypto.randomBytes(4).toString('hex');
  console.error(`[error ${ref}]`, redact(e?.stack || e));
  return { status: 500, body: { error: `Something went wrong on our side. Reference: ${ref}` } };
}

// Last-resort handler for errors Express itself raises (bad JSON, body too large, etc.).
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (res.headersSent) return;
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  const { status, body } = publicError(err);
  res.status(status).json(body);
}
