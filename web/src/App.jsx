import { useEffect, useRef, useState } from 'react';
import { MetaCtx, useMeta, ProjectCtx, UserCtx } from './ctx.js';
import { motion } from 'framer-motion';
import { Logo, PageIn, Skeleton } from './motion.jsx';
import { Routes, Route, Navigate, NavLink, Outlet, useNavigate, useParams, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquareText, Link2, Users, ListChecks, FileText, Settings, Plus, FolderKanban,
  Sun, Moon, Monitor, LogOut, Play, Loader2, Download, Route as RouteIcon, ClipboardList, Lightbulb, Menu, X,
} from 'lucide-react';
import { api, useApi, setTheme, useDark, useFilters, fmtDate, PREVIEW } from './lib.js';
import { Spinner, SimBadge, Badge, ErrorBox, useToast, Segmented } from './ui.jsx';
import { Login, Setup, Invite, Reset } from './pages/Auth.jsx';
import { Privacy, Terms, LegalNotice, LegalLinks } from './pages/Legal.jsx';
import Projects from './pages/Projects.jsx';
import Quickstart from './pages/Quickstart.jsx';
import Overview from './pages/Overview.jsx';
import Journey from './pages/Journey.jsx';
import Discovery from './pages/Discovery.jsx';
import Prompts from './pages/Prompts.jsx';
import Competitors from './pages/Competitors.jsx';
import Sources from './pages/Sources.jsx';
import Chats from './pages/Chats.jsx';
import Actions from './pages/Actions.jsx';
import Reports, { ReportView } from './pages/Reports.jsx';
import ProjectSettings from './pages/ProjectSettings.jsx';
import SettingsPage from './pages/Settings.jsx';


