import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { FileText, Printer, Plus, Trash2, ArrowLeft, Check } from 'lucide-react';
import { useApi, api, fmtPct, fmtPos, fmtDate } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { Card, PageHeader, Spinner, ErrorBox, Badge, SimBadge, Empty, Delta, BrandDot, Bar, Sentiment, Modal, useToast } from '../ui.jsx';
import { VisibilitySentimentMap, HBars } from '../charts.jsx';

export default function Reports() {
  const { project } = useProject();
  const list = useApi(`/projects/${project.id}/reports`);
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(null);
  const create = async () => {
    setBusy(true); setErr(null);
    try { const r = await api(`/projects/${project.id}/reports`, { method: 'POST', body: { days: 30 } }); nav(`${r.id}`); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  const first = !list.data?.length;
  return (
    <>
      <PageHeader title="Reports" subtitle="A report freezes the numbers for a period, so you can show progress later. The first one is the 'reveal'; after that, make one each month."
        right={<button className="btn-primary" onClick={create} disabled={busy}><Plus size={15} />{busy ? 'Creating…' : first ? 'Create first report' : 'Create progress report'}</button>} />
      <ErrorBox error={err} />
      {!list.data ? <Spinner /> : first ? (
        <Empty art title="No reports yet" action={<button className="btn-primary" onClick={create}>Create the first report</button>}>
          The first report compares the client with competitors on visibility, position and sentiment, and shows the sources behind the gap. It covers the last 30 days.
        </Empty>
      ) : (
        <div className="card divide-y divide-line">
          {list.data.map(r => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <FileText size={16} className="text-muted" />
              <Link to={`${r.id}`} className="flex-1 min-w-0 font-medium hover:underline">{r.title}</Link>
              <span className="text-xs text-muted">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</span>
              {r.kind === 'first' && <Badge tone="accent">First report</Badge>}
              {r.simulated ? <SimBadge /> : <Badge tone="good">Real data</Badge>}
              <button className="btn-ghost btn-sm" onClick={() => setDel(r)} aria-label="Delete report"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <Modal open={!!del} onClose={() => setDel(null)} title="Delete this report?">
        <p className="text-sm text-ink2">"{del?.title}" will be removed. The answers it was made from are kept, and a backup is made first.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(null)}>Cancel</button>
          <button className="btn-danger" onClick={async () => { await api(`/reports/${del.id}`, { method: 'DELETE' }); setDel(null); toast('Report deleted'); list.reload(); }}>Delete</button></div>
      </Modal>
    </>
  );
}

export function ReportView({ print }) {
  const { rid, id } = useParams();
  const meta = useMeta();
  const r = useApi(`/reports/${rid}`);
  if (r.error) return <ErrorBox error={r.error} />;
  if (!r.data) return <Spinner />;
  const { data, simulated } = r.data;
  const s = data.summary;
  const own = s.brands.find(b => b.is_own);
  const sorted = [...s.brands].sort((a, b) => a.rank - b.rank);
  const leader = sorted.find(b => !b.is_own);
  const prev = data.previous?.summary;
  const prevOf = bid => prev?.brands.find(b => b.id === bid);
  const engineLabel = e => meta.engines.find(x => x.id === e)?.label || e;
  const engines = data.engines.map(e => engineLabel(e.engine)).join(', ');

  return (
    <div className={`relative ${print ? 'mx-auto max-w-4xl p-8' : ''}`}>
      {simulated ? <div aria-hidden className="pointer-events-none fixed inset-0 z-0 grid place-items-center overflow-hidden">
        <div className="-rotate-[28deg] whitespace-nowrap text-[64px] font-bold uppercase tracking-widest text-warnInk opacity-10">Simulated data — not real</div>
      </div> : null}
      <div className="relative z-10">
        <div className="no-print mb-4 flex items-center justify-between">
          {!print ? <Link to={`/p/${id}/reports`} className="btn-ghost btn-sm"><ArrowLeft size={13} />All reports</Link> : <span />}
          <button className="btn-primary" onClick={() => window.print()}><Printer size={15} />Print / save as PDF</button>
        </div>

        <header className="card mb-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted">{r.data.kind === 'first' ? 'AI visibility report' : 'AI visibility progress report'}</div>
              <h1 className="mt-1 text-2xl font-semibold">{data.project.name}</h1>
              <p className="mt-1 text-sm text-ink2">{fmtDate(data.filter.from)} – {fmtDate(data.filter.to)} · {s.totalAnswers} AI answers · engines: {engines}</p>
            </div>
            {simulated ? <SimBadge /> : <Badge tone="good">Real AI answers</Badge>}
          </div>
          {simulated ? <p className="mt-3 rounded-lg bg-warnBg px-3 py-2 text-sm text-warnInk"><strong>Simulated data.</strong> This report was made from demo answers. It must not be presented as real results.</p> : null}
          <p className="mt-4 text-[15px] leading-relaxed">
            <strong>{own.name}</strong> was mentioned in <strong>{fmtPct(own.visibility)}</strong> of AI answers, ranking <strong>#{own.rank} of {s.brands.length}</strong> tracked brands.
            {leader && <> The most visible competitor, <strong>{leader.name}</strong>, appeared in <strong>{fmtPct(leader.visibility)}</strong>.</>}
            {' '}When {own.name} was mentioned, it was on average at position <strong>{fmtPos(own.position)}</strong>, with a tone of <strong>{own.sentiment ?? '—'}/100</strong>.
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Visibility', fmtPct(own.visibility), <Delta key="v" now={own.visibility} before={prevOf(own.id)?.visibility} />],
            ['Average position', fmtPos(own.position), <Delta key="p" now={own.position} before={prevOf(own.id)?.position} invert unit="" />],
            ['Sentiment', `${own.sentiment ?? '—'}/100`, <Delta key="s" now={own.sentiment} before={prevOf(own.id)?.sentiment} digits={0} />],
            ['Share of voice', fmtPct(own.sov), <Delta key="o" now={own.sov} before={prevOf(own.id)?.sov} />]].map(([l, v, d]) => (
            <div key={l} className="card p-4"><div className="text-xs text-muted">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div><div className="mt-1">{prev ? d : <span className="text-xs text-muted">baseline</span>}</div></div>
          ))}
        </div>

        <Card className="mb-4" title="How the client compares" subtitle={prev ? `Change is against the previous report (${fmtDate(data.previous.period_end)}).` : 'This is the starting point (baseline).'} pad={false}>
          <div className="overflow-x-auto px-2 pb-2">
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Brand</th><th className="th">Visibility</th><th className="th">Position</th><th className="th">Sentiment</th><th className="th">Share of voice</th></tr></thead>
              <tbody>{sorted.map(b => (
                <tr key={b.id} className={b.is_own ? 'bg-accentSoft' : ''}>
                  <td className="td tnum text-muted">{b.rank}</td>
                  <td className="td"><span className="flex items-center gap-2"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span></span></td>
                  <td className="td"><div className="flex items-center gap-2"><span className="tnum w-12">{fmtPct(b.visibility)}</span><Bar value={b.visibility} slot={b.color} /></div>{prev && <Delta now={b.visibility} before={prevOf(b.id)?.visibility} short />}</td>
                  <td className="td tnum">{fmtPos(b.position)}</td><td className="td"><Sentiment value={b.sentiment} /></td><td className="td tnum">{fmtPct(b.sov)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <Card title="Visibility vs sentiment"><VisibilitySentimentMap brands={s.brands} height={260} /></Card>
          <Card title="By AI engine" subtitle={`${own.name}'s visibility on each engine`} pad={false}>
            <div className="px-2 pb-2"><table className="w-full"><tbody>{data.engines.map(e => {
              const x = e.brands.find(b => b.is_own);
              const best = [...e.brands].sort((a, b) => (b.visibility || 0) - (a.visibility || 0))[0];
              return <tr key={e.engine}><td className="td font-medium">{engineLabel(e.engine)}</td><td className="td"><div className="flex items-center gap-2"><span className="tnum w-12">{fmtPct(x?.visibility)}</span><Bar value={x?.visibility} /></div></td>
                <td className="td text-xs text-muted">Leader: {best.name} {fmtPct(best.visibility)}</td></tr>;
            })}</tbody></table></div>
          </Card>
        </div>

        <Card className="mb-4 print-break" title="The sources behind the gap" subtitle={`Websites the AI cited most, and how often ${own.name} appears in those same answers.`}>
          <div className="grid gap-4 md:grid-cols-2">
            <HBars rows={data.sources.byType.map(t => ({ label: t.label, value: Math.round((1000 * t.answers) / Math.max(1, s.totalAnswers)) / 10 }))} />
            <table className="w-full"><thead><tr><th className="th">Website</th><th className="th">Cited in</th><th className="th">With {own.name}</th></tr></thead>
              <tbody>{data.sources.top.filter(d => d.category !== 'own').slice(0, 10).map(d => (
                <tr key={d.domain}><td className="td">{d.domain}<div className="text-[11px] text-muted">{d.label}</div></td><td className="td tnum">{d.share}%</td>
                  <td className="td tnum"><span className={d.answers && d.with_own / d.answers < 0.3 ? 'text-bad font-medium' : ''}>{d.answers ? Math.round((100 * d.with_own) / d.answers) : 0}%</span></td></tr>))}</tbody></table>
          </div>
        </Card>

        <Card className="mb-4" title="Recommended actions" subtitle="Prioritised, each with the evidence behind it. These are suggestions; no result is guaranteed.">
          <ol className="grid gap-3">
            {data.actions.map((a, i) => (
              <li key={a.key} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2"><span className="tnum text-xs text-muted">{i + 1}.</span><Badge tone={a.priority === 'high' ? 'bad' : a.priority === 'medium' ? 'warn' : 'default'}>{a.priority}</Badge><span className="font-medium">{a.title}</span></div>
                <p className="mt-1 text-sm text-ink2">{a.why}</p>
                <div className="mt-1 text-xs text-muted">Next step: {a.steps[0]}</div>
              </li>
            ))}
          </ol>
        </Card>

        {data.previous && (
          <Card className="mb-4" title="Progress since the last report" subtitle={`Compared with "${data.previous.title}".`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm">Visibility: {fmtPct(prevOf(own.id)?.visibility)} → <strong>{fmtPct(own.visibility)}</strong> <Delta now={own.visibility} before={prevOf(own.id)?.visibility} /></div>
                <div className="text-sm mt-1">Share of voice: {fmtPct(prevOf(own.id)?.sov)} → <strong>{fmtPct(own.sov)}</strong> <Delta now={own.sov} before={prevOf(own.id)?.sov} /></div>
                <p className="mt-3 text-xs text-muted">AI answers change for many reasons. A rise after an action is a good sign, but it does not prove the action caused it.</p>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted">Actions completed since then</div>
                {data.actionsDone.length ? <ul className="grid gap-1 text-sm">{data.actionsDone.map(a => <li key={a.key} className="flex gap-2"><Check size={14} className="mt-0.5 text-good shrink-0" /><span>{a.title} <span className="text-xs text-muted">({fmtDate(a.updated_at)})</span></span></li>)}</ul>
                  : <p className="text-sm text-muted">None marked as done.</p>}
              </div>
            </div>
          </Card>
        )}

        <Card title="How this was measured">
          <ul className="list-disc pl-5 text-xs text-ink2 space-y-1">
            <li>{simulated ? 'SIMULATED: answers were generated by a demo engine, not by real AI services.' : `Each question was sent to ${engines} through their official APIs, with web search switched on.`}</li>
            <li>API answers come from the same AI models as the consumer apps, but can differ from what one person sees in the app (apps add personalisation and their own instructions).</li>
            <li>Visibility = share of answers that mention the brand. Position = order in which brands are first named (1 = first). Sentiment = tone of the sentences that mention the brand, scored by a word list (0 negative, 100 positive) — a rough guide, not a perfect reading.</li>
            <li>Not covered: Microsoft Copilot, Google AI Mode and Google AI Overviews, because they have no official API.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
