import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useApi, useFilters, useColors, fmtDate, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { PageHeader, Spinner, ErrorBox, Badge, SimBadge, BrandDot, Empty, Sentiment } from '../ui.jsx';
import FilterBar from './FilterBar.jsx';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Turns answer text into React elements: **bold**, list lines, links, and coloured brand highlights.
function useHighlighter(brands) {
  const c = useColors();
  return useMemo(() => {
    const names = brands.flatMap(b => [b.name, ...(b.aliases || [])].map(n => ({ n, b }))).sort((a, b) => b.n.length - a.n.length);
    const re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(x => esc(x.n)).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
    const lookup = t => names.find(x => x.n.toLowerCase() === t.toLowerCase())?.b;
    const inline = (text, key) => {
      const parts = [];
      const md = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let last = 0, m, i = 0;
      const pushText = (t, bold) => {
        if (!re) { parts.push(bold ? <strong key={key + '-' + i++}>{t}</strong> : t); return; }
        let l = 0, mm;
        re.lastIndex = 0;
        const seg = [];
        while ((mm = re.exec(t))) {
          if (mm.index > l) seg.push(t.slice(l, mm.index));
          const b = lookup(mm[0]);
          seg.push(<mark key={key + '-m' + i++} className="brand" style={{ borderColor: c.brand(b?.color), background: c.brand(b?.color) + '22' }}>{mm[0]}</mark>);
          l = mm.index + mm[0].length;
        }
        if (l < t.length) seg.push(t.slice(l));
        parts.push(bold ? <strong key={key + '-b' + i++}>{seg}</strong> : <Fragment key={key + '-f' + i++}>{seg}</Fragment>);
      };
      while ((m = md.exec(text))) {
        if (m.index > last) pushText(text.slice(last, m.index));
        if (m[1]) pushText(m[1], true);
        else parts.push(<a key={key + '-a' + i++} href={m[3]} target="_blank" rel="noreferrer" className="text-accent underline">{m[2]}</a>);
        last = m.index + m[0].length;
      }
      if (last < text.length) pushText(text.slice(last));
      return parts;
    };
    return text => (text || '').split('\n').map((line, i) => {
      const t = line.replace(/^#{1,6}\s*/, '');
      if (!t.trim()) return <div key={i} className="h-2" />;
      const isList = /^\s*(\d+[.)]|[-*•])\s+/.test(t);
      return <p key={i} className={`${isList ? 'pl-4' : ''} ${/^#/.test(line) ? 'font-semibold' : ''} leading-relaxed`}>{inline(t, i)}</p>;
    });
  }, [brands, c]);
}

export default function Chats() {
  const meta = useMeta();
  const { project } = useProject();
  const { qs } = useFilters();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [page, setPage] = useState(0);
  const prompt = params.get('prompt') || '';
  const extra = new URLSearchParams({ limit: '15', offset: String(page * 15), ...(brand ? { brand } : {}), ...(query ? { q: query } : {}), ...(prompt ? { prompt } : {}) });
  const chats = useApi(`/projects/${project.id}/chats?${qs}&${extra}`);
  const hl = useHighlighter(project.brands);
  const pages = chats.data ? Math.ceil(chats.data.total / 15) : 0;

  return (
    <>
      <PageHeader title="Chats" subtitle="The actual answers the AI engines gave. Tracked brands are highlighted in their colour." />
      <FilterBar />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative flex-1 min-w-[200px]" onSubmit={e => { e.preventDefault(); setQuery(q); setPage(0); }}>
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted" /><input className="input pl-8 py-1.5" placeholder="Search answers (press Enter)" value={q} onChange={e => setQ(e.target.value)} />
        </form>
        <select className="input w-auto py-1.5 text-xs" value={brand} onChange={e => { setBrand(e.target.value); setPage(0); }} aria-label="Only answers mentioning">
          <option value="">Any brand</option>{project.brands.map(b => <option key={b.id} value={b.id}>Mentions {b.name}</option>)}
        </select>
        {prompt && <button className="chip chip-on" onClick={() => { params.delete('prompt'); setParams(params); }}>One question only ✕</button>}
      </div>
      {chats.error && <ErrorBox error={chats.error} />}
      {!chats.data ? <Spinner /> : !chats.data.rows.length ? <Empty title="No answers match">Try a longer time range or fewer filters.</Empty> : <>
        <p className="mb-3 text-xs text-muted">{chats.data.total} answers</p>
        <div className="flex flex-col gap-3">{chats.data.rows.map(r => <ChatCard key={r.id} r={r} hl={hl} meta={meta} />)}</div>
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="text-muted">Page {page + 1} of {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </>}
    </>
  );
}

function ChatCard({ r, hl, meta }) {
  const [open, setOpen] = useState(false);
  const engine = meta.engines.find(e => e.id === r.engine);
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="accent">{engine?.label || r.engine}</Badge>
        <span>{fmtDate(r.day)}</span><span>·</span><span>{COUNTRY_FLAGS[r.country]} {meta.countries[r.country]}</span>
        {r.model && r.model !== 'simulated' && <span>· {r.model}</span>}
        {r.simulated ? <SimBadge /> : null}
      </div>
      <h3 className="mt-2 font-semibold">“{r.prompt}”</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {r.mentions.map(m => (
          <span key={m.brand_id} className="chip"><BrandDot slot={m.color || 9} />{m.name} <span className="tnum text-muted">#{m.position}</span> · <Sentiment value={m.sentiment} /></span>
        ))}
        {!r.mentions.length && <span className="text-xs text-muted">No tracked brand mentioned.</span>}
        {!!r.others.length && <span className="text-xs text-muted self-center">Also named: {r.others.join(', ')}</span>}
      </div>
      <div className={`relative mt-3 text-sm text-ink2 ${open ? '' : 'max-h-44 overflow-hidden'}`}>
        {hl(r.text)}
        {!open && <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--surface)]" />}
      </div>
      <button className="mt-2 inline-flex items-center gap-1 text-xs text-accent" onClick={() => setOpen(!open)}>{open ? <><ChevronUp size={13} />Show less</> : <><ChevronDown size={13} />Read full answer & sources</>}</button>
      {open && !!r.citations.length && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1 text-xs font-medium text-muted">Sources cited ({r.citations.length})</div>
          <ul className="grid gap-1 text-xs">
            {r.citations.map(c => <li key={c.url} className="flex items-center gap-2"><Badge>{meta.sourceTypes[c.category]}</Badge><a className="truncate hover:underline" href={c.url} target="_blank" rel="noreferrer">{c.title || c.url}</a><ExternalLink size={11} className="text-muted shrink-0" /></li>)}
          </ul>
        </div>
      )}
    </article>
  );
}
