import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth')) { window.location.href = '/login'; throw new Error('Please log in.'); }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

// Loads data and reloads when `deps` change. Returns { data, error, loading, reload }.
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    setState(s => ({ ...s, loading: true }));
    api(path).then(data => setState({ data, error: null, loading: false }))
      .catch(error => setState({ data: null, error: error.message, loading: false }));
  }, [path]); // eslint-disable-line
  useEffect(load, [load, ...deps]);
  return { ...state, reload: load };
}

// ---- Theme (light / dark / follow the computer) ----
const listeners = new Set();
const media = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  const dark = t === 'dark' || (t !== 'light' && media.matches);
  document.documentElement.setAttribute('data-dark', dark ? 'true' : 'false');
  listeners.forEach(l => l());
}
media.addEventListener('change', applyTheme);
applyTheme();
export function setTheme(t) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try { t === 'system' ? localStorage.removeItem('theme') : localStorage.setItem('theme', t); } catch { /* private mode */ }
  applyTheme();
}
export function useDark() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => document.documentElement.getAttribute('data-dark') === 'true');
}

// Series colours (tested colour-blind-safe order). Slot 1 is always "your brand".
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#9a988f'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767', '#6f6d67'],
};
export function useColors() {
  const dark = useDark();
  const s = SERIES[dark ? 'dark' : 'light'];
  return {
    dark,
    brand: slot => s[Math.min(Math.max(Number(slot) || 9, 1), 9) - 1],
    grid: dark ? '#2c2c2a' : '#e1e0d9', axis: dark ? '#383835' : '#c3c2b7', muted: dark ? '#8e8c85' : '#7d7b75',
    ink: dark ? '#f0efec' : '#0b0b0b', surface: dark ? '#1a1a19' : '#fcfcfb',
  };
}

// ---- Filters kept in the address bar so links can be shared ----
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const f = {
    days: params.get('days') || '30', engines: params.get('engines') || '', country: params.get('country') || '',
    tag: params.get('tag') || '', topic: params.get('topic') || '',
  };
  const set = patch => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  return { f, set, qs };
}

export const fmtPct = v => (v == null ? '—' : `${Math.round(v * 10) / 10}%`);
export const fmtPos = v => (v == null ? '—' : `#${(Math.round(v * 10) / 10).toFixed(1)}`);
export const fmtMoney = v => `$${(v || 0).toFixed(v < 10 ? 2 : 0)}`;
export const fmtDate = d => (d ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d.replace(' ', 'T') + (d.includes('Z') ? '' : 'Z'))
  .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const sentimentLabel = v => (v == null ? '—' : v >= 60 ? 'Positive' : v <= 40 ? 'Negative' : 'Neutral');
export const COUNTRY_FLAGS = { FI: '🇫🇮', SE: '🇸🇪', UK: '🇬🇧', DE: '🇩🇪', GLOBAL: '🌍' };
