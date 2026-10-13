import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { api, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject, useUser } from '../ctx.js';
import { Card, PageHeader, Modal, ErrorBox, useToast, Badge, SimBanner } from '../ui.jsx';

export default function ProjectSettings() {
  const meta = useMeta();
  const user = useUser();
  const { project, reload } = useProject();
  const toast = useToast();
  const nav = useNavigate();
  const [v, setV] = useState({ name: project.name, category: project.category, engines: project.engines, countries: project.countries, frequency: project.frequency });
  const [err, setErr] = useState(null);
  const [del, setDel] = useState(false);
  const [delName, setDelName] = useState('');
  const [live, setLive] = useState(false);

  const save = async () => {
    setErr(null);
    try { await api(`/projects/${project.id}`, { method: 'PATCH', body: v }); toast('Saved'); reload(); } catch (e) { setErr(e.message); }
  };
  const toggle = (k, x) => setV({ ...v, [k]: v[k].includes(x) ? v[k].filter(y => y !== x) : [...v[k], x] });

  return (
    <>
      <PageHeader title="Project settings" right={<button className="btn-primary" onClick={save}>Save changes</button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Basics">
          <div className="grid gap-3">
            <div><label className="label">Project name</label><input className="input" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></div>
            <div><label className="label">Type of company</label><select className="input" value={v.category} onChange={e => setV({ ...v, category: e.target.value })}>{Object.entries(meta.categories).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></div>
            <div><span className="label">Markets</span><div className="flex flex-wrap gap-2">{Object.entries(meta.countries).map(([k, x]) => <button key={k} className={`chip ${v.countries.includes(k) ? 'chip-on' : ''}`} onClick={() => toggle('countries', k)}>{COUNTRY_FLAGS[k]} {x}</button>)}</div></div>
            <div><label className="label">How often to check</label>
              <select className="input" value={v.frequency} onChange={e => setV({ ...v, frequency: e.target.value })}>
                <option value="daily">Every day</option><option value="every3">Every 3 days</option><option value="weekly">Every week</option><option value="manual">Only when I press "Run now"</option>
              </select></div>
          </div>
        </Card>
        <Card title="AI engines for this project">
          <div className="grid gap-2">
            {meta.engines.map(e => (
              <label key={e.id} className={`flex items-start gap-3 rounded-lg border border-line p-2.5 ${e.supported ? 'cursor-pointer' : 'opacity-60'}`}>
                {e.supported ? <input type="checkbox" className="mt-1" checked={v.engines.includes(e.id)} onChange={() => toggle('engines', e.id)} /> : <Ban size={14} className="mt-0.5" />}
                <div className="text-sm"><div className="font-medium">{e.label}{!e.supported && <Badge className="ml-2">No official API</Badge>}</div><div className="text-xs text-muted">{e.supported ? e.via : e.reason}</div></div>
              </label>
            ))}
          </div>
        </Card>
        <Card title="Data" className="lg:col-span-2">
          {project.data_mode === 'live' ? <p className="text-sm text-ink2">This project uses <strong>real</strong> AI answers from the engines you connected.</p> : <>
            <SimBanner show>This project uses simulated demo answers.</SimBanner>
            <p className="mt-3 text-sm text-ink2">When your AI accounts are connected (Settings → AI engines) and a spending cap is set, you can switch this project to real data. The simulated answers will be removed so they can never be mixed up with real ones. A full backup is made first.</p>
            <button className="btn-primary mt-3" disabled={user.role !== 'admin'} onClick={() => setLive(true)}>Switch this project to real data…</button>
          </>}
        </Card>
        <Card title="Delete project" className="lg:col-span-2">
          <p className="text-sm text-ink2">Deletes the project with all its questions, answers and reports. A backup is made first, but please be sure.</p>
          <button className="btn-danger mt-3" onClick={() => setDel(true)}>Delete project…</button>
        </Card>
      </div>
      <ErrorBox error={err} />
      <Modal open={live} onClose={() => setLive(false)} title="Switch to real data?">
        <p className="text-sm text-ink2">This removes all simulated answers, simulated reports and action statuses from <strong>{project.name}</strong>, and from now on "Run now" and the schedule will ask the real AI engines (this costs money, within your cap). A backup of everything is made first.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setLive(false)}>Cancel</button>
          <button className="btn-primary" onClick={async () => { try { const r = await api(`/projects/${project.id}/go-live`, { method: 'POST', body: { confirm: true } }); toast(`Switched. Backup saved: ${r.backup}`); setLive(false); reload(); } catch (e) { setErr(e.message); setLive(false); } }}>Yes, switch to real data</button></div>
      </Modal>
      <Modal open={del} onClose={() => setDel(false)} title="Delete project?">
        <p className="text-sm text-ink2">Type the project name to confirm: <strong>{project.name}</strong></p>
        <input className="input mt-3" value={delName} onChange={e => setDelName(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDel(false)}>Cancel</button>
          <button className="btn-danger" disabled={delName !== project.name} onClick={async () => { await api(`/projects/${project.id}?confirm=${encodeURIComponent(delName)}`, { method: 'DELETE' }); toast('Project deleted (backup kept)'); nav('/'); }}>Delete for good</button></div>
      </Modal>
    </>
  );
}