export default function App() {
  const [auth, setAuth] = useState(null);
  const loc = useLocation();
  useEffect(() => { api('/auth/state').then(setAuth).catch(() => setAuth({ user: null })); }, [loc.pathname === '/login']);
  if (!auth) return <Spinner />;
  return (
    <Routes>
      <Route path="/login" element={auth.needsSetup ? <Navigate to="/setup" /> : <Login />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/legal" element={<LegalNotice />} />
      <Route path="/setup" element={auth.needsSetup ? <Setup codeRequired={auth.setupCodeRequired} /> : <Navigate to="/login" />} />
      <Route path="/invite/:token" element={<Invite />} />
      <Route path="/p/:id/reports/:rid/print" element={auth.user ? <Authed user={auth.user} bare><ReportView print /></Authed> : <Navigate to="/login" />} />
      <Route path="*" element={auth.user ? <Authed user={auth.user} /> : <Navigate to={auth.needsSetup ? '/setup' : '/login'} />} />
    </Routes>
  );
}

function Authed({ user, bare, children }) {
  const meta = useApi('/meta');
  if (!meta.data) return meta.error ? <div className="p-8"><ErrorBox error={meta.error} /></div> : <Spinner />;
  return (
    <UserCtx.Provider value={user}>
      <MetaCtx.Provider value={{ ...meta.data, reload: meta.reload }}>
        {bare ? children : (
          <Routes>
            <Route element={<Shell user={user} />}>
              <Route path="/" element={<Projects />} />
              <Route path="/new" element={<Quickstart />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/p/:id" element={<ProjectLayout />}>
                <Route index element={<Navigate to="journey" replace />} />
                <Route path="journey" element={<Journey />} />
                <Route path="discovery" element={<Discovery />} />
                <Route path="overview" element={<Overview />} />
                <Route path="prompts" element={<Prompts />} />
                <Route path="competitors" element={<Competitors />} />
                <Route path="sources" element={<Sources />} />
                <Route path="chats" element={<Chats />} />
                <Route path="actions" element={<Actions />} />
                <Route path="reports" element={<Reports />} />
                <Route path="reports/:rid" element={<ReportView />} />
                <Route path="settings" element={<ProjectSettings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Route>
          </Routes>
        )}
      </MetaCtx.Provider>
    </UserCtx.Provider>
  );
}

function ThemeSwitch() {
  useDark();
  const t = document.documentElement.getAttribute('data-theme') || 'system';
  return (
    <Segmented size="sm" value={t} onChange={setTheme} options={[
      { value: 'light', label: <Sun size={13} aria-label="Light" /> },
      { value: 'system', label: <Monitor size={13} aria-label="Same as computer" /> },
      { value: 'dark', label: <Moon size={13} aria-label="Dark" /> },
    ]} />
  );
}

function Shell({ user }) {
  const meta = useMeta();
  const nav = useNavigate();
  const { id } = useParams();
  const projects = useApi('/projects');
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const pid = loc.pathname.match(/^\/p\/(\d+)/)?.[1];
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  const projectNav = pid ? [
    { to: `/p/${pid}/journey`, label: 'Client journey', icon: RouteIcon },
    { to: `/p/${pid}/overview`, label: 'Overview', icon: LayoutDashboard },
    { to: `/p/${pid}/actions`, label: 'Suggested actions', icon: Lightbulb },
    { to: `/p/${pid}/reports`, label: 'Reports', icon: FileText },
    { to: `/p/${pid}/prompts`, label: 'Questions', icon: ListChecks },
    { to: `/p/${pid}/competitors`, label: 'Competitors', icon: Users },
    { to: `/p/${pid}/sources`, label: 'Sources', icon: Link2 },
    { to: `/p/${pid}/chats`, label: 'Chats', icon: MessageSquareText },
    { to: `/p/${pid}/discovery`, label: 'Discovery notes', icon: ClipboardList },
    { to: `/p/${pid}/settings`, label: 'Project settings', icon: Settings },
  ] : [];

  const sidebar = (
    <div className="flex h-full flex-col gap-5 px-3 py-5">
      <Link to="/" className="flex items-center gap-2.5 px-2">
        <Logo size={32} />
        <span className="text-[15px] font-semibold tracking-title">AI Answer Tracker</span>
      </Link>
      {meta.mode === 'demo' ? <Link to="/settings" className="mx-1"><Badge tone="warn" className="w-full justify-center py-1.5">Demo mode · simulated answers</Badge></Link>
        : <Badge tone="good" className="mx-1 justify-center py-1.5">Live mode · real AI answers</Badge>}
      <div className="px-1">
        <label className="label" htmlFor="proj">Project</label>
        <select id="proj" className="input py-2 text-[13px] font-medium" value={pid || ''} onChange={e => e.target.value && nav(`/p/${e.target.value}/journey`)}>
          <option value="">All projects…</option>
          {projects.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <nav className="flex flex-col gap-0.5">
        {projectNav.map(n => <NavItem key={n.to} {...n} />)}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
        <NavItem to="/" end icon={FolderKanban} label="Clients" />
        <NavItem to="/new" icon={Plus} label="New client" />
        <NavItem to="/settings" icon={Settings} label="Settings" />
        <div className="mt-2 flex items-center justify-between px-1">
          <ThemeSwitch />
          <button onClick={logout} className="text-muted hover:text-ink" title={`Log out ${user.email}`} aria-label="Log out"><LogOut size={15} /></button>
        </div>
        <div className="truncate px-1 text-[11px] text-muted">{user.email}</div>
        <LegalLinks className="mt-2 px-1" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:flex">
      <aside className="glass no-print hidden md:block w-64 shrink-0 sticky top-0 h-screen overflow-y-auto" style={{ borderRight: '1px solid var(--line)' }}>{sidebar}</aside>
      <div className="glass no-print md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Logo size={24} />AI Answer Tracker</span>
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <aside className="relative h-full w-72 bg-surface shadow-lift" onClick={e => e.stopPropagation()}>
            <button className="absolute right-3 top-3" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10 print-full">
        {PREVIEW && <div className="no-print mx-auto mb-4 max-w-[1280px] rounded-2xl bg-accentSoft px-5 py-3 text-[13px] text-ink">
          <strong>Read-only preview.</strong> Click anything to look around. Saving, "Run now", downloads and some filters (country, tag, search) only work in the real app.</div>}
        <div className="mx-auto max-w-[1280px] print-full">
          <PageIn key={pid ? `p${pid}` : loc.pathname}><Outlet context={{ reloadProjects: projects.reload }} /></PageIn>
        </div>
      </main>
    </div>
  );
}

// Menu item; the grey highlight slides to the page you open.
function NavItem({ to, icon: Icon, label, end }) {
  return (
    <NavLink to={to} end={end} className="navlink relative">
      {({ isActive }) => <>
        {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-fill" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        <Icon size={15} className="relative" /><span className="relative">{label}</span>
      </>}
    </NavLink>
  );
}

function ProjectLayout() {
  const { id } = useParams();
  const loc = useLocation();
  const p = useApi(`/projects/${id}`, [id]);
  const toast = useToast();
  const [runId, setRunId] = useState(null);
  const [runState, setRunState] = useState(null);
  const [err, setErr] = useState(null);
  const [version, setVersion] = useState(0);
  const timer = useRef();

  useEffect(() => { if (p.data?.activeRun) setRunId(p.data.activeRun.id); }, [p.data?.activeRun?.id]);
  useEffect(() => {
    if (!runId) return;
    const poll = async () => {
      const r = await api(`/runs/${runId}`).catch(() => null);
      setRunState(r);
      if (r && r.status !== 'running') {
        setRunId(null);
        toast(r.status === 'done' ? `Check finished: ${r.done} answers collected.` : `Check finished with notes: ${r.message || r.status}`);
        p.reload(); setVersion(v => v + 1);
      } else timer.current = setTimeout(poll, 1500);
    };
    poll();
    return () => clearTimeout(timer.current);
  }, [runId]);

  if (!p.data) return p.error ? <ErrorBox error={p.error} /> : <Skeleton />;
  const project = p.data;
  const runNow = async () => {
    setErr(null);
    try { const r = await api(`/projects/${id}/run`, { method: 'POST' }); setRunId(r.runId); }
    catch (e) { setErr(e.message); }
  };
  const running = !!runId;

  return (
    <ProjectCtx.Provider value={{ project, reload: () => { p.reload(); setVersion(v => v + 1); }, refreshHeader: p.reload, version, running }}>
      <div className="no-print rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[22px] md:text-[26px] font-bold tracking-display">{project.name}</h1>
            {project.data_mode === 'live' ? <Badge tone="good">Live data</Badge> : <SimBadge />}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {project.brands.find(b => b.is_own)?.name} vs {project.brands.filter(b => !b.is_own).length} competitors · {project.promptCount} active questions ·
            {' '}last check {project.last_run_at ? fmtDate(project.last_run_at) : 'never'} · runs {({ daily: 'daily', every3: 'every 3 days', weekly: 'weekly', manual: 'only when you press Run' })[project.frequency]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu id={id} />
          <button className={`btn-primary ${running ? 'shimmer' : ''}`} onClick={runNow} disabled={running}>
            {running ? <><Loader2 size={15} className="animate-spin" />Checking… {runState ? `${runState.done}/${runState.total}` : ''}</> : <><Play size={15} />Run now</>}
          </button>
        </div>
      </div>
      {running && runState && (
        <div className="no-print mb-5 h-1 overflow-hidden rounded-full bg-fill">
          <div className="h-full bg-accent transition-all" style={{ width: `${runState.total ? (100 * (runState.done + runState.failed)) / runState.total : 5}%` }} />
        </div>
      )}
      {err && <div className="mb-4"><ErrorBox error={err} /></div>}
      {project.lastRun?.message && !running && project.lastRun.status !== 'done' && (
        <div className="mb-4"><ErrorBox error={`Last check (${fmtDate(project.lastRun.started_at)}): ${project.lastRun.message}`} /></div>
      )}
      <PageIn key={`${loc.pathname}-${version}`}><Outlet /></PageIn>
    </ProjectCtx.Provider>
  );
}

function ExportMenu({ id }) {
  const [open, setOpen] = useState(false);
  const { qs } = useFilters();
  const items = [
    ['summary', 'Headline numbers (CSV)'], ['daily', 'Daily trend (CSV)'], ['answers', 'All answers (CSV)'],
    ['sources', 'Sources (CSV)'], ['prompts', 'Questions (CSV)'],
  ];
  return (
    <div className="relative">
      <button className="btn-ghost" onClick={() => setOpen(o => !o)} aria-expanded={open}><Download size={15} />Export</button>
      {open && (
        <div className="glass rise absolute right-0 z-30 mt-2 w-64 rounded-2xl p-1.5 shadow-lift" style={{ border: '1px solid var(--line)' }} onMouseLeave={() => setOpen(false)}>
          {items.map(([k, label]) => (
            <a key={k} className="block rounded-xl px-3 py-2 text-[13px] hover:bg-fill" href={`/api/projects/${id}/export/${k}?${qs}`} onClick={() => setOpen(false)}>{label}</a>
          ))}
          <Link className="block rounded-xl px-3 py-2 text-[13px] hover:bg-fill" to={`/p/${id}/reports`} onClick={() => setOpen(false)}>Printable report…</Link>
          <Link className="block rounded-xl px-3 py-2 text-[13px] hover:bg-fill" to="/settings#api" onClick={() => setOpen(false)}>API, Google Sheets, Looker Studio…</Link>
        </div>
      )}
    </div>
  );
}
