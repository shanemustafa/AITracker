import { useState } from 'react';
import { api, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { Card, PageHeader, useToast, ErrorBox } from '../ui.jsx';

export default function Discovery() {
  const meta = useMeta();
  const { project, reload } = useProject();
  const toast = useToast();
  const [d, setD] = useState({ competitors: '', markets: [], questions: '', goals: '', contact: '', notes: '', ...project.discovery });
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null);
    try { await api(`/projects/${project.id}`, { method: 'PATCH', body: { discovery: d } }); toast('Discovery notes saved'); reload(); }
    catch (e) { setErr(e.message); }
  };
  const addQuestions = async () => {
    const r = await api(`/projects/${project.id}/prompts`, { method: 'POST', body: { text: d.questions, topic: 'Client question', tags: ['Discovery'], country: d.markets[0] || 'GLOBAL' } });
    toast(`${r.added} questions added${r.skipped ? `, ${r.skipped} were already there` : ''}`);
  };
  const T = ({ k, label, hint, rows = 3 }) => (
    <div><label className="label" htmlFor={k}>{label}</label>{hint && <p className="mb-1 text-xs text-muted">{hint}</p>}
      <textarea id={k} className="input" rows={rows} value={d[k] || ''} onChange={e => setD({ ...d, [k]: e.target.value })} /></div>
  );
  return (
    <>
      <PageHeader title="Discovery notes" subtitle="Step 1 of the client journey. Record what the client told you, so the project is set up around their real situation."
        right={<button className="btn-primary" onClick={save}>Save</button>} />
      <Card>
        <div className="grid gap-5">
          {T({ k: 'competitors', label: 'Real competitors (in the client\'s words)', hint: 'Include local players. You can add them as tracked competitors on the Competitors page.' })}
          <div>
            <span className="label">Priority markets</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(meta.countries).map(([k, v]) => (
                <button key={k} className={`chip ${d.markets.includes(k) ? 'chip-on' : ''}`}
                  onClick={() => setD({ ...d, markets: d.markets.includes(k) ? d.markets.filter(x => x !== k) : [...d.markets, k] })}>{COUNTRY_FLAGS[k]} {v}</button>
              ))}
            </div>
          </div>
          <div>
            {T({ k: 'questions', label: 'Example customer questions', hint: 'One per line.', rows: 5 })}
            <button className="btn-ghost btn-sm mt-2" onClick={addQuestions} disabled={!d.questions?.trim()}>Add these as tracked questions</button>
          </div>
          {T({ k: 'goals', label: 'What the client wants to achieve' })}
          {T({ k: 'contact', label: 'Client contact', rows: 1 })}
          {T({ k: 'notes', label: 'Other notes', rows: 4 })}
          <ErrorBox error={err} />
        </div>
      </Card>
    </>
  );
}
