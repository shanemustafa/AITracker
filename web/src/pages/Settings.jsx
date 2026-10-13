import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, Copy, Ban, KeyRound, Loader2, ExternalLink } from 'lucide-react';
import { api, useApi, fmtMoney } from '../lib.js';
import { useMeta, useUser } from '../ctx.js';
import { Card, PageHeader, Spinner, ErrorBox, Badge, Segmented, useToast, Modal, Tip } from '../ui.jsx';

const TABS = [['engines', 'AI engines'], ['costs', 'Costs & limits'], ['team', 'Team'], ['api', 'API & exports'], ['data', 'Mode & backups']];

const KEY_HELP = {
  chatgpt: { site: 'https://platform.openai.com/api-keys', steps: ['Go to platform.openai.com and sign up or log in.', 'Click Settings (gear) → Billing → add a payment card and buy $10 of credit.', 'Click API keys → "Create new secret key" → name it "AI Tracker" → Create.', 'Copy the key (starts with sk-) and paste it here. You can only see it once.'] },
  gemini: { site: 'https://aistudio.google.com/apikey', steps: ['Go to aistudio.google.com and log in with a Google account.', 'Click "Get API key" → "Create API key" → pick or create a Google Cloud project.', 'To go beyond the free tier, click "Set up billing" next to the key and add a card.', 'Copy the key (starts with AIza) and paste it here.'] },
  perplexity: { site: 'https://www.perplexity.ai/account/api', steps: ['Go to perplexity.ai, log in, then open Settings → API (perplexity.ai/account/api).', 'Add a payment method and buy credit (e.g. $10).', 'Click "Generate API key" (or "Create key").', 'Copy the key (starts with pplx-) and paste it here.'] },
  claude: { site: 'https://console.anthropic.com/settings/keys', steps: ['Go to console.anthropic.com and sign up or log in.', 'Open Settings → Billing and buy credit (e.g. $10).', 'Open Settings → API keys → "Create key", name it "AI Tracker".', 'Copy the key (starts with sk-ant-) and paste it here.'] },
};

export default function SettingsPage() {
  const loc = useLocation();
  const [tab, setTab] = useState(loc.hash?.slice(1) || 'engines');
  const s = useApi('/settings');
  const user = useUser();
  useEffect(() => { if (loc.hash) setTab(loc.hash.slice(1)); }, [loc.hash]);
  return (
    <>
      <PageHeader title="Settings" subtitle={user.role !== 'admin' ? 'Only admins can change these settings.' : undefined} />
      <div className="mb-5 overflow-x-auto"><Segmented value={tab} onChange={t => { setTab(t); window.history.replaceState(null, '', '#' + t); }} options={TABS.map(([value, label]) => ({ value, label }))} /></div>
      {s.error && <ErrorBox error={s.error} />}
      {!s.data ? <Spinner /> : <>
        {tab === 'engines' && <Engines s={s.data} reload={s.reload} />}
        {tab === 'costs' && <Costs s={s.data} reload={s.reload} />}
        {tab === 'team' && <Team />}
        {tab === 'api' && <ApiTab s={s.data} reload={s.reload} />}
        {tab === 'data' && <DataTab s={s.data} reload={s.reload} />}
      </>}
    </>
  );
}

