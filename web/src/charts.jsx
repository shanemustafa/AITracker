import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ReferenceLine, LabelList, BarChart, Bar as RBar,
} from 'recharts';
import { useColors, fmtDate } from './lib.js';
import { useReducedMotion } from 'framer-motion';

// Charts draw themselves in, unless the device asks for reduced motion.
const useAnim = () => { const reduce = useReducedMotion(); return reduce ? { isAnimationActive: false } : { isAnimationActive: true, animationDuration: 900, animationEasing: 'ease-out' }; };
import { BrandDot } from './ui.jsx';

const shortDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function Legend({ brands, hidden = new Set(), onToggle }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {brands.map(b => (
        <button key={b.id} onClick={() => onToggle?.(b.id)} className={`inline-flex items-center gap-1.5 text-xs ${hidden.has(b.id) ? 'opacity-40' : ''} ${b.is_own ? 'font-semibold text-ink' : 'text-ink2'}`}>
          <BrandDot slot={b.color} />{b.name}{b.is_own && <span className="text-muted font-normal">(you)</span>}
        </button>
      ))}
    </div>
  );
}

function TipBox({ active, payload, label, brands, unit = '%', title }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => p.value != null).sort((a, b) => b.value - a.value);
  return (
    <div className="glass rounded-xl px-3.5 py-2.5 text-xs shadow-lift">
      <div className="mb-1 font-medium text-ink">{title || fmtDate(label)}</div>
      {rows.map(p => {
        const b = brands.find(x => p.dataKey.endsWith('_' + x.id));
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className={`flex items-center gap-1.5 ${b?.is_own ? 'font-semibold text-ink' : 'text-ink2'}`}><BrandDot slot={b?.color} size={8} />{b?.name}</span>
            <span className="tnum text-ink">{p.value}{unit}</span>
          </div>
        );
      })}
    </div>
  );
}

// Rolling average makes daily noise easier to read.
export function smooth(series, keys, window = 7) {
  if (window <= 1) return series;
  return series.map((d, i) => {
    const out = { ...d };
    const slice = series.slice(Math.max(0, i - window + 1), i + 1);
    for (const k of keys) out[k] = Math.round(10 * slice.reduce((s, x) => s + (x[k] || 0), 0) / slice.length) / 10;
    return out;
  });
}

