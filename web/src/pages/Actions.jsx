import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Check, CalendarClock, EyeOff, RotateCcw, Quote, Info } from 'lucide-react';
import { useApi, useFilters, api, fmtDate, safeHref } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { PageHeader, Spinner, ErrorBox, Badge, SimBanner, Empty, Segmented, useToast } from '../ui.jsx';
import FilterBar from './FilterBar.jsx';
import { stagger } from '../motion.jsx';

const PRI = { high: { label: 'High priority', tone: 'bad' }, medium: { label: 'Medium', tone: 'warn' }, low: { label: 'Low', tone: 'default' } };
const TYPE = { source: 'Get mentioned', content: 'Content gap', engine: 'Engine gap', market: 'Market gap', reputation: 'Reputation', tracking: 'Tracking' };

export default function Actions() {
  const { project } = useProject();
  const { qs } = useFilters();
  const list = useApi(`/projects/${project.id}/actions?${qs}`);
  const [show, setShow] = useState('open');
  const toast = useToast();
  const setStatus = async (a, status) => {
    await api(`/projects/${project.id}/actions`, { method: 'POST', body: { key: a.key, title: a.title, status } });
    toast({ done: 'Marked as done — it will show up in the next progress report', planned: 'Added to the plan', dismissed: 'Hidden', open: 'Reopened' }[status]);
    list.reload();
  };
  const track = async name => { await api(`/projects/${project.id}/brands`, { method: 'POST', body: { name } }); toast(`Now tracking ${name}`); list.reload(); };
  if (list.error) return <ErrorBox error={list.error} />;
  const counts = (list.data || []).reduce((m, a) => ({ ...m, [a.status]: (m[a.status] || 0) + 1 }), {});
  const rows = (list.data || []).filter(a => show === 'all' || a.status === show || (show === 'open' && a.status === 'planned'));
  return (
    <>
      <PageHeader title="Suggested actions" subtitle="Plain-English ideas, most important first. Each one shows the evidence from the answers we collected." />
      <FilterBar />
      <div className="mb-3"><SimBanner show={project.data_mode !== 'live'} /></div>
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink2">
        <Info size={14} className="mt-0.5 shrink-0 text-muted" />
        <span>These are suggestions, not promises. Nobody can guarantee how an AI will answer. Only take honest actions: correct facts, real news, real content. Never fake reviews or posts, and follow gambling advertising rules in each market.</span>
      </div>
      <div className="mb-4">
        <Segmented value={show} onChange={setShow} options={[
          { value: 'open', label: `To do (${(counts.open || 0) + (counts.planned || 0)})` }, { value: 'done', label: `Done (${counts.done || 0})` },
          { value: 'dismissed', label: `Hidden (${counts.dismissed || 0})` }, { value: 'all', label: 'All' },
        ]} />
      </div>
      {!list.data ? <Spinner /> : !rows.length ? <Empty art={show === 'open'} title={show === 'open' ? 'Nothing to do right now' : 'Nothing here'}>{show === 'open' ? 'Either there is not enough data yet, or you have handled every suggestion.' : ''}</Empty> : (
        <div className="flex flex-col gap-3">
          {rows.map((a, i) => (
            <article key={a.key} className="card rise p-5" style={stagger(i)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tnum text-muted">{i + 1}.</span>
                <Badge tone={PRI[a.priority].tone}>{PRI[a.priority].label}</Badge>
                <Badge>{TYPE[a.type] || a.type}</Badge>
                {a.status === 'planned' && <Badge tone="accent"><CalendarClock size={11} />Planned</Badge>}
                {a.status === 'done' && <Badge tone="good"><Check size={11} />Done {fmtDate(a.status_at)}</Badge>}
              </div>
              <h3 className="mt-2 font-semibold">{a.title}</h3>
              <p className="mt-1 text-sm text-ink2">{a.why}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">What to do</div>
                  <ol className="list-decimal pl-5 text-sm text-ink2 space-y-1">{a.steps.map(s => <li key={s}>{s}</li>)}</ol>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-muted">Evidence</div>
                  <div className="flex flex-wrap gap-1.5">{a.evidence.stats?.map(s => <span key={s} className="chip">{s}</span>)}</div>
                  {a.evidence.links?.length > 0 && <ul className="mt-2 grid gap-1 text-xs">{a.evidence.links.map(l => <li key={l.url}><a className="inline-flex items-center gap-1 hover:underline" href={safeHref(l.url)} target="_blank" rel="noopener noreferrer">{l.title || l.url}<ExternalLink size={11} /></a></li>)}</ul>}
                  {a.evidence.quotes?.map(q => <blockquote key={q.text} className="mt-2 flex gap-2 rounded-lg bg-raised p-2 text-xs text-ink2"><Quote size={12} className="shrink-0 text-muted" />{q.text}</blockquote>)}
                  {a.evidence.promptId && <Link to={`../chats?prompt=${a.evidence.promptId}`} className="mt-2 inline-block text-xs text-accent underline">Read the answers</Link>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                {a.suggestion && a.status !== 'done' && <button className="btn-primary btn-sm" onClick={() => track(a.suggestion)}>Track {a.suggestion}</button>}
                {a.status !== 'done' && <button className="btn-ghost btn-sm" onClick={() => setStatus(a, 'done')}><Check size={13} />Mark done</button>}
                {a.status === 'open' && <button className="btn-ghost btn-sm" onClick={() => setStatus(a, 'planned')}><CalendarClock size={13} />Add to plan</button>}
                {a.status !== 'dismissed' && a.status !== 'done' && <button className="btn-ghost btn-sm" onClick={() => setStatus(a, 'dismissed')}><EyeOff size={13} />Not relevant</button>}
                {a.status !== 'open' && <button className="btn-ghost btn-sm" onClick={() => setStatus(a, 'open')}><RotateCcw size={13} />Reopen</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
