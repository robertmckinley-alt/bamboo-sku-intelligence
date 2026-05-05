/* eslint-disable */
const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = React;
const { buildAnalytics, DEFAULT_SKU_WEIGHTS, DEFAULT_STORE_WEIGHTS, useUrlState,
        fmt$, fmt$d, fmtN, fmtPct, fmtNum, parseLastOrder } = window.BambooCore;

// ============== Premium pill / tag ==============
const TAG_STYLES = {
  // SKU tags
  'SCALE':              {bg: 'rgba(16,185,129,.10)', fg: '#047857', bd: '#a7f3d0', dot: '#059669'},
  'PUSH':               {bg: 'rgba(217,119,6,.08)',  fg: '#b45309', bd: '#fde68a', dot: '#d97706'},
  'MONITOR':            {bg: 'rgba(107,114,128,.08)',fg: '#374151', bd: '#e5e7eb', dot: '#9ca3af'},
  'FIX':                {bg: 'rgba(234,88,12,.08)',  fg: '#9a3412', bd: '#fed7aa', dot: '#ea580c'},
  'CUT':                {bg: 'rgba(220,38,38,.08)',  fg: '#991b1b', bd: '#fecaca', dot: '#dc2626'},
  // Store tags
  'HIGH VALUE — CALL NOW': {bg: 'linear-gradient(135deg,#059669,#047857)', fg: '#fff', bd: '#047857', dot: '#fff', shadow: true},
  'CROSS-SELL':         {bg: 'rgba(217,119,6,.08)',  fg: '#b45309', bd: '#fde68a', dot: '#d97706'},
  'CATEGORY EXPANSION': {bg: 'rgba(37,99,235,.08)',  fg: '#1d4ed8', bd: '#bfdbfe', dot: '#2563eb'},
  'LOW PRIORITY':       {bg: 'rgba(107,114,128,.08)',fg: '#4b5563', bd: '#e5e7eb', dot: '#9ca3af'},
  'AT RISK':            {bg: 'rgba(220,38,38,.08)',  fg: '#991b1b', bd: '#fecaca', dot: '#dc2626'},
};

function Tag({tag, dot=true, size='sm'}) {
  const s = TAG_STYLES[tag] || TAG_STYLES.MONITOR;
  const sty = {
    background: s.bg, color: s.fg, borderColor: s.bd,
    boxShadow: s.shadow ? '0 1px 2px rgba(4,120,87,.25), inset 0 1px 0 rgba(255,255,255,.18)' : 'inset 0 1px 0 rgba(255,255,255,.45)',
  };
  return (
    <span className={`pill ${size==='lg'?'pill-lg':''}`} style={sty}>
      {dot && <span className="dot" style={{background: s.dot}}></span>}
      {tag}
    </span>
  );
}

