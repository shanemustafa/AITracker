import { useEffect, useRef, useState } from 'react';
import { Phone, Users, Mail, CheckSquare, FileText, Plus, Trash2, Check } from 'lucide-react';
import { api } from '../lib.js';
import { ErrorBox } from '../ui.jsx';

export const ACTIVITY_TYPES = {
  call: { label: 'Call', icon: Phone }, meeting: { label: 'Meeting', icon: Users }, email: { label: 'Email', icon: Mail },
  task: { label: 'Task', icon: CheckSquare }, report: { label: 'Report', icon: FileText },
};

// "Tomorrow at 15:00", "Today at 09:30", "Overdue by 2 days", "Mon 20 Oct at 09:00"
export function whenText(iso) {
  if (!iso) return 'No date';
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(d.toDateString()) - new Date(now.toDateString())) / 86400000);
  if (d < now && days < 0) return `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
  if (d < now) return `Overdue · today ${time}`;
  if (days === 0) return `Today at ${time}`;
  if (days === 1) return `Tomorrow at ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
}

const localInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// List of a client's activities with tick-off, plus the "Schedule an activity" form.
export function ActivityList({ projectId, onChange, compact }) {
  const [items, setItems] = useState(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState(null);
  const load = () => api(`/projects/${projectId}/activities`).then(setItems).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [projectId]);
  const changed = () => { load(); onChange?.(); };
  const toggle = async a => { await api(`/activities/${a.id}`, { method: 'PATCH', body: { done: !a.done_at } }).catch(e => setErr(e.message)); changed(); };
  const remove = async a => { await api(`/activities/${a.id}`, { method: 'DELETE' }).catch(e => setErr(e.message)); changed(); };
  const shown = (items || []).filter(a => !compact || !a.done_at || Date.now() - new Date(a.done_at) < 7 * 86400000);
  return (
    <div>
      {!items ? <div className="p-4 text-sm text-muted">Loading…</div> : (
        <ul>
          {shown.map(a => {
            const T = ACTIVITY_TYPES[a.type] || ACTIVITY_TYPES.task;
            const overdue = !a.done_at && a.due_at && new Date(a.due_at) < new Date();
            return (
              <li key={a.id} className="group flex items-start gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--line)' }}>
                <button onClick={() => toggle(a)} aria-label={a.done_at ? 'Mark as not done' : 'Mark as done'}
                  className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full transition-colors ${a.done_at ? 'bg-good text-white' : 'border-2 border-[var(--axis)] hover:border-good'}`}>
                  {a.done_at && <Check size={13} strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-2 text-[14px] font-medium ${a.done_at ? 'text-muted line-through' : 'text-ink'}`}>
                    <T.icon size={14} className="shrink-0 text-muted" />{a.title}
                  </div>
                  {!a.done_at && <div className={`mt-0.5 text-[12px] font-medium ${overdue ? 'text-bad' : 'text-good'}`}>{whenText(a.due_at)}</div>}
                </div>
                <button onClick={() => remove(a)} className="opacity-0 transition-opacity group-hover:opacity-100 text-muted hover:text-bad" aria-label="Delete activity"><Trash2 size={14} /></button>
              </li>
            );
          })}
          {!shown.length && <li className="px-4 py-4 text-sm text-muted" style={{ borderTop: '1px solid var(--line)' }}>Nothing planned yet.</li>}
        </ul>
      )}
      <ErrorBox error={err} />
      <div className="p-3" style={{ borderTop: '1px solid var(--line)' }}>
        {adding ? <NewActivity projectId={projectId} onDone={() => { setAdding(false); changed(); }} onCancel={() => setAdding(false)} />
          : <button className="btn-primary w-full justify-start rounded-xl py-2.5" onClick={() => setAdding(true)}><Plus size={15} />Schedule an activity</button>}
      </div>
    </div>
  );
}

function NewActivity({ projectId, onDone, onCancel }) {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(15, 0, 0, 0);
  const [v, setV] = useState({ type: 'call', title: '', due: localInput(tomorrow) });
  const [err, setErr] = useState(null);
  const input = useRef();
  useEffect(() => input.current?.focus(), []);
  const save = async e => {
    e.preventDefault(); setErr(null);
    try { await api(`/projects/${projectId}/activities`, { method: 'POST', body: { type: v.type, title: v.title, due_at: v.due ? new Date(v.due).toISOString() : null } }); onDone(); }
    catch (x) { setErr(x.message); }
  };
  return (
    <form onSubmit={save} className="grid gap-2.5">
      <div className="flex gap-1" role="radiogroup" aria-label="Type">
        {Object.entries(ACTIVITY_TYPES).map(([k, t]) => (
          <button type="button" key={k} role="radio" aria-checked={v.type === k} title={t.label} onClick={() => setV({ ...v, type: k })}
            className={`grid h-9 flex-1 place-items-center rounded-lg transition-colors ${v.type === k ? 'bg-accent text-white' : 'bg-fill text-ink2 hover:text-ink'}`}>
            <t.icon size={15} />
          </button>
        ))}
      </div>
      <input ref={input} className="input" placeholder={`${ACTIVITY_TYPES[v.type].label} — e.g. Product demo`} value={v.title} onChange={e => setV({ ...v, title: e.target.value })} />
      <input className="input" type="datetime-local" value={v.due} onChange={e => setV({ ...v, due: e.target.value })} aria-label="When" />
      <ErrorBox error={err} />
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={onCancel}>Cancel</button><button className="btn-primary btn-sm" disabled={!v.title.trim()}>Save</button></div>
    </form>
  );
}
