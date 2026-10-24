// AI readiness: is the client's website easy for AI to read, and do AI answers get the client's facts right?
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, XCircle, Info, Globe, Plus, Trash2, RefreshCw, Quote } from 'lucide-react';
import { useApi, api, fmtDate } from '../lib.js';
import { useProject } from '../ctx.js';
import { PageHeader, Card, Spinner, ErrorBox, Badge, useToast } from '../ui.jsx';

const ICON = {
  pass: [CheckCircle2, '#1d7d32', 'OK'], warn: [AlertTriangle, '#b58100', 'Improve'],
  fail: [XCircle, 'var(--bad)', 'Fix'], info: [Info, 'var(--muted)', 'Note'],
};

export default function Readiness() {
  const { project } = useProject();
  return (
    <>
      <PageHeader title="AI readiness" subtitle="Two checks that help AI describe the client correctly: is their website easy for AI to read, and do AI answers get their facts right?" />
      <div className="grid gap-5">
        <WebsiteCheck project={project} />
        <FactCheck project={project} />
      </div>
    </>
  );
}

function WebsiteCheck({ project }) {
  const s = useApi(`/projects/${project.id}/site-check`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try { await api(`/projects/${project.id}/site-check`, { method: 'POST' }); s.reload(); } catch (e) { setErr(e); }
    setBusy(false);
  };
  if (s.error) return <ErrorBox error={s.error} />;
  if (!s.data) return <Spinner />;
  const latest = s.data.latest;
  const res = latest?.results;
  return (
    <Card title="Website check" subtitle="Reads 4 public files of the client's own website (home page, robots.txt, sitemap.xml, llms.txt). Nothing on their site is changed."
      right={s.data.domain && <button className={`btn-primary ${busy ? 'shimmer' : ''}`} onClick={run} disabled={busy}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{busy ? 'Checking…' : latest ? 'Check again' : 'Run website check'}</button>}>
      {!s.data.domain && <p className="text-sm text-ink2">Add the client's website to their brand first: <Link className="text-accent underline" to={`/p/${project.id}/competitors`}>Competitors page</Link> → your brand → website.</p>}
      {s.data.domain && <p className="mb-3 flex items-center gap-2 text-sm text-ink2"><Globe size={14} />{s.data.domain} <span className="text-xs text-muted">Only check websites the client owns or has asked you to check.</span></p>}
      <ErrorBox error={err} />
      {res && <>
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl bg-raised p-4">
          <div className="tnum text-[40px] font-semibold tracking-title" style={{ color: res.score >= 80 ? '#1d7d32' : res.score >= 50 ? '#b58100' : 'var(--bad)' }}>{res.score}<span className="text-base text-muted">/100</span></div>
          <div className="text-sm text-ink2">AI readiness score<br /><span className="text-xs text-muted">Checked {fmtDate(latest.created_at)} · {res.url}</span></div>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {res.checks.map(c => {
            const [I, color, label] = ICON[c.status] || ICON.info;
            return (
              <li key={c.id} className="flex gap-3 py-3">
                <I size={18} className="mt-0.5 shrink-0" style={{ color }} aria-label={label} />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.label} <span className="ml-1 text-xs font-normal text-muted">{label}</span></div>
                  <div className="text-sm text-ink2">{c.detail}</div>
                  {c.fix && c.status !== 'pass' && <div className="mt-1 text-xs text-ink2"><span className="font-medium text-ink">What to do: </span>{c.fix}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      </>}
    </Card>
  );
}

function FactCheck({ project }) {
  const r = useApi(`/projects/${project.id}/facts`);
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const live = project.data_mode === 'live';
  const add = async () => {
    setErr(null);
    try { await api(`/projects/${project.id}/facts`, { method: 'POST', body: { text } }); setText(''); r.reload(); } catch (e) { setErr(e); }
  };
  const remove = async f => { if (!confirm(`Remove this fact?\n\n"${f.text}"`)) return; await api(`/facts/${f.id}`, { method: 'DELETE' }); r.reload(); };
  const check = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api(`/projects/${project.id}/facts/check`, { method: 'POST' });
      toast(out.message || `Checked ${out.checked} answer(s): ${out.contradictions} wrong claim(s) found`);
      r.reload();
    } catch (e) { setErr(e); }
    setBusy(false);
  };
  if (r.error) return <ErrorBox error={r.error} />;
  if (!r.data) return <Spinner />;
  const d = r.data;
  return (
    <Card title="Fact check" subtitle="List facts the client has confirmed. Claude reads the real AI answers that mention the client and flags any that contradict a fact. Each answer checked costs about 1–3 cents and counts toward your monthly cap."
      right={<button className={`btn-primary ${busy ? 'shimmer' : ''}`} onClick={check} disabled={busy || !d.facts.length || !live || !d.connected}><RefreshCw size={14} className={busy ? 'animate-spin' : ''} />{busy ? 'Checking…' : 'Check answers now'}</button>}>
      {!live && <p className="mb-3 rounded-lg bg-warnBg px-3 py-2 text-xs text-warnInk">This project uses simulated (demo) answers. Fact checks only run on real AI answers.</p>}
      {live && !d.connected && <p className="mb-3 rounded-lg bg-warnBg px-3 py-2 text-xs text-warnInk">Connect Claude in <Link className="underline" to="/settings">Settings → AI engines</Link> to run fact checks.</p>}
      <div className="flex gap-2">
        <input className="input" value={text} onChange={e => setText(e.target.value)} maxLength={300} placeholder={'e.g. "Kays is not a bank; accounts are provided by licensed partners."'} onKeyDown={e => e.key === 'Enter' && text.trim() && add()} />
        <button className="btn-ghost" onClick={add} disabled={!text.trim()}><Plus size={14} />Add fact</button>
      </div>
      <p className="mt-1 text-xs text-muted">Only add facts the client has confirmed in writing. Answers are re-checked automatically after every real check run.</p>
      <ErrorBox error={err} />
      {!d.facts.length ? <p className="mt-4 text-sm text-muted">No facts yet.</p> : (
        <ul className="mt-4 grid gap-3">
          {d.facts.map(f => (
            <li key={f.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium">{f.text}</div>
                <button className="text-muted hover:text-ink" onClick={() => remove(f)} aria-label="Remove fact"><Trash2 size={14} /></button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={f.contradicts ? 'bad' : 'default'}>{f.contradicts} wrong</Badge>
                <Badge tone="good">{f.supports} correct</Badge>
                <Badge>{f.notMentioned} not mentioned</Badge>
              </div>
              {f.wrong.map(w => (
                <blockquote key={w.answer_id} className="mt-2 flex gap-2 rounded-lg bg-raised p-2 text-xs text-ink2">
                  <Quote size={12} className="shrink-0 text-muted" />
                  <span><span className="text-ink">"{w.quote}"</span> — {w.explanation} <span className="text-muted">({w.engine}, {w.day}) </span>
                    <Link className="text-accent underline" to={`/p/${project.id}/chats?prompt=${w.prompt_id}`}>Read the answer</Link></span>
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      )}
      {d.lastChecked && <p className="mt-3 text-xs text-muted">Last checked {fmtDate(d.lastChecked)} · model {d.model}</p>}
    </Card>
  );
}
