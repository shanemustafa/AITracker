import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pause, Play, Trash2, Tag, Search, Info } from 'lucide-react';
import { useApi, useFilters, api, fmtPct, fmtPos, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { Card, PageHeader, Spinner, ErrorBox, Modal, Badge, Sentiment, Empty, useToast, SimBanner } from '../ui.jsx';
import FilterBar from './FilterBar.jsx';

export default function Prompts() {
  const meta = useMeta();
  const { project } = useProject();
  const { qs } = useFilters();
  const list = useApi(`/projects/${project.id}/prompts?${qs}`);
  const toast = useToast();
  const [sel, setSel] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [err, setErr] = useState(null);

  const rows = useMemo(() => (list.data || []).filter(p =>
    (status === 'all' || (status === 'active' ? p.active : !p.active)) &&
    (!q || (p.text + ' ' + (p.topic || '') + ' ' + p.tags.join(' ')).toLowerCase().includes(q.toLowerCase()))), [list.data, q, status]);

  const bulk = async (action, extra = {}) => {
    setErr(null);
    try {
      await api(`/projects/${project.id}/prompts/bulk`, { method: 'POST', body: { ids: [...sel], action, ...extra } });
      toast(action === 'delete' ? 'Questions deleted (a backup was made first)' : 'Done');
      setSel(new Set()); setConfirmDel(false); list.reload();
    } catch (e) { setErr(e.message); }
  };
  const toggleOne = async p => { await api(`/prompts/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); list.reload(); };

  if (list.error) return <ErrorBox error={list.error} />;
  return (
    <>
      <PageHeader title="Questions" subtitle="The questions we ask every AI engine. Add many at once, tag them, set the country and language, pause or delete them."
        right={<>
          <button className="btn-ghost" onClick={() => setLibOpen(true)}>Add from library</button>
          <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} />Add questions</button>
        </>} />
      <FilterBar />
      <div className="mb-3"><SimBanner show={project.data_mode !== 'live'} /></div>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink2">
        <Info size={14} className="mt-0.5 shrink-0 text-muted" />
        <span><strong>Why there is no "demand score":</strong> no AI company publishes how often people ask a question, and search-volume tools measure Google keywords, not AI questions. Rather than show an invented 1–5 number, we leave it out.</span>
      </div>
      <Card pad={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative flex-1 min-w-[180px]"><Search size={14} className="absolute left-2.5 top-2.5 text-muted" /><input className="input pl-8 py-1.5" placeholder="Search questions, topics, tags" value={q} onChange={e => setQ(e.target.value)} /></div>
          <select className="input w-auto py-1.5 text-xs" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
            <option value="all">All</option><option value="active">Active</option><option value="paused">Paused</option>
          </select>
          {sel.size > 0 && <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">{sel.size} selected</span>
            <button className="btn-ghost btn-sm" onClick={() => bulk('pause')}><Pause size={13} />Pause</button>
            <button className="btn-ghost btn-sm" onClick={() => bulk('resume')}><Play size={13} />Resume</button>
            <button className="btn-ghost btn-sm" onClick={() => { const t = prompt('Tag to add to the selected questions:'); if (t) bulk('tag', { tag: t.trim() }); }}><Tag size={13} />Tag</button>
            <button className="btn-ghost btn-sm text-bad" onClick={() => setConfirmDel(true)}><Trash2 size={13} />Delete</button>
          </div>}
        </div>
        <ErrorBox error={err} />
        {!list.data ? <Spinner /> : !rows.length ? <div className="p-5"><Empty title="No questions match">Add questions, or change the search.</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th w-8"><input type="checkbox" aria-label="Select all" checked={sel.size === rows.length} onChange={() => setSel(sel.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))} /></th>
                <th className="th">Question</th><th className="th">Market</th><th className="th">Your visibility</th><th className="th">Position</th><th className="th">Sentiment</th><th className="th">Most visible</th><th className="th">Status</th>
              </tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className={p.active ? '' : 'opacity-60'}>
                    <td className="td"><input type="checkbox" aria-label="Select" checked={sel.has(p.id)} onChange={() => { const n = new Set(sel); n.has(p.id) ? n.delete(p.id) : n.add(p.id); setSel(n); }} /></td>
                    <td className="td max-w-md">
                      <Link to={`../chats?prompt=${p.id}`} className="hover:underline">{p.text}</Link>
                      <div className="mt-1 flex flex-wrap gap-1">{p.topic && <Badge>{p.topic}</Badge>}{p.tags.filter(t => t !== p.topic).map(t => <Badge key={t} tone="accent">{t}</Badge>)}</div>
                    </td>
                    <td className="td whitespace-nowrap text-xs">{COUNTRY_FLAGS[p.country]} {p.country}<div className="text-muted">{meta.languages[p.language] || p.language}</div></td>
                    <td className="td tnum">{fmtPct(p.visibility)}<div className="text-[11px] text-muted">{p.answers} answers</div></td>
                    <td className="td tnum">{fmtPos(p.position)}</td>
                    <td className="td"><Sentiment value={p.sentiment} /></td>
                    <td className="td text-xs">{p.topBrand ? <>{p.topBrand.name}<div className="text-muted tnum">{p.topBrand.visibility}%</div></> : '—'}</td>
                    <td className="td"><button className="btn-ghost btn-sm" onClick={() => toggleOne(p)}>{p.active ? 'Active' : 'Paused'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AddModal open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); list.reload(); }} />
      <LibraryModal open={libOpen} onClose={() => setLibOpen(false)} existing={list.data || []} onDone={() => { setLibOpen(false); list.reload(); }} />
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete questions?">
        <p className="text-sm text-ink2">This deletes {sel.size} question(s) <strong>and all their past answers</strong>. A backup of everything is made first. If you only want to stop asking them, use <em>Pause</em> instead.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setConfirmDel(false)}>Cancel</button><button className="btn-danger" onClick={() => bulk('delete', { confirm: true })}>Delete</button></div>
      </Modal>
    </>
  );
}

function AddModal({ open, onClose, onDone }) {
  const meta = useMeta();
  const { project } = useProject();
  const toast = useToast();
  const [v, setV] = useState({ text: '', topic: '', tags: '', country: project.countries[0] || 'FI', language: 'en' });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try {
      const r = await api(`/projects/${project.id}/prompts`, { method: 'POST', body: { ...v, tags: v.tags.split(',').map(t => t.trim()).filter(Boolean) } });
      toast(`${r.added} added${r.skipped ? `, ${r.skipped} duplicates skipped` : ''}`);
      setV({ ...v, text: '' }); onDone();
    } catch (e) { setErr(e.message); }
  };
  const n = v.text.split('\n').filter(x => x.trim()).length;
  return (
    <Modal open={open} onClose={onClose} title="Add questions" wide>
      <label className="label">Questions — one per line</label>
      <textarea className="input" rows={8} value={v.text} onChange={e => setV({ ...v, text: e.target.value })} placeholder={'Which online casino in Finland pays out fastest?\nWhat is the safest betting site for Finnish players?'} />
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div><label className="label">Topic</label><input className="input" value={v.topic} onChange={e => setV({ ...v, topic: e.target.value })} placeholder="e.g. Payments" /></div>
        <div><label className="label">Tags (comma separated)</label><input className="input" value={v.tags} onChange={e => setV({ ...v, tags: e.target.value })} placeholder="e.g. B2C, launch" /></div>
        <div><label className="label">Country</label><select className="input" value={v.country} onChange={e => setV({ ...v, country: e.target.value })}>{Object.entries(meta.countries).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
        <div><label className="label">Language</label><select className="input" value={v.language} onChange={e => setV({ ...v, language: e.target.value })}>{Object.entries(meta.languages).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
      </div>
      <p className="mt-3 text-xs text-muted">Write questions the way a real person would type them into ChatGPT. Avoid putting your own brand name in, unless you want to track head-to-head questions.</p>
      <ErrorBox error={err} />
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!n} onClick={save}>Add {n || ''} question{n === 1 ? '' : 's'}</button></div>
    </Modal>
  );
}

function LibraryModal({ open, onClose, existing, onDone }) {
  const meta = useMeta();
  const { project } = useProject();
  const toast = useToast();
  const have = new Set(existing.map(p => p.text.toLowerCase()));
  const items = meta.promptLibrary.filter(p => !have.has(p.text.toLowerCase()));
  const [sel, setSel] = useState(new Set());
  const add = async () => {
    const chosen = items.filter((_, i) => sel.has(i)).map(p => ({ text: p.text, country: p.country, language: p.language, topic: p.topic, tags: [p.topic] }));
    const r = await api(`/projects/${project.id}/prompts`, { method: 'POST', body: { items: chosen } });
    toast(`${r.added} questions added`); setSel(new Set()); onDone();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add from the question library" wide>
      <div className="max-h-[55vh] overflow-y-auto rounded-lg border border-line">
        {items.map((p, i) => (
          <label key={p.text} className="flex cursor-pointer items-start gap-3 border-b border-line px-3 py-2 last:border-0 hover:bg-raised">
            <input type="checkbox" className="mt-1" checked={sel.has(i)} onChange={() => { const n = new Set(sel); n.has(i) ? n.delete(i) : n.add(i); setSel(n); }} />
            <span className="flex-1 text-sm">{p.text}</span>
            <span className="shrink-0 text-xs text-muted">{meta.categories[p.c]} · {COUNTRY_FLAGS[p.country]} {p.topic}</span>
          </label>
        ))}
        {!items.length && <p className="p-4 text-sm text-muted">All library questions are already in this project.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!sel.size} onClick={add}>Add {sel.size || ''}</button></div>
    </Modal>
  );
}
