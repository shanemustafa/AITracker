import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useApi, useFilters } from '../lib.js';
import { useProject } from '../ctx.js';
import { Card, PageHeader, Spinner, ErrorBox, Badge, SimBanner, Segmented, Bar } from '../ui.jsx';
import { HBars } from '../charts.jsx';
import FilterBar from './FilterBar.jsx';

const TONE = { own: 'accent', competitor: 'bad', review: 'default', forum: 'default', news: 'default', official: 'good', reference: 'default', brand: 'default', other: 'default' };

export default function Sources() {
  const { project } = useProject();
  const { qs } = useFilters();
  const s = useApi(`/projects/${project.id}/sources?${qs}`);
  const [type, setType] = useState('');
  const [view, setView] = useState('domains');
  if (s.error) return <ErrorBox error={s.error} />;
  const d = s.data;
  const own = project.brands.find(b => b.is_own);
  return (
    <>
      <PageHeader title="Sources" subtitle="The websites AI engines cite when they answer. If a site is cited often and you are missing from it, that is where a mention could help." />
      <FilterBar />
      <div className="mb-4"><SimBanner show={project.data_mode !== 'live'}>The website addresses below are made up for the demo.</SimBanner></div>
      {!d ? <Spinner /> : <>
        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2" title="By type of website" subtitle="Share of answers that cite at least one site of this type.">
            <HBars rows={d.byType.map(t => ({ label: t.label, value: Math.round((1000 * t.answers) / Math.max(1, d.totalAnswers)) / 10 }))} />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button className={`chip ${!type ? 'chip-on' : ''}`} onClick={() => setType('')}>All types</button>
              {d.byType.map(t => <button key={t.category} className={`chip ${type === t.category ? 'chip-on' : ''}`} onClick={() => setType(t.category)}>{t.label}</button>)}
            </div>
          </Card>
          <Card className="lg:col-span-3" pad={false} title={view === 'domains' ? 'Most-cited websites' : 'Most-cited pages'}
            subtitle={view === 'domains' ? `"With ${own?.name}" = how many of those answers also mention ${own?.name}.` : 'Individual pages, most cited first.'}
            right={<Segmented size="sm" value={view} onChange={setView} options={[{ value: 'domains', label: 'Websites' }, { value: 'urls', label: 'Pages' }]} />}>
            <div className="max-h-[560px] overflow-auto px-2 pb-2">
              {view === 'domains' ? (
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface"><tr><th className="th">Website</th><th className="th">Type</th><th className="th">Cited in</th><th className="th">With {own?.name}</th></tr></thead>
                  <tbody>
                    {d.domains.filter(x => !type || x.category === type).map(x => {
                      const ownShare = x.answers ? Math.round((100 * x.with_own) / x.answers) : 0;
                      return (
                        <tr key={x.domain}>
                          <td className="td"><a href={`https://${x.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{x.domain}<ExternalLink size={11} className="text-muted" /></a></td>
                          <td className="td"><Badge tone={TONE[x.category]}>{x.label}</Badge></td>
                          <td className="td"><div className="flex items-center gap-2"><span className="tnum w-12">{x.share}%</span><Bar value={x.share} /></div><div className="text-[11px] text-muted">{x.answers} answers</div></td>
                          <td className="td tnum"><span className={ownShare < 30 && !['own'].includes(x.category) ? 'text-bad font-medium' : ''}>{ownShare}%</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <ul>
                  {d.urls.filter(x => !type || x.category === type).map(u => (
                    <li key={u.url} className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-sm">
                      <div className="min-w-0"><a href={u.url} target="_blank" rel="noreferrer" className="block truncate hover:underline">{u.title || u.url}</a><div className="truncate text-xs text-muted">{u.url}</div></div>
                      <span className="tnum shrink-0 text-xs text-ink2">{u.n}×</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </>}
    </>
  );
}
