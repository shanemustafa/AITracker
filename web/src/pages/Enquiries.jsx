// Messages sent from the website's contact form.
import { Link } from 'react-router-dom';
import { Mail, Trash2, Plus, Globe } from 'lucide-react';
import { useApi, api, fmtDate } from '../lib.js';
import { useUser } from '../ctx.js';
import { PageHeader, Spinner, ErrorBox, Badge, Empty, Segmented, useToast } from '../ui.jsx';
import { stagger } from '../motion.jsx';

const STATUS = [{ value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' }, { value: 'won', label: 'Became client' }, { value: 'closed', label: 'Closed' }];

export default function Enquiries() {
  const list = useApi('/enquiries');
  const user = useUser();
  const toast = useToast();
  const setStatus = async (e, status) => { await api(`/enquiries/${e.id}`, { method: 'PATCH', body: { status } }); list.reload(); };
  const remove = async e => {
    if (!confirm(`Delete the enquiry from ${e.name} (${e.company})? This cannot be undone.`)) return;
    await api(`/enquiries/${e.id}`, { method: 'DELETE' }); toast('Enquiry deleted'); list.reload();
  };
  if (list.error) return <ErrorBox error={list.error} />;
  if (!list.data) return <Spinner />;
  return (
    <>
      <PageHeader title="Enquiries" subtitle="Messages sent through the contact form on your website."
        right={<Link to="/website" className="btn-ghost"><Globe size={15} />View website</Link>} />
      {!list.data.length ? <Empty art title="No enquiries yet">When someone fills in the form on your website, it shows up here.</Empty> : (
        <div className="grid gap-3">
          {list.data.map((e, i) => (
            <article key={e.id} className="card rise p-5" style={stagger(i)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[17px] font-semibold tracking-title">{e.company}</h3>
                    {e.role && <Badge>{e.role}</Badge>}
                    {e.status === 'new' && <Badge tone="accent">New</Badge>}
                  </div>
                  <div className="mt-1 text-[13px] text-ink2">{e.name} · <a className="text-accent hover:underline" href={`mailto:${e.email}`}>{e.email}</a> · {fmtDate(e.created_at)}</div>
                </div>
                <Segmented size="sm" value={e.status} onChange={s => setStatus(e, s)} options={STATUS} />
              </div>
              {e.markets && <div className="mt-3 text-[13px]"><span className="text-muted">Markets: </span>{e.markets}</div>}
              {e.message && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-raised p-3 text-[14px] text-ink2">{e.message}</p>}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                <a className="btn-primary btn-sm" href={`mailto:${e.email}?subject=${encodeURIComponent('Your AI visibility check')}`}><Mail size={13} />Reply by email</a>
                <Link className="btn-ghost btn-sm" to="/new"><Plus size={13} />Set up as client</Link>
                {user?.role === 'admin' && <button className="btn-ghost btn-sm" onClick={() => remove(e)}><Trash2 size={13} />Delete</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
