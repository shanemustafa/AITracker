import { useEffect, useState, createContext, useContext } from 'react';
import { ArrowDown, ArrowUp, Minus, X, Loader2, FlaskConical, Info, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useColors } from './lib.js';

export const Card = ({ title, subtitle, right, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || right) && (
      <header className="flex items-start justify-between gap-3 px-6 pt-5">
        <div>
          {title && <h2 className="text-[17px] font-semibold tracking-title text-ink">{title}</h2>}
          {subtitle && <p className="text-[13px] text-muted mt-1 leading-snug">{subtitle}</p>}
        </div>
        {right}
      </header>
    )}
    <div className={pad ? 'p-6 pt-4' : 'pt-2'}>{children}</div>
  </section>
);

export function Delta({ now, before, invert = false, unit = 'pts', digits = 1, short }) {
  if (now == null || before == null) return <span className="text-xs text-muted">{short ? '' : 'no earlier data'}</span>;
  const d = Math.round((now - before) * 10 ** digits) / 10 ** digits;
  if (Math.abs(d) < 0.05) return <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-xs text-muted"><Minus size={11} />no change</span>;
  const better = invert ? d < 0 : d > 0;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${better ? 'bg-goodSoft text-good' : 'bg-badSoft text-bad'}`}>
      <Icon size={11} strokeWidth={2.5} aria-hidden />{d > 0 ? '+' : ''}{d} {unit}
      <span className="sr-only">{better ? '(better)' : '(worse)'}</span>
    </span>
  );
}

export function Stat({ label, value, help, delta, sub }) {
  return (
    <div className="card rise p-5 md:p-6">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
        {label}{help && <Tip text={help} />}
      </div>
      <div className="mt-2 text-[34px] md:text-[40px] font-semibold leading-none tracking-display text-ink tnum">{value}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">{delta}{sub && <span className="text-xs text-muted">{sub}</span>}</div>
    </div>
  );
}

export function Tip({ text }) {
  return (
    <span className="group relative inline-flex cursor-help text-muted" tabIndex={0} aria-label={text}>
      <Info size={13} />
      <span className="glass pointer-events-none absolute left-1/2 top-5 z-30 hidden w-64 -translate-x-1/2 rounded-xl p-3 text-xs font-normal leading-relaxed text-ink2 shadow-lift group-hover:block group-focus:block" style={{ border: '1px solid var(--line)' }}>{text}</span>
    </span>
  );
}

export const Badge = ({ children, tone = 'default', className = '' }) => {
  const tones = {
    default: 'bg-fill text-ink2', accent: 'bg-accentSoft text-accent',
    warn: 'bg-warnBg text-warnInk', good: 'bg-goodSoft text-good', bad: 'bg-badSoft text-bad',
  };
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}>{children}</span>;
};

export const SimBadge = () => <Badge tone="warn"><FlaskConical size={11} />Simulated data</Badge>;

export function SimBanner({ show, children }) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-warnBg px-5 py-3 text-[13px] text-warnInk" role="status">
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
  <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
    <div className="text-[17px] font-semibold tracking-title text-ink">{title}</div>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className={`card rise w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} shadow-lift`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="text-[19px] font-semibold tracking-title">{title}</h3>
          <button className="grid h-7 w-7 place-items-center rounded-full bg-fill text-muted hover:text-ink" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <div className="p-6 pt-4">{children}</div>
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
        <div className="rise fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-page shadow-lift flex items-center gap-2" role="status">
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
    <div className="h-1.5 w-full min-w-[60px] rounded-full bg-fill overflow-hidden" aria-hidden>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (100 * (value || 0)) / max))}%`, background: c.brand(slot) }} />
    </div>
  );
}

export function Segmented({ value, onChange, options, size = 'md' }) {
  return (
    <div className="inline-flex rounded-[10px] bg-fill p-[3px]" role="radiogroup">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`rounded-[8px] ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]'} font-medium transition-all duration-200 ${value === o.value ? 'bg-surface text-ink shadow-thumb' : 'text-ink2 hover:text-ink'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const PageHeader = ({ title, subtitle, right }) => (
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-[28px] md:text-[34px] font-bold leading-tight tracking-display text-ink">{title}</h1>
      {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>
);

export function Sentiment({ value, compact }) {
  if (value == null) return <span className="text-muted">—</span>;
  const tone = value >= 60 ? 'text-good' : value <= 40 ? 'text-bad' : 'text-ink2';
  return <span className={`tnum whitespace-nowrap ${tone}`}>{value}{!compact && <span className="text-muted text-xs"> /100</span>}</span>;
}
