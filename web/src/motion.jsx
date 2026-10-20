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

// The app's mark ("Chorus"): four overlapping speech bubbles, one per AI service, in a round badge.
// Where they overlap the colours add up and glow brighter. `draw` makes the bubbles pop in one by one.
const BUBBLES = [[25, 25, '#0a84ff'], [39, 25, '#bf5af2'], [25, 39, '#30d158'], [39, 39, '#ff9f0a']];
export function Logo({ size = 32, draw = false }) {
  const reduce = useReducedMotion();
  const pop = draw && !reduce;
  const spring = i => ({ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 420, damping: 16 });
  return (
    <span className="relative inline-block shrink-0 rounded-full shadow-thumb" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 64 64" className="block">
        <circle cx="32" cy="32" r="32" fill="#101014" />
        <circle cx="32" cy="32" r="31.5" fill="none" stroke="#fff" strokeOpacity=".12" />
        <g transform="translate(3.2 3.2) scale(0.9)" style={{ isolation: 'isolate' }}>
          {BUBBLES.map(([cx, cy, c], i) => (
            <motion.circle key={c} cx={cx} cy={cy} r="12.5" fill={c} style={{ mixBlendMode: 'screen', transformOrigin: `${cx}px ${cy}px` }}
              initial={pop ? { scale: 0, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={spring(i)} />
          ))}
          <motion.path d="M15 45 L12 53.5 L21 49 Z" fill="#30d158" style={{ mixBlendMode: 'screen' }}
            initial={pop ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.75, duration: 0.3 }} />
        </g>
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