function Engines({ s, reload }) {
  const meta = useMeta();
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">{s.engines.map(e => <EngineCard key={e.id} e={e} reload={reload} />)}</div>
      <Card title="Engines we cannot support honestly" subtitle="We only use official APIs. These have none, so we leave them out instead of scraping.">
        <ul className="grid gap-3">
          {meta.engines.filter(e => !e.supported).map(e => (
            <li key={e.id} className="flex gap-3"><Ban size={15} className="mt-0.5 shrink-0 text-muted" /><div><div className="text-sm font-medium">{e.label}</div><div className="text-sm text-ink2">{e.reason}</div></div></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function EngineCard({ e, reload }) {
  const user = useUser();
  const toast = useToast();
  const [key, setKey] = useState('');
  const [model, setModel] = useState(e.model);
  const [help, setHelp] = useState(false);
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const admin = user.role === 'admin';
  const save = async () => {
    setErr(null);
    try { await api('/settings', { method: 'PATCH', body: { keys: key ? { [e.id]: key } : undefined, models: { [e.id]: model } } }); setKey(''); toast(`${e.label} saved`); reload(); }
    catch (x) { setErr(x.message); }
  };
  const remove = async () => { await api('/settings', { method: 'PATCH', body: { keys: { [e.id]: '' } } }); toast('Key removed'); reload(); };
  const runTest = async () => {
    setBusy(true); setTest(null); setErr(null);
    try { setTest(await api(`/settings/test/${e.id}`, { method: 'POST' })); } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  return (
    <Card title={<span className="flex items-center gap-2">{e.label}{e.connected ? <Badge tone="good"><Check size={11} />Connected {e.keyHint}</Badge> : <Badge>Not connected</Badge>}</span>} subtitle={e.via}>
      <p className="text-xs text-muted">{e.caveat}</p>
      <div className="mt-3 grid gap-3">
        <div><label className="label">API key {e.fromEnv && '(set on the server)'}</label>
          <div className="flex gap-2"><input className="input" type="password" autoComplete="off" disabled={!admin} placeholder={e.connected ? 'Paste a new key to replace it' : 'Paste your API key'} value={key} onChange={x => setKey(x.target.value)} /></div>
          <button className="mt-1 text-xs text-accent underline" onClick={() => setHelp(true)}>How do I get this key?</button>
        </div>
        <div><label className="label">Model <Tip text={`Default: ${e.defaultModel}. Change only if the provider retires this name. A cheaper model lowers cost but may answer differently from the consumer app.`} /></label>
          <input className="input" disabled={!admin} value={model} onChange={x => setModel(x.target.value)} /></div>
        <div className="text-xs text-muted">Estimated cost per answer: <strong className="text-ink">{fmtMoney(e.perAnswer)}</strong> (about {Math.round(1 / e.perAnswer)} answers per $1)</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary btn-sm" disabled={!admin} onClick={save}><KeyRound size={13} />Save</button>
          {e.connected && <button className="btn-ghost btn-sm" disabled={!admin || busy} onClick={runTest}>{busy ? <Loader2 size={13} className="animate-spin" /> : null}Test (costs ~1 answer)</button>}
          {e.connected && !e.fromEnv && <button className="btn-ghost btn-sm" disabled={!admin} onClick={remove}>Remove key</button>}
        </div>
        <ErrorBox error={err} />
        {test && <div className="rounded-lg border border-good p-3 text-xs"><div className="font-medium text-good">It works ({(test.ms / 1000).toFixed(1)}s, model {test.model})</div><p className="mt-1 text-ink2">{test.text}</p>
          {test.citations?.map(c => <div key={c.url} className="truncate text-muted">{c.url}</div>)}</div>}
      </div>
      <Modal open={help} onClose={() => setHelp(false)} title={`Get a ${e.label} API key`}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink2">{KEY_HELP[e.id].steps.map(x => <li key={x}>{x}</li>)}</ol>
        <a className="btn-primary mt-4" href={KEY_HELP[e.id].site} target="_blank" rel="noreferrer">Open the page<ExternalLink size={13} /></a>
        <p className="mt-3 text-xs text-muted">Keep keys private. Anyone with the key can spend your credit. The key is stored on your server and only the last 4 characters are ever shown again.</p>
      </Modal>
    </Card>
  );
}

function Costs({ s, reload }) {
  const user = useUser();
  const toast = useToast();
  const est = useApi('/costs/estimate');
  const [cap, setCap] = useState(String(s.monthly_cap || ''));
  const [prices, setPrices] = useState(Object.fromEntries(s.engines.map(e => [e.id, e.price])));
  const save = async () => { await api('/settings', { method: 'PATCH', body: { monthly_cap: Number(cap) || 0, prices } }); toast('Saved'); reload(); est.reload(); };
  const admin = user.role === 'admin';
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Monthly spending cap" subtitle="Real checks stop automatically before this would be exceeded. With no cap set, real checks will not run at all.">
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="label">Cap in US dollars per month</label><input className="input" inputMode="decimal" disabled={!admin} value={cap} onChange={e => setCap(e.target.value)} placeholder="e.g. 50" /></div>
          <button className="btn-primary" disabled={!admin} onClick={save}>Save</button>
        </div>
        <div className="mt-4 text-sm">Spent this month (estimated): <strong>{fmtMoney(s.spend)}</strong>{s.monthly_cap ? <> of {fmtMoney(s.monthly_cap)}</> : null}</div>
        {s.monthly_cap > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full border border-line bg-raised"><div className="h-full bg-accent" style={{ width: `${Math.min(100, (100 * s.spend) / s.monthly_cap)}%` }} /></div>}
        <ul className="mt-2 text-xs text-muted">{s.spendByEngine.map(x => <li key={x.engine}>{x.engine}: {x.answers} answers, {fmtMoney(x.cost)}</li>)}</ul>
        <p className="mt-3 text-xs text-muted">Also set a hard limit inside each provider's billing page. That is the real safety net, because our numbers are estimates.</p>
      </Card>
      <Card title="Estimated monthly cost" subtitle="Before you switch anything on. Based on active questions × engines × how often each project runs.">
        {!est.data ? <Spinner /> : <>
          <table className="w-full"><thead><tr><th className="th">Project</th><th className="th">Questions</th><th className="th">Per check</th><th className="th">Per month</th></tr></thead>
            <tbody>{est.data.projects.map(p => (
              <tr key={p.id}><td className="td">{p.name}<div className="text-[11px] text-muted">{p.data_mode === 'live' ? 'real data' : 'simulated — costs $0 now'} · {p.frequency}</div></td>
                <td className="td tnum">{p.prompts} × {p.engines.length}</td><td className="td tnum">{fmtMoney(p.perRun)}</td><td className="td tnum">{fmtMoney(p.monthly)}</td></tr>))}</tbody></table>
          <div className="mt-3 text-sm">Projects on real data now: <strong>{fmtMoney(est.data.liveTotal)} / month</strong></div>
          <p className="mt-2 text-xs text-muted">Rule of thumb: 40 questions on 4 engines every day is about 4,800 answers a month. With the default models that is roughly $80–$200 a month, mostly Claude. Checking every 3 days cuts it by two thirds.</p>
        </>}
      </Card>
      <Card className="lg:col-span-2" title="Price assumptions (advanced)" subtitle="List prices in USD, checked October 2026. Update them if a provider changes prices.">
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Engine</th><th className="th">$ per 1M input tokens</th><th className="th">$ per 1M output tokens</th><th className="th">$ per web search</th><th className="th">Typical searches</th></tr></thead>
          <tbody>{s.engines.map(e => (
            <tr key={e.id}><td className="td">{e.label}</td>
              {['inPerM', 'outPerM', 'perSearch', 'typicalSearches'].map(k => <td key={k} className="td"><input className="input w-24 py-1" disabled={!admin} value={prices[e.id][k]} onChange={x => setPrices({ ...prices, [e.id]: { ...prices[e.id], [k]: x.target.value } })} /></td>)}</tr>))}</tbody></table></div>
        <button className="btn-primary btn-sm mt-3" disabled={!admin} onClick={save}>Save prices</button>
      </Card>
    </div>
  );
}

function Team() {
  const user = useUser();
  const t = useApi('/team');
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [link, setLink] = useState(null);
  const [err, setErr] = useState(null);
  const [pw, setPw] = useState({ current: '', next: '' });
  const invite = async () => {
    setErr(null);
    try { const r = await api('/team/invite', { method: 'POST', body: { email } }); setLink(`${window.location.origin}/invite/${r.token}`); setEmail(''); t.reload(); }
    catch (e) { setErr(e.message); }
  };
  if (!t.data) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="People with access" pad={false}>
        <table className="w-full"><tbody>
          {t.data.users.map(u => <tr key={u.id}><td className="td">{u.name}<div className="text-xs text-muted">{u.email}</div></td><td className="td"><Badge tone={u.role === 'admin' ? 'accent' : 'default'}>{u.role}</Badge></td>
            <td className="td text-right">{user.role === 'admin' && u.id !== user.id && <button className="btn-ghost btn-sm" onClick={async () => { if (confirm(`Remove ${u.email}?`)) { await api(`/team/user/${u.id}`, { method: 'DELETE' }); t.reload(); } }}>Remove</button>}</td></tr>)}
          {t.data.invites.map(i => <tr key={i.token}><td className="td text-muted">{i.email}<div className="text-xs">invited, not joined yet</div></td><td className="td"><Badge>{i.role}</Badge></td>
            <td className="td text-right">{user.role === 'admin' && <button className="btn-ghost btn-sm" onClick={async () => { await api(`/team/invite/${i.token}`, { method: 'DELETE' }); t.reload(); }}>Cancel</button>}</td></tr>)}
        </tbody></table>
      </Card>
      <div className="grid gap-4">
        <Card title="Invite a colleague" subtitle="You get a link to send them by email or chat. The app does not send emails itself.">
          <div className="flex gap-2"><input className="input" type="email" placeholder="colleague@company.com" value={email} onChange={e => setEmail(e.target.value)} disabled={user.role !== 'admin'} />
            <button className="btn-primary" onClick={invite} disabled={!email || user.role !== 'admin'}>Create link</button></div>
          <ErrorBox error={err} />
          {link && <div className="mt-3 rounded-lg bg-raised p-3 text-xs"><div className="mb-1 text-muted">Send this link (works once):</div><div className="flex items-center gap-2"><code className="flex-1 break-all">{link}</code>
            <button className="btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(link); toast('Link copied'); }}><Copy size={13} />Copy</button></div></div>}
        </Card>
        <Card title="Change my password">
          <div className="grid gap-2">
            <input className="input" type="password" placeholder="Current password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} />
            <input className="input" type="password" placeholder="New password (8+ characters)" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} />
            <button className="btn-primary" onClick={async () => { try { await api('/team/password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); toast('Password changed'); } catch (e) { alert(e.message); } }}>Change password</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ApiTab({ s, reload }) {
  const toast = useToast();
  const projects = useApi('/projects');
  const base = window.location.origin;
  const pid = projects.data?.[0]?.id || 1;
  const copy = t => { navigator.clipboard.writeText(t); toast('Copied'); };
  const sheet = `=IMPORTDATA("${base}/api/v1/projects/${pid}/daily.csv?days=90&key=${s.apiToken}")`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Your API key" subtitle="Lets other tools read your data. Treat it like a password.">
        <div className="flex items-center gap-2"><code className="flex-1 break-all rounded-lg bg-raised p-2 text-xs">{s.apiToken}</code><button className="btn-ghost btn-sm" onClick={() => copy(s.apiToken)}><Copy size={13} />Copy</button></div>
        <button className="btn-ghost btn-sm mt-3" onClick={async () => { if (confirm('Make a new key? Anything using the old key will stop working.')) { await api('/settings/rotate-api-token', { method: 'POST' }); reload(); } }}>Make a new key</button>
        <div className="mt-4 text-xs text-ink2">
          <div className="font-medium text-ink mb-1">Addresses (add <code>?key=YOUR_KEY</code>)</div>
          <ul className="space-y-1 font-mono text-[11px] break-all">
            <li>{base}/api/v1/projects</li>
            <li>{base}/api/v1/projects/{'{id}'}/summary?days=30</li>
            {['summary', 'daily', 'answers', 'sources', 'prompts'].map(k => <li key={k}>{base}/api/v1/projects/{'{id}'}/{k}.csv?days=30</li>)}
          </ul>
          <p className="mt-2 text-muted">Filters: <code>days</code>, <code>from</code>, <code>to</code> (YYYY-MM-DD), <code>engines</code> (e.g. chatgpt,gemini), <code>country</code>, <code>tag</code>. Every row has a <code>simulated</code> column.</p>
        </div>
      </Card>
      <div className="grid gap-4">
        <Card title="Google Sheets" subtitle="A live copy of your data in a spreadsheet. It refreshes about every hour.">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink2">
            <li>Open a new Google Sheet.</li><li>Click cell A1 and paste this formula:</li>
          </ol>
          <div className="mt-2 flex items-center gap-2"><code className="flex-1 break-all rounded-lg bg-raised p-2 text-[11px]">{sheet}</code><button className="btn-ghost btn-sm" onClick={() => copy(sheet)}><Copy size={13} /></button></div>
          <p className="mt-2 text-xs text-muted">Change <code>{pid}</code> to another project number, or <code>daily</code> to summary/answers/sources/prompts. This only works once the app is online (not on your own computer).</p>
        </Card>
        <Card title="Looker Studio" subtitle="Dashboards for clients, using the Google Sheet above as the data source.">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink2">
            <li>Set up the Google Sheet above first.</li>
            <li>Go to lookerstudio.google.com → Create → Report.</li>
            <li>Choose the "Google Sheets" connector, pick your sheet, click Add.</li>
            <li>Add charts. Use "day" as the date and "visibility" or "share_of_voice" as the number.</li>
          </ol>
          <p className="mt-2 text-xs text-muted">Simulated rows are marked "yes" in the simulated column. Filter them out before showing a client.</p>
        </Card>
      </div>
    </div>
  );
}

function DataTab({ s, reload }) {
  const user = useUser();
  const meta = useMeta();
  const toast = useToast();
  const [confirmLive, setConfirmLive] = useState(false);
  const [hour, setHour] = useState(s.run_hour_utc);
  const setMode = async m => { await api('/settings', { method: 'PATCH', body: { mode: m } }); toast(m === 'live' ? 'Live mode on' : 'Demo mode on'); setConfirmLive(false); reload(); meta.reload(); };
  const admin = user.role === 'admin';
  const connected = s.engines.filter(e => e.connected).length;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Mode" subtitle="Decides what NEW projects use. Existing projects keep their own setting (see each project's settings).">
        <Segmented value={s.mode} onChange={m => (m === 'live' ? setConfirmLive(true) : setMode('demo'))} options={[{ value: 'demo', label: 'Demo (simulated, free)' }, { value: 'live', label: 'Live (real AI, paid)' }]} />
        <p className="mt-3 text-sm text-ink2">{s.mode === 'demo' ? 'New projects get simulated answers, clearly labelled. Nothing costs money.' : 'New projects ask the real AI engines you connected, within your monthly cap.'}</p>
      </Card>
      <Card title="Daily check time" subtitle="When scheduled checks start each day (UTC time zone; Finland is UTC+2 in winter, UTC+3 in summer).">
        <div className="flex items-end gap-2"><div><label className="label">Hour (0–23, UTC)</label><input className="input w-24" type="number" min={0} max={23} value={hour} disabled={!admin} onChange={e => setHour(e.target.value)} /></div>
          <button className="btn-primary" disabled={!admin} onClick={async () => { await api('/settings', { method: 'PATCH', body: { run_hour_utc: Number(hour) } }); toast('Saved'); reload(); }}>Save</button></div>
      </Card>
      <Card title="Backups" subtitle="The app saves a full copy of all data every day and before anything is deleted. The newest 20 are kept.">
        <button className="btn-ghost" disabled={!admin} onClick={async () => { const r = await api('/backup', { method: 'POST' }); toast(`Backup saved: ${r.file}`); }}>Make a backup now</button>
      </Card>
      <Modal open={confirmLive} onClose={() => setConfirmLive(false)} title="Turn on live mode?">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
          <li>{connected ? `${connected} engine(s) connected.` : <strong className="text-bad">No AI engine is connected yet. Add a key in "AI engines" first.</strong>}</li>
          <li>{s.monthly_cap ? `Monthly cap: ${fmtMoney(s.monthly_cap)}.` : <strong className="text-bad">No monthly cap set. Real checks will not run until you set one in "Costs & limits".</strong>}</li>
          <li>Demo projects stay simulated. New projects will use real answers.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setConfirmLive(false)}>Cancel</button><button className="btn-primary" onClick={() => setMode('live')}>Turn on live mode</button></div>
      </Modal>
    </div>
  );
}
