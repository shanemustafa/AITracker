import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { useApi, useFilters, api, fmtPct, fmtPos, COUNTRY_FLAGS } from '../lib.js';
import { useMeta, useProject } from '../ctx.js';
import { Card, Stat, Delta, Spinner, ErrorBox, SimBanner, Empty, Segmented, BrandDot, Bar, Sentiment, useToast } from '../ui.jsx';
import { TrendChart, ShareOfVoiceChart, VisibilitySentimentMap, Legend, smooth } from '../charts.jsx';
import FilterBar from './FilterBar.jsx';

export default function Overview() {
  const { project, reload } = useProject();
  const { qs, f } = useFilters();
  const sum = useApi(`/projects/${project.id}/summary?${qs}`);
  const daily = useApi(`/projects/${project.id}/daily?${qs}`);
  const engines = useApi(`/projects/${project.id}/engines?${qs}`);
  const countries = useApi(`/projects/${project.id}/countries?${qs}`);
  const sugg = useApi(`/projects/${project.id}/suggestions?${qs}`);

  if (sum.error) return <ErrorBox error={sum.error} />;
  if (!sum.data) return <><FilterBar /><Spinner /></>;
  const s = sum.data;
  const own = s.brands.find(b => b.is_own);
  const colorOf = Object.fromEntries(s.brands.map(b => [b.id, b.color]));

  if (!s.totalAnswers) return <><FilterBar />{project.data_mode === 'live'
    ? <Empty title="No real answers yet" action={<Link className="btn-primary" to="/settings">Connect an AI engine</Link>}>This client uses real AI answers. Connect at least one AI engine and set a monthly spending cap in Settings, then press "Run now" at the top. Results appear within minutes.</Empty>
    : <Empty title="No answers in this period yet" action={<Link className="btn-primary" to="../prompts">Check your questions</Link>}>Press "Run now" at the top to ask the AI engines your questions. Results appear here within minutes.</Empty>}</>;

  return (
    <>
      <FilterBar />
      <div className="mb-4"><SimBanner show={s.simulatedAnswers > 0} /></div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Visibility" help="Share of AI answers that mention your brand at all." value={fmtPct(own?.visibility)}
          delta={<Delta now={own?.visibility} before={own?.prev?.visibility} />} sub={`of ${s.totalAnswers} answers`} />
        <Stat label="Position" help="Average rank when you are mentioned. 1 = named first. Lower is better." value={fmtPos(own?.position)}
          delta={<Delta now={own?.position} before={own?.prev?.position} invert unit="" />} />
        <Stat label="Sentiment" help="Tone of the sentences that mention you: 0 = very negative, 50 = neutral, 100 = very positive." value={<Sentiment value={own?.sentiment} />}
          delta={<Delta now={own?.sentiment} before={own?.prev?.sentiment} digits={0} />} />
        <Stat label="Share of voice" help="Your mentions as a share of all mentions of tracked brands." value={fmtPct(own?.sov)}
          delta={<Delta now={own?.sov} before={own?.prev?.sov} />} sub={`rank #${own?.rank} of ${s.brands.length}`} />
      </div>
      <p className="mt-2 text-xs text-muted">Changes compare with the previous {f.days} days.</p>

      {!!sugg.data?.length && <Suggestions list={sugg.data.slice(0, 3)} projectId={project.id} onAdded={reload} />}

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Trends className="xl:col-span-7" daily={daily.data} />
        <Ranking className="xl:col-span-5" brands={s.brands} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Visibility vs sentiment" subtitle="Right = mentioned more often. Up = described more positively.">
          <VisibilitySentimentMap brands={s.brands} />
        </Card>
        <Card className="xl:col-span-3" title="Share of voice over time" subtitle="Each brand's share of all tracked-brand mentions, per day (7-day average).">
          {daily.data ? <>
            <ShareOfVoiceChart data={smooth(daily.data.series, daily.data.brands.map(b => `s_${b.id}`))} brands={daily.data.brands} />
            <div className="mt-2"><Legend brands={daily.data.brands} /></div>
          </> : <Spinner />}
        </Card>
      </div>
      <EngineTable data={engines.data} brands={s.brands} colorOf={colorOf} />
      <CountryTable data={countries.data} brands={s.brands} />
    </>
  );
}

function Suggestions({ list, projectId, onAdded }) {
  const toast = useToast();
  const add = async name => { await api(`/projects/${projectId}/brands`, { method: 'POST', body: { name } }); toast(`${name} is now tracked. History was recounted.`); onAdded(); };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <Sparkles size={15} className="text-accent" />
      <span className="text-ink2">Often mentioned but not tracked:</span>
      {list.map(s => (
        <button key={s.name} className="chip hover:border-accent" onClick={() => add(s.name)} title="Track this brand">
          <Plus size={12} />{s.name} <span className="text-muted">{s.visibility}%</span>
        </button>
      ))}
      <Link to="../competitors" className="ml-auto text-xs text-muted underline">See all</Link>
    </div>
  );
}

