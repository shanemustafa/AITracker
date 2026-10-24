import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Check, Plus, X, Loader2, ArrowRight, ArrowLeft, Ban, FlaskConical } from 'lucide-react';
import { api, fmtPct, fmtPos, COUNTRY_FLAGS, fmtMoney } from '../lib.js';
import { useMeta } from '../ctx.js';
import { ErrorBox, Badge, Sentiment, BrandDot } from '../ui.jsx';

const STEPS = ['Discovery', 'Brand', 'Competitors', 'Questions', 'Engines', 'First run'];

export default function Quickstart() {
  const meta = useMeta();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState(null);
  const [s, setS] = useState({
    category: 'business', offer: '', name: '', contact: '', goals: '', markets: ['FI'], compNotes: '', questionNotes: '',
    own: { name: '', domain: '' }, competitors: [], prompts: [], custom: '', customCountry: 'FI', customLang: 'en',
    engines: meta.engines.filter(e => e.supported).map(e => e.id), frequency: 'daily',
  });
  const up = patch => setS(x => ({ ...x, ...patch }));

  const lib = meta.brandLibrary.filter(b => b.category === s.category);
  const offer = s.offer.trim(), brandName = s.own.name.trim();
  const libPrompts = useMemo(() => {
    if (s.category !== 'business') return meta.promptLibrary.map((p, i) => ({ ...p, key: i }))
      .filter(p => p.c === s.category && (s.markets.includes(p.country) || p.country === 'GLOBAL'));
    // Any other business: fill the general templates with what the client offers, per market.
    const out = [];
    meta.generalPrompts.forEach((g, i) => {
      if (g.brand) { if (brandName) out.push({ key: `g${i}`, country: 'GLOBAL', language: 'en', topic: g.topic, text: g.t.replace('{brand}', brandName) }); return; }
      if (!offer) return;
      if (!g.t.includes('{where}')) { out.push({ key: `g${i}`, country: 'GLOBAL', language: 'en', topic: g.topic, text: g.t.replace('{offer}', offer) }); return; }
      for (const m of s.markets) out.push({ key: `g${i}-${m}`, country: m, language: 'en', topic: g.topic,
        text: g.t.replace('{offer}', offer).replace('{where}', m === 'GLOBAL' ? '' : ` in ${meta.countries[m]}`) });
    });
    return out;
  }, [s.category, s.markets.join(), offer, brandName]);
  useEffect(() => { up({ prompts: libPrompts.map(p => p.key) }); }, [libPrompts]);

  const next = () => {
    setErr(null);
    if (step === 0 && !s.markets.length) return setErr('Pick at least one market.');
    if (step === 0 && s.category === 'business' && !s.offer.trim()) return setErr('Describe in a few words what the client offers.');
    if (step === 1 && !s.own.name.trim()) return setErr('Type the client\'s brand name.');
    if (step === 2 && !s.competitors.length) return setErr('Add at least one competitor.');
    if (step === 2 && !s.custom) up({ custom: s.questionNotes });
    if (step === 3 && !s.prompts.length && !s.custom.trim()) return setErr('Pick or type at least one question.');
    if (step === 4 && !s.engines.length) return setErr('Pick at least one engine.');
    setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">New client project</h1>
      <p className="mt-1 text-sm text-muted">Six short steps. You'll see the first results in a few minutes.</p>
      <ol className="mt-5 mb-6 flex flex-wrap gap-2">
        {STEPS.map((t, i) => (
          <li key={t} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${i === step ? 'border-accent bg-accentSoft text-ink font-medium' : i < step ? 'border-line text-ink2' : 'border-line text-muted'}`}>
            {i < step ? <Check size={12} /> : <span>{i + 1}.</span>}{t}
          </li>
        ))}
      </ol>
      {meta.mode === 'demo' && step < 5 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-warnBg px-3 py-2 text-xs text-warnInk"><FlaskConical size={14} />Demo mode: this project will use simulated answers (free). Switch to live mode in Settings when your AI accounts are connected.</div>
      )}

      <div className="card p-6">
        {step === 0 && <>
          <H title="Discovery" text="Write down what you learn from the client. This becomes the project's discovery notes." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label">What kind of company is the client?</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta.categories).map(([k, v]) => (
                  <button key={k} className={`chip ${s.category === k ? 'chip-on' : ''}`} onClick={() => up({ category: k, competitors: [], own: { name: '', domain: '' } })}>{v}</button>
                ))}
              </div>
            </div>
            {s.category === 'business' && <div className="sm:col-span-2"><Field label="What does the client offer, in their customers' words?" value={s.offer} onChange={v => up({ offer: v })} placeholder="e.g. employee benefits apps, accounting software, vegan restaurants" />
              <p className="mt-1 text-xs text-muted">Used to write the starter questions, e.g. "What are the best employee benefits apps in Finland?"</p></div>}
            <Field label="Project name (optional)" value={s.name} onChange={v => up({ name: v })} placeholder="e.g. Acme — Nordic launch" />
            <Field label="Client contact (optional)" value={s.contact} onChange={v => up({ contact: v })} placeholder="Name, role" />
            <div className="sm:col-span-2">
              <span className="label">Priority markets</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(meta.countries).map(([k, v]) => (
                  <button key={k} className={`chip ${s.markets.includes(k) ? 'chip-on' : ''}`}
                    onClick={() => up({ markets: s.markets.includes(k) ? s.markets.filter(x => x !== k) : [...s.markets, k] })}>{COUNTRY_FLAGS[k]} {v}</button>
                ))}
              </div>
            </div>
            <Area label="Who does the client see as real competitors?" value={s.compNotes} onChange={v => up({ compNotes: v })} placeholder="Names the client mentioned, including local ones" />
            <Area label="Example questions their customers ask" value={s.questionNotes} onChange={v => up({ questionNotes: v })} placeholder="One per line — these will be added as questions" />
            <div className="sm:col-span-2"><Area label="What does the client want to achieve?" value={s.goals} onChange={v => up({ goals: v })} placeholder="e.g. Be recommended when customers ask AI for the best options in our market" /></div>
          </div>
        </>}

        {step === 1 && <>
          <H title="The client's brand" text="Type the brand and its website, or pick one of the examples." />
          <div className="mb-4 flex flex-wrap gap-2">
            {lib.map(b => <button key={b.name} className={`chip ${s.own.name === b.name ? 'chip-on' : ''}`} onClick={() => up({ own: { name: b.name, domain: b.domain, aliases: b.aliases } })}>{b.name}</button>)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand name" value={s.own.name} onChange={v => up({ own: { ...s.own, name: v } })} placeholder={s.category === 'business' ? 'e.g. Acme' : 'e.g. LeoVegas'} />
            <Field label="Website" value={s.own.domain} onChange={v => up({ own: { ...s.own, domain: v } })} placeholder={s.category === 'business' ? 'e.g. acme.com' : 'e.g. leovegas.com'} />
          </div>
          {lib.find(b => b.name === s.own.name)?.note && <p className="mt-3 text-xs text-muted">Note: {lib.find(b => b.name === s.own.name).note}</p>}
        </>}

        {step === 2 && <Competitors s={s} up={up} lib={lib} />}

        {step === 3 && <>
          <H title="Questions to ask the AI" text="These are pre-written questions real customers ask, for your markets. Untick any you don't want, and add your own." />
          <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
            {libPrompts.map(p => (
              <label key={p.key} className="flex cursor-pointer items-start gap-3 border-b border-line px-3 py-2.5 last:border-0 hover:bg-raised">
                <input type="checkbox" className="mt-1" checked={s.prompts.includes(p.key)}
                  onChange={() => up({ prompts: s.prompts.includes(p.key) ? s.prompts.filter(x => x !== p.key) : [...s.prompts, p.key] })} />
                <span className="flex-1 text-sm">{p.text}</span>
                <span className="shrink-0 text-xs text-muted">{COUNTRY_FLAGS[p.country]} {p.topic}</span>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <Area label="Add your own questions (one per line)" value={s.custom} onChange={v => up({ custom: v })} rows={4} />
            <div className="mt-2 flex gap-2">
              <select className="input w-auto" value={s.customCountry} onChange={e => up({ customCountry: e.target.value })} aria-label="Country for your questions">
                {Object.entries(meta.countries).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input w-auto" value={s.customLang} onChange={e => up({ customLang: e.target.value })} aria-label="Language for your questions">
                {Object.entries(meta.languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">{s.prompts.length + s.custom.split('\n').filter(x => x.trim()).length} questions selected.</p>
        </>}

        {step === 4 && <Engines s={s} up={up} />}

        {step === 5 && <FirstRun s={s} libPrompts={libPrompts} onDone={id => nav(`/p/${id}/overview`)} />}

        {step < 5 && (
          <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => (step ? setStep(step - 1) : nav('/'))}><ArrowLeft size={15} />{step ? 'Back' : 'Cancel'}</button>
            <div className="flex items-center gap-3">
              <ErrorBox error={err} />
              <button className="btn-primary" onClick={next}>{step === 4 ? 'Create project & run first check' : 'Continue'}<ArrowRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const H = ({ title, text }) => <div className="mb-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted">{text}</p></div>;
const Field = ({ label, value, onChange, placeholder }) => (
  <div><label className="label">{label}</label><input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>
);
const Area = ({ label, value, onChange, placeholder, rows = 3 }) => (
  <div><label className="label">{label}</label><textarea className="input" rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>
);

function Competitors({ s, up, lib }) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const has = n => s.competitors.some(c => c.name.toLowerCase() === n.toLowerCase());
  const toggle = b => up({ competitors: has(b.name) ? s.competitors.filter(c => c.name !== b.name) : [...s.competitors, { name: b.name, domain: b.domain, aliases: b.aliases }] });
  return <>
    <H title="Competitors" text="Pick the brands to compare against. Five to seven is a good number." />
    <div className="flex flex-wrap gap-2">
      {lib.filter(b => b.name !== s.own.name).map(b => (
        <button key={b.name} className={`chip ${has(b.name) ? 'chip-on' : ''}`} onClick={() => toggle(b)} title={b.note}>{has(b.name) && <Check size={12} />}{b.name}</button>
      ))}
    </div>
    {s.compNotes && <p className="mt-3 rounded-lg bg-raised p-2.5 text-xs text-ink2"><span className="font-medium">From discovery:</span> {s.compNotes}</p>}
    <div className="mt-4 flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[140px]"><label className="label">Add another brand</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Brand name" /></div>
      <div className="flex-1 min-w-[140px]"><label className="label">Website (optional)</label><input className="input" value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" /></div>
      <button className="btn-ghost" onClick={() => { if (name.trim() && !has(name)) up({ competitors: [...s.competitors, { name: name.trim(), domain }] }); setName(''); setDomain(''); }}><Plus size={15} />Add</button>
    </div>
    {!!s.competitors.length && (
      <div className="mt-4 flex flex-wrap gap-2">
        {s.competitors.map((c, i) => (
          <span key={c.name} className="chip chip-on"><BrandDot slot={i + 2} />{c.name}<button onClick={() => up({ competitors: s.competitors.filter(x => x !== c) })} aria-label={`Remove ${c.name}`}><X size={12} /></button></span>
        ))}
      </div>
    )}
    <p className="mt-4 text-xs text-muted">Tip: after the first check, the app will suggest brands that the AI mentions often but you aren't tracking yet.</p>
  </>;
}

function Engines({ s, up }) {
  const meta = useMeta();
  const [est, setEst] = useState(null);
  useEffect(() => { if (meta.mode === 'live') api('/settings').then(setEst).catch(() => {}); }, []);
  const count = s.prompts.length + s.custom.split('\n').filter(x => x.trim()).length;
  const runs = { daily: 30, every3: 10, weekly: 4.3, manual: 1 }[s.frequency];
  const monthly = est ? est.engines.filter(e => s.engines.includes(e.id)).reduce((t, e) => t + e.perAnswer * count * runs, 0) : null;
  return <>
    <H title="AI engines and schedule" text="Choose which AI assistants to check. We only use official APIs." />
    <div className="grid gap-2">
      {meta.engines.map(e => (
        <label key={e.id} className={`flex items-start gap-3 rounded-lg border border-line p-3 ${e.supported ? 'cursor-pointer hover:bg-raised' : 'opacity-70'}`}>
          {e.supported ? <input type="checkbox" className="mt-1" checked={s.engines.includes(e.id)} onChange={() => up({ engines: s.engines.includes(e.id) ? s.engines.filter(x => x !== e.id) : [...s.engines, e.id] })} />
            : <Ban size={15} className="mt-0.5 text-muted" />}
          <div className="text-sm">
            <div className="font-medium">{e.label} {!e.supported && <Badge>Not available</Badge>}</div>
            <div className="text-xs text-muted">{e.supported ? e.via : e.reason}</div>
          </div>
        </label>
      ))}
    </div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">How often to check</label>
        <select className="input" value={s.frequency} onChange={e => up({ frequency: e.target.value })}>
          <option value="daily">Every day (like Peec)</option><option value="every3">Every 3 days (cheaper)</option>
          <option value="weekly">Every week (cheapest)</option><option value="manual">Only when I press "Run now"</option>
        </select>
      </div>
      <div className="rounded-lg bg-raised p-3 text-sm">
        {meta.mode === 'demo' ? <><div className="font-medium">Cost: $0</div><div className="text-xs text-muted">Demo mode uses simulated answers.</div></>
          : <><div className="font-medium">Estimated cost: {monthly == null ? '…' : `${fmtMoney(monthly)} / month`}</div>
            <div className="text-xs text-muted">{count} questions × {s.engines.length} engines × ~{Math.round(runs)} checks a month. Your monthly cap still applies.</div></>}
      </div>
    </div>
  </>;
}

function FirstRun({ s, libPrompts, onDone }) {
  const [phase, setPhase] = useState('creating');
  const [run, setRun] = useState(null);
  const [pid, setPid] = useState(null);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const custom = s.custom.split('\n').map(x => x.trim()).filter(Boolean)
          .map(text => ({ text, country: s.customCountry, language: s.customLang, topic: 'Client question', tags: ['Discovery'] }));
        const prompts = [...libPrompts.filter(p => s.prompts.includes(p.key)).map(p => ({ text: p.text, country: p.country, language: p.language, topic: p.topic, tags: [p.topic] })), ...custom];
        const { id } = await api('/projects', { method: 'POST', body: {
          name: s.name || s.own.name, category: s.category, own: s.own, competitors: s.competitors, prompts,
          engines: s.engines, countries: s.markets, frequency: s.frequency,
          discovery: { competitors: s.compNotes || s.competitors.map(c => c.name).join(', '), markets: s.markets, questions: s.questionNotes || prompts.slice(0, 5).map(p => p.text).join('\n'), goals: s.goals, contact: s.contact, ...(s.offer ? { offer: s.offer } : {}) },
        } });
        setPid(id);
        setPhase('running');
        const r = await api(`/projects/${id}/run`, { method: 'POST' });
        while (!stop) {
          const st = await api(`/runs/${r.runId}`);
          setRun(st);
          if (st.status !== 'running') break;
          await new Promise(res => setTimeout(res, 1200));
        }
        setResult(await api(`/projects/${id}/summary?days=1`));
        setPhase('done');
      } catch (e) { setErr(e.message); }
    })();
    return () => { stop = true; };
  }, []);
  if (err) return <><ErrorBox error={err} />{pid && <Link className="btn-ghost mt-4" to={`/p/${pid}/journey`}>Open the project</Link>}</>;
  return (
    <div>
      <H title={phase === 'done' ? 'First results are in' : 'Running the first check…'} text={phase === 'done' ? 'Here is how often each brand appeared in today\'s answers.' : 'We are asking every question to every engine. You can leave this page; it keeps going.'} />
      {phase !== 'done' && (
        <div>
          <div className="flex items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" />{phase === 'creating' ? 'Creating the project…' : `${run?.done || 0} of ${run?.total || '…'} answers collected`}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full border border-line bg-raised"><div className="h-full bg-accent transition-all" style={{ width: `${run?.total ? (100 * (run.done + run.failed)) / run.total : 3}%` }} /></div>
        </div>
      )}
      {phase === 'done' && result && <>
        {run?.message && <div className="mb-3"><ErrorBox error={run.message} /></div>}
        <table className="w-full">
          <thead><tr><th className="th">Brand</th><th className="th">Visibility</th><th className="th">Position</th><th className="th">Sentiment</th></tr></thead>
          <tbody>
            {[...result.brands].sort((a, b) => (b.visibility || 0) - (a.visibility || 0)).map(b => (
              <tr key={b.id}><td className="td"><span className="flex items-center gap-2"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span></span></td>
                <td className="td tnum">{fmtPct(b.visibility)}</td><td className="td tnum">{fmtPos(b.position)}</td><td className="td"><Sentiment value={b.sentiment} /></td></tr>
            ))}
          </tbody>
        </table>
        {result.simulatedAnswers > 0 && <p className="mt-3 text-xs text-warnInk">These are simulated answers (demo mode).</p>}
        <div className="mt-6 flex justify-end"><button className="btn-primary" onClick={() => onDone(pid)}>Open the dashboard<ArrowRight size={15} /></button></div>
      </>}
    </div>
  );
}
