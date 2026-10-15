import { useApi, useFilters, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { Segmented } from '../ui.jsx';

export default function FilterBar({ showDays = true }) {
  const meta = useMeta();
  const { project } = useProject();
  const { f, set } = useFilters();
  const opts = useApi(`/projects/${project.id}/filters`);
  const engines = opts.data?.engines || project.engines;
  const selected = f.engines ? f.engines.split(',') : [];
  const toggle = e => {
    const next = selected.includes(e) ? selected.filter(x => x !== e) : [...selected, e];
    set({ engines: next.length === engines.length ? '' : next.join(',') });
  };
  const label = id => meta.engines.find(e => e.id === id)?.label || id;
  return (
    <div className="glass no-print sticky top-3 z-20 mb-6 flex flex-wrap items-center gap-2 rounded-2xl p-2 shadow-card" style={{ border: '1px solid var(--line)' }}>
      {showDays && <Segmented value={f.days} onChange={v => set({ days: v })} options={[
        { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' },
      ]} />}
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Engines">
        <button className={`chip ${!selected.length ? 'chip-on' : ''}`} onClick={() => set({ engines: '' })}>All engines</button>
        {engines.map(e => <button key={e} className={`chip ${selected.includes(e) ? 'chip-on' : ''}`} onClick={() => toggle(e)}>{label(e)}</button>)}
      </div>
      <select className="input w-auto py-1.5 text-xs font-medium" value={f.country} onChange={e => set({ country: e.target.value })} aria-label="Country">
        <option value="">All countries</option>
        {(opts.data?.countries || []).map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {meta.countries[c] || c}</option>)}
      </select>
      <select className="input w-auto py-1.5 text-xs font-medium" value={f.tag} onChange={e => set({ tag: e.target.value })} aria-label="Tag">
        <option value="">All tags</option>
        {(opts.data?.tags || []).map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      {(f.engines || f.country || f.tag) && <button className="text-xs text-muted underline hover:text-ink" onClick={() => set({ engines: '', country: '', tag: '' })}>Clear filters</button>}
    </div>
  );
}
