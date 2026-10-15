import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertTriangle, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line } from 'recharts';
import { fmtPct, useColors } from '../lib.js';
import { useMeta } from '../ctx.js';
import { ActivityList, whenText } from './Activities.jsx';

const STAGES = ['Discovery', 'Project setup', 'First run', 'First report', 'Recommendations', 'Ongoing tracking'];
export const money = (n, cur = 'EUR') => (n == null ? null : new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n));

// Pipeline board: one column per client-journey stage, one card per client.
export default function Board({ projects, reload }) {
  const columns = STAGES.map((title, i) => {
    const items = projects.filter(p => (p.complete ? 5 : p.stageIndex) === i);
    return { title, i, items, value: items.reduce((s, p) => s + (p.fee || 0), 0) };
  });
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-10 md:px-10">
      <div className="flex gap-2.5">
        {columns.map(c => (
          <section key={c.title} className="flex min-w-[170px] flex-1 basis-0 flex-col rounded-2xl p-1.5" style={{ background: 'color-mix(in srgb, var(--fill) 55%, transparent)' }} aria-label={c.title}>
            <header className="px-2 pb-3 pt-2">
              <h2 className="text-[16px] font-semibold tracking-title text-ink">{c.title}</h2>
              <p className="mt-0.5 text-[12px] text-muted tnum">{c.value ? `${money(c.value)}/mo · ` : ''}{c.items.length} client{c.items.length === 1 ? '' : 's'}</p>
            </header>
            <div className="flex flex-1 flex-col gap-2">
              {c.items.map(p => <ClientCard key={p.id} p={p} reload={reload} />)}
              {!c.items.length && <div className="rounded-xl border-2 border-dashed px-3 py-6 text-center text-xs text-muted" style={{ borderColor: 'var(--line)' }}>No clients here</div>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function ClientCard({ p, reload }) {
  const nav = useNavigate();
  const meta = useMeta();
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef();
  const pop = useRef();
  // The pop-up floats above the page (so the board's scrolling never cuts it off).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current.getBoundingClientRect();
      const w = 320, left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
      const below = r.bottom + 6, tooLow = below + 300 > window.innerHeight;
      // Never taller than the space on screen; the list scrolls inside instead.
      setPos({ left, width: w, ...(tooLow ? { bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 18 } : { top: below, maxHeight: window.innerHeight - below - 12 }) });
    };
    place();
    const close = e => { if (!ref.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    // Re-place when the page or board scrolls, but not when the pop-up itself scrolls.
    const onScroll = e => { if (!pop.current?.contains(e.target)) place(); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);
  const a = p.activities || { open: 0, overdue: 0 };
  const status = a.overdue ? 'overdue' : a.open ? 'planned' : 'none';
  const vis = p.own?.visibility, prev = p.prevVisibility;
  const delta = vis != null && prev != null ? Math.round((vis - prev) * 10) / 10 : null;

  return (
    <div ref={ref} className="relative">
      <article onClick={() => nav(`/p/${p.id}/journey`)} role="link" tabIndex={0} onKeyDown={e => e.key === 'Enter' && nav(`/p/${p.id}/journey`)}
        className="card cursor-pointer p-3 transition-all duration-200 hover:-translate-y-px hover:shadow-lift">
        <div className="mb-2 flex gap-1" aria-hidden>
          <span className="h-1 w-8 rounded-full" style={{ background: p.data_mode === 'live' ? 'var(--good)' : '#eda100' }} />
          <span className="h-1 w-5 rounded-full" style={{ background: c.brand({ operator: 1, platform: 7, studio: 5 }[p.category] || 9) }} />
        </div>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-semibold text-ink">{p.name.replace(/\s*\(demo\)$/, '')}</h3>
            <p className="truncate text-[12px] text-muted">{p.own?.name || '—'} · {meta.categories[p.category]}</p>
          </div>
          <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }} aria-label="Activities"
            title={status === 'overdue' ? 'An activity is overdue' : status === 'planned' ? 'Next activity is planned' : 'No activity planned'}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 ${status === 'overdue' ? 'bg-bad text-white' : status === 'planned' ? 'bg-good text-white' : 'text-[#eda100]'}`}>
            {status === 'none' ? <AlertTriangle size={17} fill="currentColor" stroke="white" strokeWidth={2} /> : <ChevronRight size={15} strokeWidth={3} />}
          </button>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="text-[11px] text-muted">Visibility</div>
            <div className="flex items-center gap-1.5">
              <span className="text-[17px] font-semibold tracking-title tnum">{fmtPct(vis)}</span>
              {delta != null && Math.abs(delta) >= 0.1 && (
                <span className={`inline-flex items-center text-[11px] font-semibold ${delta > 0 ? 'text-good' : 'text-bad'}`}>
                  {delta > 0 ? <ArrowUp size={11} strokeWidth={3} /> : <ArrowDown size={11} strokeWidth={3} />}{Math.abs(delta)}
                </span>
              )}
            </div>
          </div>
          {p.spark?.length > 1 && (
            <div className="h-8 w-20 min-w-0" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={p.spark}><Line type="monotone" dataKey="v" stroke={c.brand(1)} strokeWidth={1.75} dot={false} isAnimationActive={false} /></LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="mt-3 text-[12px] font-semibold text-ink tnum">{p.fee ? `${money(p.fee, p.currency)}/mo` : <span className="font-normal text-muted">No fee set</span>}</div>
        <div className="mt-1 truncate text-[12px]" title={a.next?.title}>
          {p.running ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 size={11} className="animate-spin" />Checking now</span>
            : a.next ? <span className={`font-medium ${a.overdue ? 'text-bad' : 'text-good'}`}>{whenText(a.next.due_at)}</span>
              : <span className="text-muted">Nothing planned</span>}
        </div>
      </article>
      {open && pos && createPortal(
        <div ref={pop} className="glass rise fixed z-50 overflow-y-auto rounded-2xl shadow-lift" style={{ ...pos, border: '1px solid var(--line)' }} role="dialog" aria-label={`${p.own?.name} activities`}>
          <div className="px-4 pb-2 pt-3 text-[13px] font-semibold text-ink">{p.own?.name} · activities</div>
          <ActivityList projectId={p.id} compact onChange={reload} />
        </div>, document.body)}
    </div>
  );
}
