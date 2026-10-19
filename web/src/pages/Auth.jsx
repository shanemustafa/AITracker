import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib.js';
import { ErrorBox } from '../ui.jsx';
import { LegalLinks } from './Legal.jsx';
import { Aurora, Logo } from '../motion.jsx';

function Frame({ title, subtitle, children }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <Aurora />
      <div className="rise relative w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="pop"><Logo size={64} draw /></span>
          <h1 className="mt-6 text-[32px] font-bold leading-tight tracking-display">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
        </div>
        <div className="card glass p-7 shadow-lift">{children}</div>
        <p className="mt-6 text-center text-xs text-muted">AI Answer Tracker measures what AI assistants say about brands.<br />It never tries to change it.</p>
        <LegalLinks className="mt-4 flex flex-col items-center text-center" />
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
      <button className="btn-primary mt-2 w-full py-3 text-[15px]" disabled={busy}>{busy ? 'Please wait…' : button}</button>
    </form>
  );
}

export function Login() {
  return (
    <Frame title="Sign in" subtitle="Welcome back to AI Answer Tracker.">
      <Form button="Sign in" submit={v => api('/auth/login', { method: 'POST', body: v })} fields={[
        { name: 'email', label: 'Email', type: 'email', auto: 'email' },
        { name: 'password', label: 'Password', type: 'password', auto: 'current-password' },
      ]} />
      <a href="/reset" className="mt-4 block text-center text-[13px] text-accent hover:underline">Forgot password?</a>
    </Frame>
  );
}

export function Reset() {
  return (
    <Frame title="Reset password" subtitle="Use the secret setup code from your hosting settings (Railway → AITracker → Variables → SETUP_CODE).">
      <Form button="Set new password" submit={v => api('/auth/reset', { method: 'POST', body: v })} fields={[
        { name: 'email', label: 'Your email (your username)', type: 'email', auto: 'email' },
        { name: 'setupCode', label: 'Setup code', type: 'password', auto: 'off' },
        { name: 'password', label: 'New password (8+ characters)', type: 'password', auto: 'new-password' },
      ]} />
      <a href="/login" className="mt-4 block text-center text-[13px] text-accent hover:underline">Back to sign in</a>
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
