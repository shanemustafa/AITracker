import { useEffect, useState, createContext, useContext } from 'react';
import { ArrowDown, ArrowUp, Minus, X, Loader2, FlaskConical, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useColors } from './lib.js';

export const Card = ({ title, subtitle, right, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || right) && (
      <header className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
    )}
    <div className={pad ? 'p-5 pt-3' : ''}>{children}</div>
  </section>
);

export function Delta({ now, before, invert = false, unit = 'pts', digits = 1, short }) {
  if (now == null || before == null) return <span className="text-xs text-muted">{short ? '' : 'no earlier data'}</span>;
  const d = Math.round((now - before) * 10 ** digits) / 10 ** digits;
  if (Math.abs(d) < 0.05) return <span className="inline-flex items-center gap-1 text-xs text-muted"><Minus size={12} />no change</span>;
  const better = invert ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${better ? 'text-good' : 'text-bad'}`}>
      <Icon size={12} aria-hidden />{d > 0 ? '+' : ''}{d} {unit}
      <span className="sr-only">{better ? '(better)' : '(worse)'}</span>
    </span>
  );
}

export function Stat({ label, value, help, delta, sub }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        {label}{help && <Tip text={help} />}
      </div>
      <div className="mt-1.5 text-[28px] font-semibold leading-tight text-ink">{value}</div>
      <div className="mt-1 flex items-center gap-2">{delta}{sub && <span className="text-xs text-muted">{sub}</span>}</div>
    </div>
  );
}

export function Tip({ text }) {
  return (
    <span className="group relative inline-flex cursor-help text-muted" tabIndex={0} aria-label={text}>
      <Info size={13} />
      <span className="pointer-events-none absolute left-1/2 top-5 z-30 hidden w-64 -translate-x-1/2 rounded-lg border border-line bg-raised p-2.5 text-xs font-normal text-ink2 shadow-lg group-hover:block group-focus:block">{text}</span>
    </span>
  );
}

export const Badge = ({ children, tone = 'default', className = '' }) => {
  const tones = {
    default: 'bg-raised text-ink2 border-line', accent: 'bg-accentSoft text-ink border-accent',
    warn: 'bg-warnBg text-warnInk border-transparent', good: 'text-good border-good bg-transparent', bad: 'text-bad border-bad bg-transparent',
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}>{children}</span>;
};

export const SimBadge = () => <Badge tone="warn"><FlaskConical size={11} />Simulated data</Badge>;

export function SimBanner({ show, children }) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-warnBg px-4 py-2.5 text-sm text-warnInk" role="status">
      <FlaskConical size={16} className="mt-0.5 shrink-0" />
      <div><strong>Simulated data.</strong> {children || 'These are made-up demo answers, not real AI answers. Do not show these numbers to a client as real.'}</div>
    </div>
  );
}

export const Spinner = ({ label }) => (
  <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted"><Loader2 className="animate-spin" size={16} />{label || 'Loading…'}</div>
);
export const ErrorBox = ({ error }) => error ? (
  <div className="flex items-start gap-2 rounded-lg border border-bad px-3 py-2 text-sm text-bad"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</div>
) : null;
export const Empty = ({ title, children, action }) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
    <div className="text-sm font-medium text-ink">{title}</div>
    {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = e => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} bg-surface shadow-2xl`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button className="text-muted hover:text-ink" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Small toast messages ("Saved", "Copied").
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 3200); return () => clearTimeout(t); } }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm text-page shadow-xl flex items-center gap-2" role="status">
          <CheckCircle2 size={15} />{msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function BrandDot({ slot, size = 10 }) {
  const c = useColors();
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: c.brand(slot) }} aria-hidden />;
}

export function Bar({ value, max = 100, slot = 1 }) {
  const c = useColors();
  return (
    <div className="h-1.5 w-full min-w-[60px] rounded-full bg-raised border border-line overflow-hidden" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (100 * (value || 0)) / max))}%`, background: c.brand(slot) }} />
    </div>
  );
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-raised p-0.5" role="radiogroup">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-md ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs'} font-medium ${value === o.value ? 'bg-surface text-ink shadow-sm border border-line' : 'text-muted hover:text-ink border border-transparent'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const PageHeader = ({ title, subtitle, right }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>
);

export function Sentiment({ value, compact }) {
  if (value == null) return <span className="text-muted">—</span>;
  const tone = value >= 60 ? 'text-good' : value <= 40 ? 'text-bad' : 'text-ink2';
  return <span className={`tnum whitespace-nowrap ${tone}`}>{value}{!compact && <span className="text-muted text-xs"> /100</span>}</span>;
}