function Trends({ daily, className }) {
  const [metric, setMetric] = useState('v');
  const [hidden, setHidden] = useState(new Set());
  const data = useMemo(() => daily ? smooth(daily.series, daily.brands.map(b => `${metric}_${b.id}`), metric === 'p' || metric === 't' ? 1 : 7) : [], [daily, metric]);
  const toggle = id => setHidden(h => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Card className={className} title="Trend" subtitle={metric === 'v' ? 'Visibility per day, 7-day average' : metric === 's' ? 'Share of voice per day, 7-day average' : metric === 'p' ? 'Average position per day (1 = top)' : 'Sentiment per day (0–100)'}
      right={<Segmented size="sm" value={metric} onChange={setMetric} options={[{ value: 'v', label: 'Visibility' }, { value: 's', label: 'Share of voice' }, { value: 'p', label: 'Position' }, { value: 't', label: 'Sentiment' }]} />}>
      {daily ? <>
        <TrendChart data={data} brands={daily.brands} prefix={metric} hidden={hidden} unit={metric === 'p' ? '' : metric === 't' ? '' : '%'} domain={metric === 'p' ? [1, 'auto'] : metric === 't' ? [0, 100] : [0, 'auto']} />
        <div className="mt-2"><Legend brands={daily.brands} hidden={hidden} onToggle={toggle} /></div>
        <p className="mt-1 text-[11px] text-muted">Click a name to hide or show it.</p>
      </> : <Spinner />}
    </Card>
  );
}

function Ranking({ brands, className }) {
  const rows = [...brands].sort((a, b) => a.rank - b.rank);
  return (
    <Card className={className} title="Competitor ranking" subtitle="Sorted by visibility." pad={false}>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="compact w-full">
          <thead><tr><th className="th">#</th><th className="th">Brand</th><th className="th">Visibility</th><th className="th">Pos.</th><th className="th">Sent.</th><th className="th">SoV</th></tr></thead>
          <tbody>
            {rows.map(b => (
              <tr key={b.id} className={b.is_own ? 'bg-accentSoft' : ''}>
                <td className="td tnum text-muted">{b.rank}</td>
                <td className="td"><span className="flex items-center gap-2 whitespace-nowrap"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span></span></td>
                <td className="td"><span className="tnum">{fmtPct(b.visibility)}</span>
                  <div><Delta now={b.visibility} before={b.prev?.visibility} short /></div></td>
                <td className="td tnum">{fmtPos(b.position)}</td>
                <td className="td"><Sentiment value={b.sentiment} compact /></td>
                <td className="td tnum">{fmtPct(b.sov)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EngineTable({ data, brands }) {
  const meta = useMeta();
  if (!data) return null;
  return (
    <Card className="mt-4" title="By AI engine" subtitle="Visibility of each brand on each engine. Engines answer differently, so this shows where you are strong or weak." pad={false}>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full">
          <thead><tr><th className="th">Brand</th>{data.map(e => <th key={e.engine} className="th">{meta.engines.find(x => x.id === e.engine)?.label || e.engine}<div className="font-normal">{e.totalAnswers} answers</div></th>)}</tr></thead>
          <tbody>
            {brands.map(b => (
              <tr key={b.id} className={b.is_own ? 'bg-accentSoft' : ''}>
                <td className="td"><span className="flex items-center gap-2 whitespace-nowrap"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span></span></td>
                {data.map(e => {
                  const x = e.brands.find(y => y.id === b.id);
                  return <td key={e.engine} className="td"><div className="flex items-center gap-2"><span className="tnum w-11">{fmtPct(x?.visibility)}</span><Bar value={x?.visibility} slot={b.color} /></div>
                    <div className="text-[11px] text-muted tnum">pos {fmtPos(x?.position)} · tone {x?.sentiment ?? '—'}</div></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function CountryTable({ data, brands }) {
  const meta = useMeta();
  if (!data || data.length < 2) return null;
  return (
    <Card className="mt-4" title="By country" subtitle="Visibility per market, based on the country tag of each question." pad={false}>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full">
          <thead><tr><th className="th">Brand</th>{data.map(c => <th key={c.country} className="th">{COUNTRY_FLAGS[c.country]} {meta.countries[c.country] || c.country}</th>)}</tr></thead>
          <tbody>
            {brands.map(b => (
              <tr key={b.id} className={b.is_own ? 'bg-accentSoft' : ''}>
                <td className="td"><span className="flex items-center gap-2 whitespace-nowrap"><BrandDot slot={b.color} /><span className={b.is_own ? 'font-semibold' : ''}>{b.name}</span></span></td>
                {data.map(c => { const x = c.brands.find(y => y.id === b.id); return <td key={c.country} className="td tnum">{fmtPct(x?.visibility)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
