import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { useApi, fmtDate, useColors } from '../lib.js';
import { useProject } from '../ctx.js';
import { Card, Spinner, SimBanner, Badge, PageHeader } from '../ui.jsx';

const CTA = {
  discovery: 'Fill in discovery notes', setup: 'Review competitors & questions', first_run: 'Press "Run now" above',
  first_report: 'Create the first report', recommendations: 'Review suggested actions', tracking: 'Create a progress report',
};

export default function Journey() {
  const { project } = useProject();
  const wf = useApi(`/projects/${project.id}/workflow`);
  const reports = useApi(`/projects/${project.id}/reports`);
  if (!wf.data) return <Spinner />;
  const { stages, current, complete } = wf.data;
  return (
    <>
      <PageHeader title="Client journey" subtitle="The six steps from first conversation to proven progress. Each step turns green when the project has what it needs." />
      <div className="mb-4"><SimBanner show={project.data_mode !== 'live'}>This project uses simulated demo answers. Use it to practise the client journey, not to show real results.</SimBanner></div>
      <div className="grid gap-4 lg:grid-cols-5">
        <ol className="card lg:col-span-3 p-2">
          {stages.map((s, i) => {
            const isNow = !complete && i === current;
            return (
              <li key={s.key} className={`flex gap-4 rounded-lg p-4 ${isNow ? 'bg-accentSoft' : ''}`}>
                <div className="flex flex-col items-center">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold ${s.done ? 'border-accent bg-accent text-white' : isNow ? 'border-accent bg-surface text-accent' : 'border-line text-muted'}`}>
                    {s.done ? <Check size={15} /> : i + 1}
                  </span>
                  {i < stages.length - 1 && <span className={`mt-1 w-px flex-1 ${s.done ? 'bg-accent' : 'bg-line'}`} />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{s.title}</h3>
                    {s.done ? <Badge tone="good">Done</Badge> : isNow ? <Badge tone="accent">Next step</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-sm text-ink2">{s.desc}</p>
                  {s.detail && <p className="mt-1 text-xs text-muted">{s.detail}</p>}
                  {(isNow || s.key === 'tracking' || s.key === 'recommendations') && s.key !== 'first_run' && (
                    <Link to={`../${s.key === 'discovery' ? 'discovery' : s.to}`} className={`${isNow ? 'btn-primary' : 'btn-ghost'} btn-sm mt-3`}>{CTA[s.key]}<ArrowRight size={13} /></Link>
                  )}
                  {isNow && s.key === 'first_run' && <p className="mt-2 text-sm font-medium text-accent">{CTA.first_run}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card title="Discovery notes" right={<Link to="../discovery" className="text-xs text-muted underline">Edit</Link>}>
            <Notes d={project.discovery} />
          </Card>
          <Progress reports={reports.data} />
        </div>
      </div>
    </>
  );
}

function Notes({ d }) {
  const rows = [['Competitors', d.competitors], ['Markets', (d.markets || []).join(', ')], ['Example questions', d.questions], ['Goal', d.goals], ['Contact', d.contact]];
  return (
    <dl className="grid gap-2 text-sm">
      {rows.filter(r => r[1]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="whitespace-pre-line text-ink2">{v}</dd></div>)}
      {!rows.some(r => r[1]) && <p className="text-muted">Nothing recorded yet.</p>}
    </dl>
  );
}

// Visibility at each report: shows if the numbers moved after actions were taken.
function Progress({ reports }) {
  const c = useColors();
  if (!reports) return null;
  if (reports.length < 1) return <Card title="Progress over time"><p className="text-sm text-muted">After the first report, each new report adds a point here, so you can show the client how their numbers move.</p></Card>;
  return <ProgressChart reports={reports} c={c} />;
}

function ProgressChart({ reports, c }) {
  const details = useApi(`/reports-batch?ids=${reports.map(r => r.id).join(',')}`);
  const rows = (details.data || []).map(r => ({ label: fmtDate(r.period_end), visibility: r.own?.visibility, sov: r.own?.sov, done: r.actionsDone }))
    .reverse();
  return (
    <Card title="Progress over time" subtitle="Your visibility at each report. The note shows how many actions were completed before it.">
      {!details.data ? <Spinner /> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rows} margin={{ top: 22, right: 28, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} padding={{ left: 24, right: 24 }} />
            <YAxis unit="%" tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
            <Tooltip formatter={v => `${v}%`} contentStyle={{ background: 'var(--glass)', backdropFilter: 'blur(20px)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12, boxShadow: '0 18px 48px rgba(0,0,0,0.12)' }} />
            <Line dataKey="visibility" name="Visibility" stroke={c.brand(1)} strokeWidth={2.5} dot={{ r: 4, fill: c.brand(1), stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false}>
              <LabelList dataKey="visibility" position="top" formatter={v => `${v}%`} style={{ fill: c.ink, fontSize: 11 }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      )}
      <ul className="mt-2 grid gap-1 text-xs text-muted">
        {rows.map((r, i) => <li key={r.label}>{r.label}: {i === 0 ? 'starting point' : r.done ? `${r.done} actions completed before this report` : 'no new actions completed in between'}</li>)}
      </ul>
    </Card>
  );
}
