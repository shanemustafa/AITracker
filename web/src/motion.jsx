// Motion and graphics. Every animation here is skipped when the device asks for reduced motion.
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

export const EASE = [0.2, 0.7, 0.2, 1]; // Apple-like "ease out"

// Numbers that count up to their value (e.g. 0% → 43.5%).
export function CountUp({ value, format = v => v, duration = 0.9 }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce || value == null ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (value == null || reduce || typeof value !== 'number') { setShown(value); return; }
    const c = animate(from.current, value, { duration, ease: EASE, onUpdate: v => setShown(v) });
    from.current = value;
    return () => c.stop();
  }, [value, reduce, duration]);
  if (value == null) return format(null);
  const decimals = Number.isInteger(value) ? 0 : 1;
  return <>{format(Math.round(shown * 10 ** decimals) / 10 ** decimals)}</>;
}

// Page content glides in when you open a page.
export function PageIn({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  );
}

// The app's mark: an answer bubble with a rising line. `draw` animates the line being drawn.
export function Logo({ size = 32, draw = false, radius }) {
  const reduce = useReducedMotion();
  const animateLine = draw && !reduce;
  return (
    <span className="relative inline-grid shrink-0 place-items-center overflow-hidden text-white shadow-thumb"
      style={{ width: size, height: size, borderRadius: radius ?? size * 0.29, background: 'linear-gradient(140deg, #0a84ff 0%, #5e5ce6 55%, #bf5af2 100%)' }} aria-hidden>
      <span className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.35), transparent 55%)' }} />
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none" className="relative">
        <path d="M6 6.5h20a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H14l-5.5 4.5V23.5H6a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" stroke="white" strokeOpacity=".55" strokeWidth="2" strokeLinejoin="round" />
        <motion.path d="M8.5 19l4.5-5 3.5 3.5 6.5-7" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          initial={animateLine ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.25, ease: EASE }} />
        <motion.circle cx="23" cy="10.5" r="1.9" fill="white"
          initial={animateLine ? { scale: 0, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.2, type: 'spring', stiffness: 380, damping: 14 }} />
      </svg>
    </span>
  );
}

// Slowly drifting colour light, behind the sign-in page.
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="aurora-blob" style={{ background: '#0a84ff', top: '-18%', left: '8%', animationDelay: '0s' }} />
      <div className="aurora-blob" style={{ background: '#5e5ce6', top: '-10%', right: '6%', animationDelay: '-6s' }} />
      <div className="aurora-blob" style={{ background: '#bf5af2', top: '42%', left: '-10%', animationDelay: '-11s', opacity: 0.18 }} />
      <div className="aurora-blob" style={{ background: '#30d158', bottom: '-25%', right: '12%', animationDelay: '-3s', opacity: 0.12 }} />
    </div>
  );
}

// Empty-page illustration: AI engines orbiting a chat bubble.
export function OrbitArt({ size = 132 }) {
  const dots = ['#10a37f', '#4285f4', '#20808d', '#d97757'];
  return (
    <div className="relative mx-auto mb-5" style={{ width: size, height: size }} aria-hidden>
      <div className="absolute inset-0 rounded-full" style={{ border: '1.5px dashed var(--axis)' }} />
      <div className="absolute inset-[22%] rounded-full" style={{ border: '1.5px dashed var(--line)' }} />
      <div className="orbit absolute inset-0">
        {dots.map((c, i) => (
          <span key={c} className="absolute h-3.5 w-3.5 rounded-full shadow-thumb"
            style={{ background: c, left: `${50 + 50 * Math.cos((i * Math.PI) / 2)}%`, top: `${50 + 50 * Math.sin((i * Math.PI) / 2)}%`, transform: 'translate(-50%,-50%)', border: '2px solid var(--surface)' }} />
        ))}
      </div>
      <div className="absolute inset-0 grid place-items-center"><Logo size={size * 0.36} /></div>
    </div>
  );
}

// Shimmering grey shapes while a page loads.
export function Skeleton({ rows = 3 }) {
  return (
    <div className="grid gap-4 py-2" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-28" />)}</div>
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-40" />)}
    </div>
  );
}

// A soft light that follows the pointer across cards (one listener for the whole app).
export function installSpotlight() {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;
  let last = null;
  window.addEventListener('pointermove', e => {
    const card = e.target.closest?.('.card');
    if (last && last !== card) last.classList.remove('lit');
    if (!card) { last = null; return; }
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
    card.classList.add('lit');
    last = card;
  }, { passive: true });
}

// Stagger helper: give each item a slightly later start.
export const stagger = i => ({ animationDelay: `${Math.min(i, 12) * 55}ms` });
