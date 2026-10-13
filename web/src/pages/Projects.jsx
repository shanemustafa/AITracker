import { Link } from 'react-router-dom';
import { Plus, ArrowRight, Check, Loader2 } from 'lucide-react';
import { useApi, fmtPct, fmtPos, fmtDate } from '../lib.js';
import { useMeta } from '../ctx.js';
import { PageHeader, Spinner, ErrorBox, SimBadge, Badge, Empty, Sentiment } from '../ui.jsx';

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
  const { data, error } = useApi('/projects');
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Clients & projects" subtitle="Each project tracks one brand against its competitors. The dots show where each client is in the six-step journey."
        right={<Link to="/new" className="btn-primary"><Plus size={15} />New project</Link>} />
      {!data.length && <Empty title="No projects yet" action={<Link to="/new" className="btn-primary">Start the guided setup</Link>}>Create your first client project. It takes about two minutes.</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.map(p => (
          <Link key={p.id} to={`/p/${p.id}/journey`} className="card group flex flex-col p-5 transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="mt-0.5 text-xs text-muted">{meta.categories[p.category]} · {p.competitors} competitors</div>
              </div>
              {p.data_mode === 'live' ? <Badge tone="good">Live</Badge> : <SimBadge />}
            </div>
            <div className="mt-4"><StageDots index={p.stageIndex} complete={p.complete} /></div>
            <div className="mt-2 text-xs text-ink2">
              {p.complete ? 'All six steps done — ongoing tracking' : <>Next step: <span className="font-medium text-ink">{p.stage?.title}</span></>}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <div><div className="text-[11px] text-muted">Visibility</div><div className="tnum text-sm font-semibold">{fmtPct(p.own?.visibility)}</div></div>
              <div><div className="text-[11px] text-muted">Position</div><div className="tnum text-sm font-semibold">{fmtPos(p.own?.position)}</div></div>
              <div><div className="text-[11px] text-muted">Sentiment</div><div className="text-sm font-semibold"><Sentiment value={p.own?.sentiment} /></div></div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{p.running ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 size={12} className="animate-spin" />Checking now</span> : `Last check: ${p.last_run_at ? fmtDate(p.last_run_at) : 'never'}`}</span>
              <ArrowRight size={14} className="text-muted group-hover:text-ink" />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
