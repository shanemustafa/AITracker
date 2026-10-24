// Public website (marketing page). Shown at "/" to visitors who are not signed in, and at "/website" to everyone.
// Honest by design: no invented customers, quotes, logos or statistics. The product picture is a labelled illustration.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Eye, Trophy, Smile, Link2, MessageSquareText, Lightbulb, Check, ChevronDown, Globe2,
  ShieldCheck, Building2, Layers, Gamepad2, Menu, X, Send,
} from 'lucide-react';
import { api } from '../lib.js';
import { Logo, Aurora, EASE } from '../motion.jsx';
import { LegalLinks } from './Legal.jsx';

const ENGINES = [
  { name: 'ChatGPT', color: '#0a84ff' }, { name: 'Gemini', color: '#bf5af2' },
  { name: 'Perplexity', color: '#30d158' }, { name: 'Claude', color: '#ff9f0a' },
];

function Reveal({ children, delay = 0, className = '' }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

const Section = ({ id, children, className = '' }) => (
  <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6 ${className}`}>{children}</section>
);
const Heading = ({ eyebrow, title, sub }) => (
  <Reveal className="mx-auto mb-12 max-w-2xl text-center">
    <div className="eyebrow mb-3 text-accent">{eyebrow}</div>
    <h2 className="text-[32px] font-semibold leading-tight tracking-title sm:text-[44px]">{title}</h2>
    {sub && <p className="mt-4 text-[17px] leading-relaxed text-ink2">{sub}</p>}
  </Reveal>
);

export default function Home({ signedIn }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-page text-ink">
      <Header signedIn={signedIn} />
      <Hero />
      <Engines />
      <Shift />
      <Features />
      <HowItWorks />
      <Industries />
      <Faq />
      <Contact />
      <Footer signedIn={signedIn} />
    </div>
  );
}

function Header({ signedIn }) {
  const [open, setOpen] = useState(false);
  const links = [['#features', 'Features'], ['#how', 'How it works'], ['#industries', 'Industries'], ['#faq', 'FAQ']];
  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-title"><Logo size={28} />Housedge</a>
        <nav className="hidden items-center gap-7 text-[13px] text-ink2 md:flex">
          {links.map(([h, l]) => <a key={h} href={h} className="transition-colors hover:text-ink">{l}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link to={signedIn ? '/' : '/login'} className="btn-ghost btn-sm">{signedIn ? 'Open the app' : 'Sign in'}</Link>
          <a href="#contact" className="btn-primary btn-sm">Request a check</a>
        </div>
        <button className="btn-ghost btn-sm md:hidden" onClick={() => setOpen(o => !o)} aria-label="Menu">{open ? <X size={16} /> : <Menu size={16} />}</button>
      </div>
      {open && (
        <div className="border-t border-line px-4 pb-4 md:hidden">
          {links.map(([h, l]) => <a key={h} href={h} onClick={() => setOpen(false)} className="block py-2.5 text-[15px]">{l}</a>)}
          <div className="mt-2 flex gap-2">
            <Link to={signedIn ? '/' : '/login'} className="btn-ghost flex-1">{signedIn ? 'Open the app' : 'Sign in'}</Link>
            <a href="#contact" onClick={() => setOpen(false)} className="btn-primary flex-1">Request a check</a>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <div id="top" className="relative">
      <Aurora />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-48" style={{ background: 'linear-gradient(to bottom, transparent, var(--page))' }} />
      <Section className="relative pb-20 pt-16 text-center sm:pt-24">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink2 shadow-thumb">
            <span className="flex -space-x-1">{ENGINES.map(e => <span key={e.name} className="h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)]" style={{ background: e.color }} />)}</span>
            For brands of every size, with a specialty in iGaming
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-[40px] font-semibold leading-[1.05] tracking-title sm:text-[64px] lg:text-[76px]">
            See what AI tells your customers about{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(100deg, #0a84ff, #bf5af2 55%, #ff9f0a)' }}>your brand.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-ink2 sm:text-[19px]">
            People now ask ChatGPT, Gemini, Perplexity and Claude what to buy and who to trust. We track those answers in every market you care about,
            show how you compare with competitors, and tell you what to improve, with the evidence.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <a href="#contact" className="btn-primary px-6 py-3 text-[15px]">Request an AI visibility check <ArrowRight size={16} /></a>
            <a href="#how" className="btn-ghost px-6 py-3 text-[15px]">See how it works</a>
          </div>
        </motion.div>
        <motion.div className="mt-16" initial={{ opacity: 0, y: 40, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}>
          <ProductPicture />
        </motion.div>
      </Section>
    </div>
  );
}

// An illustration of the product, with made-up sample brands so nobody mistakes it for real results.
function ProductPicture() {
  const bars = [['Your brand', 64, '#0a84ff'], ['Competitor A', 58, '#bf5af2'], ['Competitor B', 41, '#30d158'], ['Competitor C', 27, '#ff9f0a']];
  const line = (d, w) => <motion.div className="h-2.5 rounded-full bg-fill" style={{ width: w }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: d }} />;
  return (
    <div className="mx-auto max-w-5xl text-left">
      <div className="card overflow-hidden shadow-lift">
        <div className="flex items-center gap-1.5 border-b border-line bg-raised px-4 py-3">
          {['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />)}
          <span className="ml-3 text-xs text-muted">Housedge · Finland · last 30 days</span>
        </div>
        <div className="grid gap-0 md:grid-cols-[1.1fr_1fr]">
          <div className="border-b border-line p-5 sm:p-7 md:border-b-0 md:border-r">
            <div className="mb-4 flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ background: '#0a84ff' }} />ChatGPT answer</div>
            <motion.div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-[14px] text-white"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
              What is the best accounting software for a small business in Finland?
            </motion.div>
            <div className="mt-4 rounded-2xl rounded-bl-md bg-raised p-4 text-[14px] leading-relaxed">
              {[['Competitor A', '#bf5af2', 'many integrations, popular with accountants.'], ['Your brand', '#0a84ff', 'easy to use, strong local support.'], ['Competitor B', '#30d158', 'low starting price.']].map(([b, c, t], i) => (
                <motion.p key={b} className="mb-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 + i * 0.35 }}>
                  {i + 1}. <mark className="brand" style={{ borderColor: c }}>{b}</mark> — {t}
                </motion.p>
              ))}
              <div className="mt-3 grid gap-2">{line(2.3, '92%')}{line(2.45, '70%')}</div>
              <motion.div className="mt-4 flex flex-wrap gap-1.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }}>
                {['review site', 'forum', 'news'].map(s => <span key={s} className="chip"><Link2 size={11} />{s}</span>)}
              </motion.div>
            </div>
          </div>
          <div className="p-5 sm:p-7">
            <div className="grid grid-cols-3 gap-2">
              {[['Visibility', '64%'], ['Position', '#2'], ['Sentiment', '72']].map(([k, v], i) => (
                <motion.div key={k} className="rounded-xl bg-raised p-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + i * 0.1 }}>
                  <div className="text-[11px] text-muted">{k}</div><div className="tnum text-[22px] font-semibold tracking-title">{v}</div>
                </motion.div>
              ))}
            </div>
            <div className="mb-3 mt-6 text-xs font-medium text-muted">Visibility vs competitors</div>
            <div className="grid gap-3">
              {bars.map(([n, v, c], i) => (
                <div key={n} className="grid grid-cols-[96px_1fr_36px] items-center gap-3 text-[13px]">
                  <span className={i === 0 ? 'font-semibold' : 'text-ink2'}>{n}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-fill">
                    <motion.div className="h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 1.1, ease: EASE, delay: 1 + i * 0.12 }} />
                  </div>
                  <span className="tnum text-right text-ink2">{v}%</span>
                </div>
              ))}
            </div>
            <motion.div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line p-3 text-[13px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 }}>
              <Lightbulb size={16} className="mt-0.5 shrink-0" style={{ color: '#ff9f0a' }} />
              <span><strong>Suggested action:</strong> <span className="text-ink2">AI often cites a review site that doesn't list you. Ask them to review you.</span></span>
            </motion.div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Illustration with sample data. Brand names are placeholders.</p>
    </div>
  );
}

function Engines() {
  return (
    <Section className="pb-24">
      <Reveal className="flex flex-col items-center gap-5">
        <div className="text-[13px] text-muted">Tracks answers from the AI assistants your customers use</div>
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-4">
          {ENGINES.map(e => (
            <span key={e.name} className="flex items-center gap-2.5 text-[20px] font-semibold tracking-title text-ink2">
              <span className="h-3 w-3 rounded-full" style={{ background: e.color }} />{e.name}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

function Shift() {
  const steps = [
    ['A customer asks', '"What is the best project management tool for a small team?" or "Which online casino in Finland pays out fastest?"'],
    ['AI gives a shortlist', 'Instead of ten blue links, the assistant names a few brands and explains why, often quoting review sites and forums.'],
    ['You are in it, or not', 'If AI leaves you out, or describes you wrongly, you lose that customer before they ever reach your site.'],
  ];
  return (
    <Section className="pb-28">
      <Heading eyebrow="Why it matters" title="The new front page is an AI answer." sub="More and more people ask an AI assistant instead of searching. Those answers decide which brands customers even consider." />
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map(([t, d], i) => (
          <Reveal key={t} delay={i * 0.1} className="card p-7">
            <div className="mb-5 grid h-9 w-9 place-items-center rounded-full bg-accentSoft text-[15px] font-semibold text-accent">{i + 1}</div>
            <h3 className="text-[19px] font-semibold tracking-title">{t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink2">{d}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function Features() {
  const items = [
    { icon: Eye, t: 'Visibility', d: 'How often AI mentions your brand when customers ask about your category, per market and per AI assistant.', c: '#0a84ff' },
    { icon: Trophy, t: 'Position & share of voice', d: 'Whether you are named first or last, and your share of all brand mentions compared with each competitor.', c: '#bf5af2' },
    { icon: Smile, t: 'Sentiment', d: 'The tone AI uses when it talks about you. Spot negative descriptions early.', c: '#30d158' },
    { icon: Link2, t: 'Sources AI trusts', d: 'Which review sites, forums, news and regulators AI quotes, so you know where to show up.', c: '#ff9f0a' },
    { icon: MessageSquareText, t: 'The real answers', d: 'Read every answer in full, with your brand and competitors highlighted. No black box.', c: '#0a84ff' },
    { icon: Lightbulb, t: 'Suggested actions', d: 'Plain-English recommendations, most important first, each backed by the answers that triggered it.', c: '#bf5af2' },
  ];
  return (
    <Section id="features" className="pb-28">
      <Heading eyebrow="What you get" title="Everything AI says about you, measured." sub="Clear numbers you can track month after month, and the evidence behind every number." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((f, i) => (
          <Reveal key={f.t} delay={(i % 3) * 0.08} className="card group p-7 transition-transform duration-300 hover:-translate-y-1">
            <span className="grid h-11 w-11 place-items-center rounded-2xl text-white shadow-thumb transition-transform duration-300 group-hover:scale-110" style={{ background: f.c }}><f.icon size={20} /></span>
            <h3 className="mt-5 text-[19px] font-semibold tracking-title">{f.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink2">{f.d}</p>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="card p-7">
          <h3 className="text-[19px] font-semibold tracking-title">Reports your team will read</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink2">A first "where you stand" report, then monthly progress reports. Print them to PDF, or export the data to CSV, Google Sheets or Looker Studio.</p>
        </div>
        <div className="card p-7">
          <h3 className="text-[19px] font-semibold tracking-title">Checked automatically</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-ink2">Your questions are asked again on a schedule, so you see trends instead of one-off screenshots. Costs stay under a fixed monthly cap.</p>
        </div>
      </Reveal>
    </Section>
  );
}

function HowItWorks() {
  const steps = [
    ['Discovery call', 'We learn your brand, markets and main competitors.'],
    ['Setup', 'We pick the questions real customers ask in each market and language.'],
    ['First report', 'You see where you stand today against your competitors, in every AI assistant.'],
    ['Actions', 'You get a prioritised list of honest improvements, each with its evidence.'],
    ['Ongoing tracking', 'Answers are re-checked on schedule, and a monthly report shows what changed.'],
  ];
  return (
    <div className="border-y border-line bg-surface py-28">
      <Section id="how">
        <Heading eyebrow="How it works" title="From first call to monthly tracking." />
        <ol className="relative mx-auto grid max-w-5xl gap-6 md:grid-cols-5">
          <div aria-hidden className="absolute left-0 right-0 top-5 hidden h-px bg-line md:block" />
          {steps.map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.1} className="relative">
              <li className="flex gap-4 md:block">
                <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-semibold text-white shadow-thumb">{i + 1}</span>
                <div className="md:mt-5">
                  <h3 className="text-[17px] font-semibold tracking-title">{t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink2">{d}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function Industries() {
  const who = [
    [Building2, 'Consumer brands', 'Shops, apps and services that want to be recommended when people ask AI what to buy or use.'],
    [Layers, 'B2B & software', 'Companies that want to be on the shortlist when buyers ask AI for a supplier or tool.'],
    [Gamepad2, 'iGaming (our specialty)', 'Operators, platforms and game studios, with ready-made questions per market and advice that respects gambling advertising rules.'],
  ];
  const markets = [['🇫🇮', 'Finland'], ['🇸🇪', 'Sweden'], ['🇬🇧', 'United Kingdom'], ['🇩🇪', 'Germany'], ['🌍', 'Global']];
  return (
    <Section id="industries" className="py-28">
      <Heading eyebrow="Who it's for" title="Made for how your industry works." sub="Questions written the way your customers ask, in their market and language, with advice that respects the advertising rules of your industry." />
      <div className="grid gap-4 md:grid-cols-3">
        {who.map(([I, t, d], i) => (
          <Reveal key={t} delay={i * 0.08} className="card p-7">
            <I size={22} className="text-accent" />
            <h3 className="mt-4 text-[19px] font-semibold tracking-title">{t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink2">{d}</p>
          </Reveal>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Reveal className="card p-7">
          <div className="flex items-center gap-2 text-[19px] font-semibold tracking-title"><Globe2 size={20} className="text-accent" />Markets</div>
          <p className="mt-2 text-[15px] text-ink2">Questions are asked as a customer in that country would ask them, in their language.</p>
          <div className="mt-5 flex flex-wrap gap-2">{markets.map(([f, m]) => <span key={m} className="chip text-[13px]"><span aria-hidden>{f}</span>{m}</span>)}</div>
          <p className="mt-3 text-xs text-muted">Other markets on request.</p>
        </Reveal>
        <Reveal className="card p-7" delay={0.08}>
          <div className="flex items-center gap-2 text-[19px] font-semibold tracking-title"><ShieldCheck size={20} className="text-accent" />We measure. We never manipulate.</div>
          <ul className="mt-4 grid gap-2.5 text-[15px] text-ink2">
            {['Answers come only through the AI companies’ official APIs, never by scraping.', 'No fake reviews, fake posts or tricks to game AI answers.', 'Recommendations follow the advertising rules of your industry and market.', 'No promises of rankings: nobody can guarantee what an AI will say.'].map(t => (
              <li key={t} className="flex gap-2.5"><Check size={17} className="mt-0.5 shrink-0" style={{ color: '#30d158' }} />{t}</li>
            ))}
          </ul>
        </Reveal>
      </div>
    </Section>
  );
}

function Faq() {
  const qs = [
    ['What is "AI visibility"?', 'It is how often, how prominently and how positively AI assistants mention your brand when people ask questions about your category. Think of it as search rankings for AI answers.'],
    ['Which AI assistants do you track?', 'ChatGPT, Gemini, Perplexity and Claude, through each company’s official API, with web search switched on so answers reflect current information.'],
    ['What about Google AI Overviews and Microsoft Copilot?', 'They have no official way to collect their answers. The only way would be scraping, which breaks their terms, so we don’t track them. We would rather tell you than fake it.'],
    ['Are these the exact answers a customer sees?', 'They come from the same AI models, asked the same way, but an individual’s app can personalise answers. That is why we track many questions over time and look at trends, not single answers.'],
    ['Can you guarantee we will rank higher?', 'No, and you should be careful with anyone who does. We show you where you stand and what honest actions are most likely to help, then measure whether things change.'],
    ['Which markets and languages?', 'Finland, Sweden, the United Kingdom, Germany and global English out of the box. Other markets can be added.'],
    ['How do we get started?', 'Send the form below. We’ll set up a call to understand your brand and competitors, then run a first check.'],
  ];
  const [open, setOpen] = useState(0);
  return (
    <Section id="faq" className="pb-28">
      <Heading eyebrow="FAQ" title="Questions, answered honestly." />
      <div className="mx-auto max-w-3xl divide-y divide-[var(--line)] border-y border-line">
        {qs.map(([q, a], i) => (
          <div key={q}>
            <button className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] font-medium" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              {q}<ChevronDown size={18} className={`shrink-0 text-muted transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
            </button>
            <motion.div initial={false} animate={{ height: open === i ? 'auto' : 0, opacity: open === i ? 1 : 0 }} transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden">
              <p className="pb-5 text-[15px] leading-relaxed text-ink2">{a}</p>
            </motion.div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Contact() {
  const [f, setF] = useState({ name: '', email: '', company: '', role: '', markets: '', message: '', consent: false, website: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async e => {
    e.preventDefault();
    setState({ busy: true, done: false, error: '' });
    try { await api('/enquiries/new', { method: 'POST', body: f }); setState({ busy: false, done: true, error: '' }); }
    catch (err) { setState({ busy: false, done: false, error: err.message }); }
  };
  return (
    <div className="relative overflow-hidden border-t border-line bg-surface py-28">
      <Section id="contact" className="relative">
        <div className="grid gap-12 lg:grid-cols-2">
          <Reveal>
            <div className="eyebrow mb-3 text-accent">Get started</div>
            <h2 className="text-[32px] font-semibold leading-tight tracking-title sm:text-[44px]">Find out what AI says about you.</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink2">Tell us about your brand and markets. We’ll get back to you to arrange a short call and a first AI visibility check.</p>
            <ul className="mt-8 grid gap-3 text-[15px] text-ink2">
              {['Your brand compared with your main competitors', 'Answers from four AI assistants, in your markets', 'The first actions worth taking'].map(t => (
                <li key={t} className="flex gap-2.5"><Check size={17} className="mt-0.5 shrink-0 text-accent" />{t}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            {state.done ? (
              <div className="card grid min-h-[420px] place-items-center p-8 text-center">
                <div>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }} className="mx-auto grid h-14 w-14 place-items-center rounded-full text-white" style={{ background: '#30d158' }}><Check size={28} /></motion.div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-title">Thank you, {f.name.split(' ')[0]}.</h3>
                  <p className="mt-2 text-ink2">We’ve received your message and will get back to you at {f.email}.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="card grid gap-4 p-6 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label className="label" htmlFor="c-name">Your name</label><input id="c-name" className="input" required value={f.name} onChange={set('name')} autoComplete="name" /></div>
                  <div><label className="label" htmlFor="c-email">Work email</label><input id="c-email" type="email" className="input" required value={f.email} onChange={set('email')} autoComplete="email" /></div>
                  <div><label className="label" htmlFor="c-company">Company</label><input id="c-company" className="input" required value={f.company} onChange={set('company')} autoComplete="organization" /></div>
                  <div><label className="label" htmlFor="c-role">You are</label>
                    <select id="c-role" className="input" value={f.role} onChange={set('role')}>
                      <option value="">Choose…</option>
                      {['Brand / company', 'Agency', 'iGaming operator', 'iGaming supplier', 'Other'].map(r => <option key={r}>{r}</option>)}
                    </select></div>
                </div>
                <div><label className="label" htmlFor="c-markets">Markets you care about</label><input id="c-markets" className="input" placeholder="e.g. Finland, Sweden" value={f.markets} onChange={set('markets')} /></div>
                <div><label className="label" htmlFor="c-msg">Anything else? (optional)</label><textarea id="c-msg" rows={3} className="input" value={f.message} onChange={set('message')} /></div>
                {/* Hidden from people; bots fill it in and get ignored. */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
                <label className="flex items-start gap-2.5 text-[13px] text-ink2">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={f.consent} onChange={set('consent')} required />
                  <span>I agree that you store these details to answer my enquiry, as described in the <Link to="/privacy" className="text-accent underline">privacy policy</Link>.</span>
                </label>
                {state.error && <div className="rounded-xl bg-badSoft px-3 py-2 text-[13px] text-bad">{state.error}</div>}
                <button className="btn-primary py-3 text-[15px]" disabled={state.busy}>{state.busy ? 'Sending…' : <>Send <Send size={15} /></>}</button>
              </form>
            )}
          </Reveal>
        </div>
      </Section>
    </div>
  );
}

function Footer({ signedIn }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5 text-[13px] text-ink2"><Logo size={22} /><span><strong className="text-ink">Housedge.</strong> Give your brand the house edge in AI answers.</span></div>
        <div className="flex items-center gap-4 text-[13px]">
          <Link to={signedIn ? '/' : '/login'} className="text-ink2 hover:text-ink">{signedIn ? 'Open the app' : 'Sign in'}</Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 sm:px-6"><LegalLinks /></div>
    </footer>
  );
}
