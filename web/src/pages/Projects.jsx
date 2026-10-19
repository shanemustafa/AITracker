import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, ArrowRight, Check, Loader2, Columns3, LayoutGrid } from 'lucide-react';
import Board, { money } from './Board.jsx';
import { useApi, fmtPct, fmtPos, fmtDate } from '../lib.js';
import { useMeta, useUser } from '../ctx.js';
import { PageHeader, Spinner, ErrorBox, SimBadge, Badge, Empty, Sentiment, Segmented } from '../ui.jsx';
import { stagger, Skeleton } from '../motion.jsx';

const STAGES = ['Discovery', 'Setup', 'First run', 'First report', 'Actions', 'Tracking'];

export function StageDots({ index, complete }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Stage ${index + 1} of 6`}>
      {STAGES.map((s, i) => {
        const done = complete || i < index, now = !complete && i === index;
        return (
          <div key={s} className="flex items-center gap-1" title={s}>
            <span className={`grid h-5 w-5 place-items-center rounded-full border text-[10px] font-semibold ${done ? 'bg-accent border-accent text-white' : now ? 'border-accent text-accent bg-accentSoft' : 'border-line text-muted'}`}>
              {done ? <Check size={11} /> : i + 1}
            </span>
            {i < STAGES.length - 1 && <span className={`h-px w-3 ${done ? 'bg-accent' : 'bg-line'}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function Projects() {
  const meta = useMeta();
  const { data, error, reload } = useApi('/projects');
  const user = useUser();
  const legal = useApi('/legal');
  const legalMissing = user?.role === 'admin' && legal.data && !(legal.data.company.name && legal.data.company.businessId && legal.data.company.email);
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('clientsView') || 'board'; } catch { return 'board'; } });
  const setView = v => { setViewState(v); try { localStorage.setItem('clientsView', v); } catch { /* private mode */ } };
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Skeleton rows={1} />;
  const total = data.reduce((s, p) => s + (p.fee || 0), 0);
  return (
    <>
      <PageHeader title="Clients" subtitle={view === 'board' ? 'Every client, by where they are in the journey. The dot on each card shows follow-ups: green = planned, red = overdue, amber = nothing planned.' : 'Each project tracks one brand against its competitors.'}
        right={<>
          <span className="text-[13px] text-ink2 tnum">{total ? <><strong className="text-ink">{money(total)}</strong>/mo · </> : null}{data.length} clients</span>
          <Segmented value={view} onChange={setView} options={[
            { value: 'board', label: <span className="inline-flex items-center gap-1.5"><Columns3 size={14} />Board</span> },
            { value: 'cards', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid size={14} />Cards</span> },
          ]} />
          <Link to="/new" className="btn-primary"><Plus size={15} />New client</Link>
        </>} />
      {legalMissing && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warnBg px-5 py-3 text-[13px] text-warnInk">
        <span><strong>Finish your legal pages.</strong> Add your company name, business ID and contact email so the Privacy policy and Terms are complete.</span>
        <Link to="/settings#company" className="btn-ghost btn-sm">Add company details</Link></div>}
      {view === 'board' && data.length > 0 && <Board projects={data} reload={reload} />}
      {!data.length && <Empty art title="No clients yet" action={<Link to="/new" className="btn-primary">Start the guided setup</Link>}>Create your first client project. It takes about two minutes.</Empty>}
      {view === 'cards' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map((p, i) => (
          <Link key={p.id} to={`/p/${p.id}/journey`} style={stagger(i)} className="card rise group flex flex-col p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[17px] font-semibold tracking-title">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted">{meta.categories[p.category]} · {p.competitors} competitors</div>
              </div>
              {p.data_mode === 'live' ? <Badge tone="good">Live</Badge> : <SimBadge />}
            </div>
            <div className="mt-4"><StageDots index={p.stageIndex} complete={p.complete} /></div>
            <div className="mt-2 text-xs text-ink2">
              {p.complete ? 'All six steps done — ongoing tracking' : <>Next step: <span className="font-medium text-ink">{p.stage?.title}</span></>}
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-raised py-3 text-center">
              <div><div className="text-[11px] text-muted">Visibility</div><div className="tnum text-[19px] font-semibold tracking-title">{fmtPct(p.own?.visibility)}</div></div>
              <div><div className="text-[11px] text-muted">Position</div><div className="tnum text-[19px] font-semibold tracking-title">{fmtPos(p.own?.position)}</div></div>
              <div><div className="text-[11px] text-muted">Sentiment</div><div className="text-[19px] font-semibold tracking-title"><Sentiment value={p.own?.sentiment} compact /></div></div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{p.running ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 size={12} className="animate-spin" />Checking now</span> : `Last check: ${p.last_run_at ? fmtDate(p.last_run_at) : 'never'}`}</span>
              <ArrowRight size={14} className="text-muted group-hover:text-ink" />
            </div>
          </Link>
        ))}
      </div>}
    </>
  );
}
