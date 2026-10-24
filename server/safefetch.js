// Fetches a public web page safely (used by the website check).
// Protects the server from being used to reach internal addresses (SSRF):
// - only http/https on the standard ports
// - every address a name resolves to is checked at connection time (no DNS tricks)
// - redirects are followed by hand, and each hop is checked again
// - small size and time limits
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isProduction } from './config.js';

// Automated tests only: lets the check reach the test's own server on this machine (loopback), nothing else.
const allowLoopback = () => process.env.SITE_CHECK_ALLOW_PRIVATE === '1' && !isProduction;
const isLoopback = ip => /^127\./.test(ip) || ip === '::1' || ip === '::ffff:127.0.0.1';
const blocked = ip => isBlockedAddress(ip) && !(allowLoopback() && isLoopback(ip));
export const USER_AGENT = 'HousedgeSiteCheck/1.0 (website readiness check requested by the site owner)';

function v4ToInt(ip) { return ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0; }
const V4_BLOCKED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([a, bits]) => [v4ToInt(a), bits]);

export function isBlockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x) || x.startsWith('2001:db8') || x.startsWith('64:ff9b');
  }
  return true;
}

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, family: options?.family || 0 }, (err, addrs) => {
    if (err) return callback(err);
    const ok = addrs.filter(a => !blocked(a.address));
    if (!ok.length) return callback(Object.assign(new Error('That address is not allowed.'), { code: 'EBLOCKED' }));
    if (options?.all) return callback(null, ok);
    callback(null, ok[0].address, ok[0].family);
  });
}

function checkUrl(u) {
  const url = new URL(u);
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Only web addresses can be checked.'), { code: 'EBLOCKED' });
  if (url.username || url.password) throw Object.assign(new Error('Addresses with passwords are not allowed.'), { code: 'EBLOCKED' });
  if (!allowLoopback() && url.port && !['80', '443'].includes(url.port)) throw Object.assign(new Error('Only standard web ports are allowed.'), { code: 'EBLOCKED' });
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && blocked(host)) throw Object.assign(new Error('That address is not allowed.'), { code: 'EBLOCKED' });
  return url;
}

function getOnce(url, { timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, { method: 'GET', lookup: guardedLookup, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain,application/xml;q=0.9,*/*;q=0.5' }, timeout: timeoutMs }, res => {
      const chunks = []; let size = 0;
      res.on('data', c => { size += c.length; if (size > maxBytes) { res.destroy(); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), truncated: true }); } else chunks.push(c); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('The website took too long to answer.'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

// Returns { status, headers, body, finalUrl, ms } or throws a readable error.
export async function safeGet(input, { timeoutMs = 10_000, maxBytes = 2_000_000, maxRedirects = 3 } = {}) {
  let url = checkUrl(input);
  const t0 = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const r = await getOnce(url, { timeoutMs, maxBytes });
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      url = checkUrl(new URL(r.headers.location, url).href);
      continue;
    }
    return { ...r, finalUrl: url.href, ms: Date.now() - t0 };
  }
  throw Object.assign(new Error('Too many redirects.'), { code: 'EREDIRECT' });
}