export function TrendChart({ data, brands, prefix = 'v', hidden = new Set(), height = 260, unit = '%', domain = [0, 'auto'] }) {
  const c = useColors();
  const anim = useAnim();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} minTickGap={28} />
        <YAxis tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} domain={domain} unit={unit === '%' ? '%' : ''} width={44} reversed={prefix === 'p'} allowDecimals={false} />
        <Tooltip content={<TipBox brands={brands} unit={unit} />} cursor={{ stroke: c.axis, strokeWidth: 1 }} />
        {brands.filter(b => !hidden.has(b.id)).map(b => (
          <Line key={b.id} type="monotone" dataKey={`${prefix}_${b.id}`} stroke={c.brand(b.color)} strokeWidth={b.is_own ? 2.5 : 1.75}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} connectNulls {...anim} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ShareOfVoiceChart({ data, brands, hidden = new Set(), height = 260 }) {
  const c = useColors();
  const anim = useAnim();
  const visible = brands.filter(b => !hidden.has(b.id));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} stackOffset="expand" margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} minTickGap={28} />
        <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={50} />
        <Tooltip content={<TipBox brands={brands} />} cursor={{ stroke: c.axis }} />
        {visible.map(b => (
          <Area key={b.id} type="monotone" dataKey={`s_${b.id}`} stackId="1" stroke={c.surface} strokeWidth={1.5}
            fill={c.brand(b.color)} fillOpacity={b.is_own ? 0.95 : 0.8} {...anim} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Each dot is a brand: across = how often it is mentioned, up = how positive the tone is.
export function VisibilitySentimentMap({ brands, height = 280 }) {
  const c = useColors();
  const pts = brands.filter(b => b.visibility != null && b.sentiment != null);
  // Keep names readable when two dots sit close together: push their labels apart.
  const labelPlace = {};
  const sorted = [...pts].sort((a, b) => a.visibility - b.visibility);
  sorted.forEach((p, i) => {
    const near = sorted.filter((q, j) => j !== i && Math.abs(q.visibility - p.visibility) < 14 && Math.abs(q.sentiment - p.sentiment) < 12);
    if (!near.length) return;
    const leftmost = near.every(q => q.visibility > p.visibility || (q.visibility === p.visibility && q.id > p.id));
    labelPlace[p.id] = leftmost ? 'left' : near.every(q => q.visibility < p.visibility || q.id < p.id) ? 'right' : (p.sentiment < near[0].sentiment ? 'bottom' : 'top');
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 16, right: 40, bottom: 18, left: 10 }}>
        <CartesianGrid stroke={c.grid} />
        <XAxis type="number" dataKey="visibility" name="Visibility" unit="%" domain={[0, 100]} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false}
          label={{ value: 'Visibility →', position: 'insideBottomRight', offset: -12, fill: c.muted, fontSize: 11 }} />
        <YAxis type="number" dataKey="sentiment" name="Sentiment" domain={[0, 100]} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={44}
          label={{ value: 'Tone →', angle: -90, position: 'insideLeft', offset: 18, fill: c.muted, fontSize: 11 }} />
        <ZAxis range={[110, 110]} />
        <ReferenceLine y={50} stroke={c.axis} strokeDasharray="4 4" />
        <ReferenceLine x={50} stroke={c.axis} strokeDasharray="4 4" />
        <Tooltip cursor={false} content={({ active, payload }) => active && payload?.[0] ? (
          <div className="glass rounded-xl px-3.5 py-2.5 text-xs shadow-lift">
            <div className="font-medium text-ink mb-1">{payload[0].payload.name}</div>
            <div className="text-ink2">Visibility <span className="tnum text-ink">{payload[0].payload.visibility}%</span></div>
            <div className="text-ink2">Sentiment <span className="tnum text-ink">{payload[0].payload.sentiment}/100</span></div>
          </div>) : null} />
        <Scatter data={pts} isAnimationActive={false} shape={({ cx, cy, payload }) => {
          const l = labelPlace[payload.id] || 'top';
          const pos = { top: [cx, cy - 12, 'middle'], right: [cx + 11, cy + 4, 'start'], left: [cx - 11, cy + 4, 'end'], bottom: [cx, cy + 20, 'middle'] }[l];
          return (
            <g>
              <circle cx={cx} cy={cy} r={6.5} fill={c.brand(payload.color)} stroke={c.surface} strokeWidth={2} />
              <text x={pos[0]} y={pos[1]} textAnchor={pos[2]} fill={c.ink} fontSize={11} fontWeight={payload.is_own ? 700 : 500}>{payload.name}</text>
            </g>
          );
        }} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function HBars({ rows, valueKey = 'value', labelKey = 'label', unit = '%', slot = 1, height }) {
  const c = useColors();
  const anim = useAnim();
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(120, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={8}>
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey={labelKey} width={180} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} content={({ active, payload }) => active && payload?.[0] ? (
          <div className="glass rounded-xl px-3.5 py-2.5 text-xs shadow-lift"><span className="text-ink">{payload[0].payload[labelKey]}: </span><span className="tnum">{payload[0].value}{unit}</span></div>) : null} />
        <RBar dataKey={valueKey} fill={c.brand(slot)} radius={[0, 4, 4, 0]} {...anim}>
          <LabelList dataKey={valueKey} position="right" formatter={v => `${v}${unit}`} style={{ fill: c.ink, fontSize: 11 }} />
        </RBar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Small line for a list cell.
export function Spark({ data, dataKey, slot = 1 }) {
  const c = useColors();
  return (
    <ResponsiveContainer width={90} height={28}>
      <LineChart data={data}><Line type="monotone" dataKey={dataKey} stroke={c.brand(slot)} strokeWidth={1.75} dot={false} isAnimationActive={false} /></LineChart>
    </ResponsiveContainer>
  );
}
