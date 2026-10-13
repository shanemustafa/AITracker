import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib.js';
import { ErrorBox } from '../ui.jsx';

function Frame({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent">
            <svg width="18" height="18" viewBox="0 0 32 32"><path d="M6 23l6-8 5 5 9-12" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="font-semibold">AI Answer Tracker</span>
        </div>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        <p className="mt-4 text-center text-xs text-muted">Measures what AI assistants say about brands. It does not change it.</p>
      </div>
    </div>
  );
}

function Form({ fields, submit, button }) {
  const [v, setV] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const go = async e => {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await submit(v); window.location.href = '/'; } catch (x) { setErr(x.message); setBusy(false); }
  };
  return (
    <form onSubmit={go} className="flex flex-col gap-3">
      {fields.map(f => (
        <div key={f.name}>
          <label className="label" htmlFor={f.name}>{f.label}</label>
          <input id={f.name} className="input" type={f.type || 'text'} autoComplete={f.auto} required={!f.optional}
            value={v[f.name] ?? f.value ?? ''} disabled={f.disabled} onChange={e => setV({ ...v, [f.name]: e.target.value })} />
        </div>
      ))}
      <ErrorBox error={err} />
      <button className="btn-primary mt-1" disabled={busy}>{busy ? 'Please wait…' : button}</button>
    </form>
  );
}

export function Login() {
  return (
    <Frame title="Log in">
      <Form button="Log in" submit={v => api('/auth/login', { method: 'POST', body: v })} fields={[
        { name: 'email', label: 'Email', type: 'email', auto: 'email' },
        { name: 'password', label: 'Password', type: 'password', auto: 'current-password' },
      ]} />
    </Frame>
  );
}

export function Setup({ codeRequired }) {
  return (
    <Frame title="Create the first account" subtitle="This account will be the admin. You can invite colleagues afterwards.">
      <Form button="Create account" submit={v => api('/auth/setup', { method: 'POST', body: v })} fields={[
        ...(codeRequired ? [{ name: 'setupCode', label: 'Setup code (from your hosting settings)', type: 'password' }] : []),
        { name: 'name', label: 'Your name', auto: 'name' },
        { name: 'email', label: 'Email', type: 'email', auto: 'email' },
        { name: 'password', label: 'Password (8+ characters)', type: 'password', auto: 'new-password' },
      ]} />
    </Frame>
  );
}

export function Invite() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/auth/invite/${token}`).then(setInv).catch(e => setErr(e.message)); }, [token]);
  if (err) return <Frame title="Invite"><ErrorBox error={err} /></Frame>;
  if (!inv) return null;
  return (
    <Frame title="Join your team" subtitle={`You were invited as ${inv.email}.`}>
      <Form button="Create my account" submit={v => api(`/auth/invite/${token}`, { method: 'POST', body: v })} fields={[
        { name: 'name', label: 'Your name', auto: 'name' },
        { name: 'password', label: 'Choose a password (8+ characters)', type: 'password', auto: 'new-password' },
      ]} />
    </Frame>
  );
}
