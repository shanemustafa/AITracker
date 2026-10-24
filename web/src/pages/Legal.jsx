import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, fmtDate } from '../lib.js';

// Shared footer links (sign-in page, menu, legal pages).
export function LegalLinks({ className = '' }) {
  const [c, setC] = useState(null);
  useEffect(() => { api('/legal').then(d => setC(d.company)).catch(() => {}); }, []);
  return (
    <div className={`text-[11px] text-muted ${className}`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <Link to="/privacy" className="hover:text-ink hover:underline">Privacy</Link>
        <Link to="/terms" className="hover:text-ink hover:underline">Terms</Link>
        <Link to="/legal" className="hover:text-ink hover:underline">Legal notice</Link>
      </div>
      <div className="mt-1">© {new Date().getFullYear()} {c?.name || 'Housedge'}</div>
    </div>
  );
}

function useLegal() {
  const [d, setD] = useState(null);
  useEffect(() => { api('/legal').then(setD).catch(() => setD({ company: {}, updated: '' })); }, []);
  return d;
}

// Shows the saved company detail, or a clearly marked gap to fill in.
const F = ({ v, label }) => v ? <>{v}</> : <mark className="rounded bg-warnBg px-1 text-warnInk" title="Add this in Settings → Company & legal">[{label}]</mark>;

function Page({ title, children, d }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen bg-page">
      <header className="glass sticky top-0 z-10" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link to="/" className="inline-flex items-center gap-2 text-[13px] text-ink2 hover:text-ink"><ArrowLeft size={14} />Housedge</Link>
          <nav className="flex gap-1 text-[13px]">
            {[['/privacy', 'Privacy'], ['/terms', 'Terms'], ['/legal', 'Legal notice']].map(([to, l]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `rounded-full px-3 py-1 ${isActive ? 'bg-fill font-semibold text-ink' : 'text-ink2 hover:text-ink'}`}>{l}</NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10" key={loc.pathname}>
        <h1 className="text-[34px] font-bold tracking-display">{title}</h1>
        {d?.updated && <p className="mt-2 text-sm text-muted">Last updated {fmtDate(d.updated)}</p>}
        <article className="legal card rise mt-8 p-7 md:p-10">{d ? children : <p className="text-muted">Loading…</p>}</article>
        <p className="mt-6 text-center text-xs text-muted">© {new Date().getFullYear()} {d?.company?.name || 'Housedge'}</p>
      </main>
    </div>
  );
}

export function Privacy() {
  const d = useLegal();
  const c = d?.company || {};
  return (
    <Page title="Privacy policy" d={d}>
      <p>This policy explains what personal data <strong><F v={c.name} label="Company name" /></strong> ("we") handles in Housedge (the "Service"), why, and what your rights are. The Service is a business tool that measures how AI assistants describe companies and brands. This policy also covers our public website and its contact form.</p>

      <h2>1. Who is responsible</h2>
      <p>The data controller is <F v={c.name} label="Company name" />, business ID <F v={c.businessId} label="Business ID (Y-tunnus)" />, <F v={c.address} label="Street address, postcode and city" />, <F v={c.country} label="Country" />. Contact us about privacy at <F v={c.email} label="Contact email" />.</p>

      <h2>2. What data we handle</h2>
      <ul>
        <li><strong>Account details:</strong> name, email address, role (admin or member) and your password, which we store only in a scrambled (hashed) form that cannot be turned back into the password.</li>
        <li><strong>Website enquiries:</strong> if you use the contact form on our website, the name, work email, company, role, markets and message you send us.</li>
        <li><strong>Sign-in cookie:</strong> one cookie that keeps you signed in (see section 7).</li>
        <li><strong>Work content you enter:</strong> client project names, discovery notes, activities, fees and comments. These may contain names or job titles of business contacts if you type them in.</li>
        <li><strong>Technical logs:</strong> our hosting provider records technical information such as IP addresses and request times to run and protect the Service.</li>
        <li><strong>AI questions and answers:</strong> the questions the Service asks AI assistants and their answers. These are about companies and brands, not people. Please do not put personal data into tracked questions.</li>
      </ul>

      <h2>3. Why we use it, and on what legal basis</h2>
      <ul>
        <li>To provide the Service to you and your organisation — performance of a contract (GDPR Art. 6(1)(b)).</li>
        <li>To answer enquiries sent through our website and discuss a possible agreement with you: steps taken at your request before a contract (Art. 6(1)(b)) and our legitimate interest in replying to business enquiries (Art. 6(1)(f)).</li>
        <li>To keep the Service secure, prevent misuse and fix problems — our legitimate interest (Art. 6(1)(f)).</li>
        <li>To keep records the law requires, such as accounting records — legal obligation (Art. 6(1)(c)).</li>
      </ul>
      <p>We do not sell personal data, do not use it for advertising and do not make automated decisions about people.</p>

      <h2>4. Who else handles data for us</h2>
      <p>We use these service providers ("processors"). They may only use the data to provide their service to us.</p>
      <ul>
        <li><strong>Railway Corporation</strong> — hosting of the Service and its database. Servers are located in: <strong>{d?.hostingRegion || 'United States'}</strong>.</li>
        <li><strong>OpenAI, Google, Perplexity and Anthropic</strong> — only when AI engines are switched on. They receive the tracked questions (about brands) and return answers. Account details are never sent to them.</li>
      </ul>
      <p>Where data is processed outside the EU/EEA, the transfer is protected by the European Commission's Standard Contractual Clauses and/or the EU–US Data Privacy Framework, as offered by the provider.</p>

      <h2>5. How long we keep data</h2>
      <ul>
        <li>Account details: while the account exists. An admin can remove a user at any time; the details are then deleted from the live database straight away.</li>
        <li>Work content: while your organisation uses the Service, and up to 90 days after it stops, unless you ask us to delete it sooner.</li>
        <li>Website enquiries: up to 12 months after our last contact, unless you become a client or ask us to delete them sooner.</li>
        <li>Backups: the Service keeps rolling backups (normally the 20 most recent, about three weeks). Deleted data disappears from backups as they are replaced.</li>
        <li>Technical logs: as long as the hosting provider keeps them, normally a few weeks.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>You can ask to see the data we hold about you, correct it, delete it, restrict or object to its use, and receive it in a portable format. Email <F v={c.email} label="Contact email" />; we answer within one month. You can also complain to the Finnish Data Protection Ombudsman (<a href="https://tietosuoja.fi/en" target="_blank" rel="noreferrer">tietosuoja.fi</a>) or the authority in your own EU country.</p>

      <h2>7. Cookies</h2>
      <p>The Service uses <strong>one strictly necessary cookie</strong>, called <code>sid</code>, which keeps you signed in for up to 30 days. It is required for the Service to work, so no consent banner is needed. We use <strong>no</strong> analytics, advertising or tracking cookies, and load no third-party fonts or scripts. Your light/dark display choice is stored only in your own browser.</p>

      <h2>8. Security</h2>
      <p>All traffic is encrypted (HTTPS). Passwords are hashed. App pages require a sign-in, settings can only be changed by admins, and data is backed up daily. AI provider keys are stored on the server and never shown in full.</p>

      <h2>9. Changes</h2>
      <p>If we change this policy, we update the date at the top. Important changes will be announced in the Service.</p>
    </Page>
  );
}

export function Terms() {
  const d = useLegal();
  const c = d?.company || {};
  return (
    <Page title="Terms of use" d={d}>
      <p>These terms apply to Housedge (the "Service"), provided by <strong><F v={c.name} label="Company name" /></strong> (business ID <F v={c.businessId} label="Business ID (Y-tunnus)" />). By signing in you accept them on behalf of yourself and the organisation that gave you access.</p>

      <h2>1. What the Service does</h2>
      <p>The Service asks AI assistants questions through their official programming interfaces (APIs), records the answers, and turns them into measurements, reports and suggested actions. <strong>It measures and advises only.</strong> It does not try to influence what AI assistants say, and it does not publish reviews, posts or any other content.</p>

      <h2>2. No guarantees about AI answers</h2>
      <ul>
        <li>AI answers are produced by third parties, change over time and may be inaccurate. Answers received through APIs can differ from what an individual person sees in a consumer app.</li>
        <li>Figures such as visibility, position and tone are estimates based on the answers collected. Tone is scored automatically and is a rough guide.</li>
        <li>Suggested actions are ideas, not promises. Nobody can guarantee how an AI assistant will answer.</li>
        <li>Data marked <strong>"Simulated"</strong> is made-up demo data and must never be presented as real results.</li>
      </ul>

      <h2>3. Accounts</h2>
      <p>Keep your password secret and do not share accounts. Admins are responsible for who they invite and should remove people who no longer need access. Tell us at <F v={c.email} label="Contact email" /> if you suspect misuse.</p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Use the Service lawfully, including data-protection, consumer-protection and advertising law, and any industry-specific marketing rules (for example gambling-advertising rules) in each market you work in.</li>
        <li>Act honestly on the results: no fake reviews, no posing as customers, no hidden paid placements, and no marketing to minors or vulnerable people.</li>
        <li>Do not put personal data into tracked questions, try to break or overload the Service, or access accounts that are not yours.</li>
        <li>Follow the terms of the AI providers whose engines you connect.</li>
      </ul>

      <h2>5. AI providers and costs</h2>
      <p>If you connect your own AI provider accounts, those providers bill you directly under their terms. The Service's cost estimates and monthly spending cap are helpful estimates, not guarantees; also set spending limits in each provider's own billing settings.</p>

      <h2>6. Your content and ours</h2>
      <p>You keep the rights to the content you add (notes, questions, client details). We may process it only to provide the Service. The Service's software, design and reports layout remain ours. You may use the reports the Service produces in your own business, including sharing them with your clients.</p>

      <h2>7. Confidentiality</h2>
      <p>We treat your projects and client information as confidential and do not share them, except with the service providers listed in the Privacy policy or where the law requires it.</p>

      <h2>8. Availability and liability</h2>
      <p>We aim to keep the Service available and accurate, but it is provided "as is". To the extent the law allows, we are not liable for indirect losses, lost profits, or decisions made using AI answers or reports. Nothing in these terms limits liability that cannot be limited by law.</p>

      <h2>9. Ending use</h2>
      <p>You can stop using the Service at any time. We may suspend accounts that break these terms. Data is then handled as described in the Privacy policy.</p>

      <h2>10. Law and disputes</h2>
      <p>These terms are governed by the laws of <F v={c.country} label="Country" />. Disputes are settled first by negotiation, then by the competent court of the provider's home town, unless mandatory law says otherwise.</p>

      <h2>11. Contact</h2>
      <p><F v={c.name} label="Company name" />, <F v={c.address} label="Street address, postcode and city" />, <F v={c.email} label="Contact email" />.</p>
    </Page>
  );
}

export function LegalNotice() {
  const d = useLegal();
  const c = d?.company || {};
  const rows = [
    ['Service', 'Housedge'], ['Provided by', <F key="n" v={c.name} label="Company name" />],
    ['Business ID', <F key="b" v={c.businessId} label="Business ID (Y-tunnus)" />], ['VAT number', c.vatId || '—'],
    ['Address', <F key="a" v={c.address} label="Street address, postcode and city" />], ['Country', <F key="c" v={c.country} label="Country" />],
    ['Email', <F key="e" v={c.email} label="Contact email" />], ['Phone', c.phone || '—'], ['Website', c.website || '—'],
    ['Responsible person', c.representative || '—'],
    ['Hosting', `Railway Corporation (servers: ${d?.hostingRegion || 'United States'})`],
  ];
  return (
    <Page title="Legal notice" d={d}>
      <p>Information about the provider of this service, as required for online services in Finland and the EU.</p>
      <dl className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-sm text-muted">{k}</dt><dd className="text-[15px]">{v}</dd></div>)}
      </dl>
      <h2>About this service</h2>
      <p>Housedge measures how AI assistants describe brands, using official APIs only. It does not influence AI answers or publish content. See the <Link to="/terms">Terms of use</Link> and the <Link to="/privacy">Privacy policy</Link>.</p>
    </Page>
  );
}