// Tag chip group for filter rows
function TagChips({options, value, onChange, counts}) {
  return (
    <div className="inline-flex gap-1 flex-wrap">
      {options.map(t => {
        const sel = value === t;
        const s = TAG_STYLES[t];
        const sty = sel
          ? { background: s ? s.bg : '#0b1220', color: s ? s.fg : '#fff', borderColor: s ? s.bd : '#0b1220', boxShadow: s?.shadow ? '0 1px 2px rgba(4,120,87,.25)' : '0 1px 0 rgba(255,255,255,.4) inset' }
          : { background: 'white', color: '#374151', borderColor: '#e5e7eb' };
        return (
          <button key={t} onClick={() => onChange(t)} className="pill pill-lg" style={sty}>
            {s && sel && <span className="dot" style={{background: s.dot}}></span>}
            {t === 'All' ? 'All' : t}
            {counts && counts[t] != null && <span className="ml-1 opacity-60 tabular-nums text-[10px]">{counts[t]}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Trend({d}) {
  if (d === 'up') return <span className="text-emerald-600 font-mono" title="Trending up">↑</span>;
  if (d === 'down') return <span className="text-rose-600 font-mono" title="Trending down">↓</span>;
  return <span className="text-slate-400 font-mono" title="Flat">→</span>;
}

function MiniBar({value, max, color='#0b1220'}) {
  const w = max ? Math.max(2, (value/max)*100) : 0;
  return (
    <div className="w-full h-1 rounded-sm overflow-hidden" style={{background: '#eef0f3'}}>
      <div className="h-full transition-all" style={{width:w+'%', background: color}}></div>
    </div>
  );
}

function ScoreBar({score, height=6}) {
  const cls = score >= 70 ? 'score-grad-high' : score >= 40 ? 'score-grad-mid' : 'score-grad-low';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full overflow-hidden bg-slate-100" style={{height}}>
        <div className={`h-full ${cls} transition-all`} style={{width: Math.max(2, score)+'%'}}></div>
      </div>
      <span className="font-mono tabular-nums text-slate-700 w-7 text-right text-[11px]">{score.toFixed(0)}</span>
    </div>
  );
}

// ============== Sparkline ==============
function Sparkline({values, w=64, h=18, color='#059669', fill=true}) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 2) - 1]);
  const path = pts.map(([x,y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ');
  const area = `${path} L${pts[pts.length-1][0]},${h} L0,${h} Z`;
  return (
    <svg className="spark" width={w} height={h} style={{display: 'block'}}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="1.6" fill={color} />
    </svg>
  );
}

// ============== Slider ==============
function Slider({label, value, onChange, min=0, max=1, step=0.01, hint}) {
  return (
    <label className="block group" title={hint}>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-slate-700 group-hover:text-slate-900">{label}</span>
        <span className="text-[10px] font-mono tabular-nums text-slate-500">{Math.round(value*100)}%</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
             onChange={e => onChange(parseFloat(e.target.value))}
             className="w-full cursor-pointer" />
    </label>
  );
}

// ============== Sortable header cell ==============
function Th({k, sort, setSort, label, align='left', hint, w}) {
  const active = sort?.key === k;
  return (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`}
        title={hint}
        style={w?{width:w}:undefined}
        onClick={() => setSort(s => ({key:k, dir: s.key===k && s.dir==='desc' ? 'asc' : 'desc'}))}>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[8px] ${active?'text-slate-700':'text-slate-300'}`}>
          {active ? (sort.dir==='asc'?'▲':'▼') : '▴▾'}
        </span>
      </span>
    </th>
  );
}

// ============== Executive Strip ==============
function ExecStrip({a}) {
  const top5 = useMemo(() => [...a.skus].sort((x,y) => y.rev - x.rev).slice(0, 5), [a]);
  const bot5 = useMemo(() => [...a.skus].filter(s => s.rev > 0).sort((x,y) => x.rev - y.rev).slice(0, 5), [a]);
  const avgRevPerSku = a.meta.totalRevenue / a.skus.length;

  // Build per-month sparkline values from monthly aggregation if available
  const sparkRev = a.timeline?.monthlyRev || [a.meta.totalRevenue/4, a.meta.totalRevenue/4, a.meta.totalRevenue/4, a.meta.totalRevenue/4];
  const sparkUnits = a.timeline?.monthlyUnits || [a.meta.totalUnits/4, a.meta.totalUnits/4, a.meta.totalUnits/4, a.meta.totalUnits/4];

  return (
    <div className="bg-white border-b border-slate-200">
      <div className="flex flex-wrap items-stretch divide-x divide-slate-200">
        <KpiCell label="Period" value={a.meta.startDate.slice(2) + ' → ' + a.meta.endDate.slice(2)} sub={a.meta.periodDays + ' days · ' + a.meta.months.toFixed(1) + ' mo'} />
        <KpiCell label="Revenue" value={fmt$(a.meta.totalRevenue)} sub={fmt$(a.meta.totalRevenue/a.meta.months)+' / mo'} accent
                 spark={<Sparkline values={sparkRev} color="#059669" />} />
        <KpiCell label="Units" value={fmtN(a.meta.totalUnits)} sub={fmtN(a.meta.totalUnits/a.meta.months)+' / mo'} accent
                 spark={<Sparkline values={sparkUnits} color="#1f2937" />} />
        <KpiCell label="Active SKUs" value={fmtN(a.skus.length)} sub={a.meta.totalSkus + ' total'} />
        <KpiCell label="Retailers" value={fmtN(a.clients.length)} sub="across distros" />
        <KpiCell label="Avg Rev / SKU" value={fmt$(avgRevPerSku)} sub={fmt$(a.meta.totalRevenue/a.clients.length)+' / store'} />

        <div className="flex-1 min-w-[260px] px-4 py-2.5 hidden md:block">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">Top 5 SKUs <span className="text-slate-400 normal-case font-normal">by revenue</span></div>
          <ol className="space-y-0.5 text-[11px]">
            {top5.map((s,i) => (
              <li key={s.i} className="flex items-baseline gap-2">
                <span className="text-slate-400 font-mono tabular-nums w-4">{i+1}</span>
                <span className="truncate flex-1" title={s.n}>{s.n}</span>
                <span className="font-mono tabular-nums text-emerald-700 font-semibold">{fmt$(s.rev)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex-1 min-w-[260px] px-4 py-2.5 hidden lg:block border-l border-slate-200">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 font-semibold">Bottom 5 SKUs <span className="text-slate-400 normal-case font-normal">by revenue</span></div>
          <ol className="space-y-0.5 text-[11px]">
            {bot5.map((s,i) => (
              <li key={s.i} className="flex items-baseline gap-2">
                <span className="text-slate-400 font-mono tabular-nums w-4">{i+1}</span>
                <span className="truncate flex-1 text-slate-500" title={s.n}>{s.n}</span>
                <span className="font-mono tabular-nums text-slate-400">{fmt$(s.rev)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function KpiCell({label, value, sub, accent, spark}) {
  return (
    <div className="px-4 py-2.5 min-w-[140px]">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold flex items-center justify-between gap-2">
        <span>{label}</span>
        {spark && <span className="opacity-90">{spark}</span>}
      </div>
      <div className={`font-mono tabular-nums mt-0.5 leading-tight font-semibold ${accent?'text-slate-900 text-base':'text-slate-800 text-sm'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5 font-mono tabular-nums">{sub}</div>}
    </div>
  );
}

// ============== Weight Panel ==============
function WeightPanel({skuW, setSkuW, storeW, setStoreW, onReset}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white border-b border-slate-200">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-700 hover:bg-slate-50 flex justify-between items-center">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Scoring Weights
        </span>
        <span className="font-mono text-slate-400 text-[10px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-4">
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">SKU Score</h4>
              <button onClick={onReset} className="text-[10px] text-slate-500 hover:text-slate-900 underline decoration-dotted">reset</button>
            </div>
            <div className="space-y-2.5">
              <Slider label="Revenue" value={skuW.revenue} onChange={v => setSkuW({...skuW, revenue:v})} hint="Total $ contribution across all stores" />
              <Slider label="Units" value={skuW.units} onChange={v => setSkuW({...skuW, units:v})} hint="Total units sold across all stores" />
              <Slider label="Velocity" value={skuW.velocity} onChange={v => setSkuW({...skuW, velocity:v})} hint="Units sold per carrying store per month" />
              <Slider label="Distribution" value={skuW.distribution} onChange={v => setSkuW({...skuW, distribution:v})} hint="% of stores carrying this SKU" />
              <Slider label="Reorder" value={skuW.reorder} onChange={v => setSkuW({...skuW, reorder:v})} hint="Estimated reorder frequency" />
              <Slider label="Opportunity" value={skuW.opportunity} onChange={v => setSkuW({...skuW, opportunity:v})} hint="Estimated $ left on the table at non-carrying stores" />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Store Opportunity</h4>
            <div className="space-y-2.5">
              <Slider label="Missing Top SKUs" value={storeW.missingTop} onChange={v => setStoreW({...storeW, missingTop:v})} hint="How much weight to put on top-ranked SKUs they don't carry" />
              <Slider label="Category Gap" value={storeW.categoryGap} onChange={v => setStoreW({...storeW, categoryGap:v})} hint="Categories with zero coverage" />
              <Slider label="Spend Potential" value={storeW.spendPotential} onChange={v => setStoreW({...storeW, spendPotential:v})} hint="Current spend vs peer-store benchmark" />
              <Slider label="Order Frequency" value={storeW.frequency} onChange={v => setStoreW({...storeW, frequency:v})} hint="Cadence vs peer-store benchmark" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============== Empty state ==============
function EmptyState({title, hint, action, onAction, icon}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full ink-grad flex items-center justify-center mb-3 text-emerald-300 text-lg">{icon || '∅'}</div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-1 max-w-xs">{hint}</p>}
      {action && <button onClick={onAction} className="btn btn-primary mt-3">{action}</button>}
    </div>
  );
}

// ============== Loading skeleton ==============
function Skeleton() {
  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <div className="h-14 bg-white border-b border-slate-200 flex items-center px-4 gap-3">
        <div className="w-7 h-7 rounded-md shimmer"></div>
        <div className="w-48 h-5 shimmer"></div>
        <div className="ml-6 flex gap-1">
          {[0,1,2,3,4].map(i => <div key={i} className="w-20 h-7 shimmer"></div>)}
        </div>
      </div>
      <div className="h-20 bg-white border-b border-slate-200 flex items-center px-3 gap-6">
        {Array.from({length:6}).map((_,i) => (
          <div key={i} className="space-y-1.5">
            <div className="w-14 h-2 shimmer"></div>
            <div className="w-24 h-5 shimmer"></div>
            <div className="w-16 h-2 shimmer"></div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex">
        <div className="flex-1 p-4 space-y-1.5">
          <div className="h-9 shimmer"></div>
          {Array.from({length:18}).map((_,i) => <div key={i} className="h-7 shimmer"></div>)}
        </div>
        <div className="w-72 border-l border-slate-200 bg-white p-4 space-y-3">
          {Array.from({length:10}).map((_,i) => <div key={i} className="h-5 shimmer"></div>)}
        </div>
      </div>
    </div>
  );
}

// ============== Header ==============
function AppBar({tabs, tab, setTab, onBulkExport}) {
  return (
    <header className="appbar flex items-center px-4 py-2.5 bg-white border-b border-slate-200 gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md emerald-grad text-white flex items-center justify-center text-[13px] font-bold font-display" style={{boxShadow: '0 1px 2px rgba(5,150,105,.25), inset 0 1px 0 rgba(255,255,255,.2)'}}>B</div>
        <div className="leading-tight">
          <h1 className="font-display text-[18px] font-semibold text-slate-900 tracking-tight">Bamboo <span className="italic text-emerald-700">SKU</span> Intelligence</h1>
          <div className="text-[9px] font-mono text-slate-400 small-caps -mt-0.5">v2 · wholesale operating system</div>
        </div>
      </div>
      <div className="h-6 w-px bg-slate-200 mx-2"></div>
      <nav className="flex gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition ${tab===t.id?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onBulkExport} className="btn btn-emerald">↓ Bulk Call Sheet</button>
        <span className="text-[10px] text-slate-400 font-mono hidden xl:inline">/ search · 1-5 tabs · esc close</span>
      </div>
    </header>
  );
}

window.BambooUI = { Tag, TagChips, Trend, MiniBar, ScoreBar, Sparkline, Slider, Th, ExecStrip, KpiCell, WeightPanel, EmptyState, Skeleton, AppBar, TAG_STYLES };
