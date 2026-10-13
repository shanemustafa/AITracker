import { useState } from 'react';
import { Plus, Trash2, Pencil, Sparkles, EyeOff } from 'lucide-react';
import { useApi, useFilters, api, fmtPct, fmtPos } from '../lib.js';
import { useProject } from '../ctx.js';
import { Card, PageHeader, Spinner, ErrorBox, Modal, BrandDot, Badge, Sentiment, useToast, Bar, Empty } from '../ui.jsx';
import FilterBar from './FilterBar.jsx';

export default function Competitors() {
  const { project, reload } = useProject();
  const { qs } = useFilters();
  const sum = useApi(`/projects/${project.id}/summary?${qs}`);
  const sugg = useApi(`/projects/${project.id}/suggestions?${qs}`);
  const toast = useToast();
  const [edit, setEdit] = useState(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(null);

  const track = async name => {
    setBusy(name);
    await api(`/projects/${project.id}/brands`, { method: 'POST', body: { name } });
    toast(`Now tracking ${name}. Past answers were recounted.`);
    setBusy(null); reload();
  };
  const ignore = async name => { await api(`/projects/${project.id}/suggestions/dismiss`, { method: 'POST', body: { name } }); sugg.reload(); };
  const brandsById = Object.fromEntries(project.brands.map(b => [b.id, b]));

  return (
    <>
      <PageHeader title="Competitors" subtitle="The brands we look for in every answer. Aliases catch other spellings or sub-brands (for example Paddy Power for Flutter)."
        right={<button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} />Add competitor</button>} />
      <FilterBar />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Tracked brands" pad={false}>
          {!sum.data ? <Spinner /> : (
            <div className="overflow-x-auto px-2 pb-2">
              <table className="w-full">
                <thead><tr><th className="th">Brand</th><th className="th">Also matches</th><th className="th">Visibility</th><th className="th">Position</th><th className="th">Sentiment</th><th className="th" /></tr></thead>
                <tbody>
                  {sum.data.brands.map(b => {
                    const full = brandsById[b.id];
                    return (
                      <tr key={b.id}>
                        <td className="td"><div className="flex items-center gap-2"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span>{b.is_own && <Badge tone="accent">Client</Badge>}</div>
                          <div className="ml-4 text-xs text-muted">{full?.domain || 'no website set'}</div></td>
                        <td className="td text-xs text-ink2 max-w-[200px]">{full?.aliases?.join(', ') || <span className="text-muted">—</span>}</td>
                        <td className="td"><div className="flex items-center gap-2"><span className="tnum w-11">{fmtPct(b.visibility)}</span><Bar value={b.visibility} slot={b.color} /></div></td>
                        <td className="td tnum">{fmtPos(b.position)}</td>
                        <td className="td"><Sentiment value={b.sentiment} /></td>
                        <td className="td whitespace-nowrap text-right">
                          <button className="btn-ghost btn-sm" onClick={() => setEdit(full)} aria-label={`Edit ${b.name}`}><Pencil size={13} /></button>
                          {!b.is_own && <button className="btn-ghost btn-sm ml-1" onClick={() => setDel(full)} aria-label={`Remove ${b.name}`}><Trash2 size={13} /></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Suggested competitors" subtitle="Brands the AI often names in these answers that you are not tracking.">
          {!sugg.data ? <Spinner /> : !sugg.data.length ? <Empty title="No suggestions right now">We'll suggest brands here as answers come in.</Empty> : (
            <ul className="flex flex-col gap-2">
              {sugg.data.slice(0, 12).map(s => (
                <li key={s.name} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <Sparkles size={13} className="text-accent shrink-0" />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{s.name}</div><div className="text-xs text-muted">in {s.visibility}% of answers ({s.answers})</div></div>
                  <button className="btn-primary btn-sm" disabled={busy === s.name} onClick={() => track(s.name)}><Plus size={12} />Track</button>
                  <button className="btn-ghost btn-sm" onClick={() => ignore(s.name)} title="Not a competitor — hide" aria-label={`Hide ${s.name}`}><EyeOff size={12} /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <BrandModal brand={edit} open={!!edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      <BrandModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      <Modal open={!!del} onClose={() => setDel(null)} title={`Stop tracking ${del?.name}?`}>
        <p className="text-sm text-ink2">The answers stay saved. {del?.name} just won't be counted any more. You can add it again later.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(null)}>Cancel</button>
          <button className="btn-danger" onClick={async () => { await api(`/brands/${del.id}`, { method: 'DELETE' }); setDel(null); toast('Removed'); reload(); }}>Stop tracking</button></div>
      </Modal>
    </>
  );
}

function BrandModal({ brand, open, onClose, onSaved }) {
  const { project } = useProject();
  const [v, setV] = useState(null);
  const [err, setErr] = useState(null);
  const cur = v || { name: brand?.name || '', domain: brand?.domain || '', aliases: brand?.aliases?.join(', ') || '' };
  const close = () => { setV(null); setErr(null); onClose(); };
  const save = async () => {
    setErr(null);
    const body = { ...cur, aliases: cur.aliases.split(',').map(a => a.trim()).filter(Boolean) };
    try {
      if (brand) await api(`/brands/${brand.id}`, { method: 'PATCH', body });
      else await api(`/projects/${project.id}/brands`, { method: 'POST', body });
      setV(null); onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal open={open} onClose={close} title={brand ? `Edit ${brand.name}` : 'Add a competitor'}>
      <div className="grid gap-3">
        <div><label className="label">Name</label><input className="input" value={cur.name} onChange={e => setV({ ...cur, name: e.target.value })} /></div>
        <div><label className="label">Website</label><input className="input" value={cur.domain} onChange={e => setV({ ...cur, domain: e.target.value })} placeholder="example.com" /></div>
        <div><label className="label">Other names / sub-brands (comma separated)</label><input className="input" value={cur.aliases} onChange={e => setV({ ...cur, aliases: e.target.value })} placeholder="e.g. Paddy Power, Betfair" /></div>
        <p className="text-xs text-muted">Saving recounts all past answers with the new names, so history stays consistent.</p>
        <ErrorBox error={err} />
      </div>
      <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={close}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></div>
    </Modal>
  );
}
