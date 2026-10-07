/* eslint-disable */
const { useEffect, useMemo, useState } = React;

const SELLTHROUGH_DATA_URL = 'data/allocation_sell_through.json';
const SIGNAL_ORDER = {
  'Chronic sellout': 0,
  'Recurring sellout': 1,
  'Consistent fast mover': 2,
  'Emerging shortage': 3,
  'Balanced': 4,
  'Volatile allocation': 5,
  'Watch': 6,
  'Slow mover': 7,
  'Limited history': 8,
};

const SIGNAL_STYLES = {
  'Chronic sellout': 'bg-rose-100 text-rose-800 border-rose-200',
  'Recurring sellout': 'bg-orange-100 text-orange-800 border-orange-200',
  'Consistent fast mover': 'bg-amber-100 text-amber-800 border-amber-200',
  'Emerging shortage': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Balanced': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Volatile allocation': 'bg-violet-100 text-violet-800 border-violet-200',
  'Watch': 'bg-sky-100 text-sky-800 border-sky-200',
  'Slow mover': 'bg-slate-200 text-slate-700 border-slate-300',
  'Limited history': 'bg-slate-100 text-slate-500 border-slate-200',
};

const number = value => Number(value || 0);
const fmtN = value => Math.round(number(value)).toLocaleString('en-US');
const fmtPct = value => (number(value) * 100).toFixed(1) + '%';
const fmtMoney = value => '$' + number(value).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const fmtShortDate = value => {
  if (!value) return '—';
  const [y,m,d] = value.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', {month:'short', day:'numeric'});
};

function expandSellThroughHistory(payload) {
  if (!payload || !Array.isArray(payload.history_columns)) return payload;
  const weeks = new Map((payload.weeks || []).map(week => [week.id, week]));
  const columns = payload.history_columns;
  payload.products = (payload.products || []).map(product => ({
    ...product,
    history: (product.history || []).map(values => {
      if (!Array.isArray(values)) return values;
      const row = {};
      columns.forEach((column, index) => { row[column] = values[index]; });
      const week = weeks.get(row.week_id) || {};
      return {
        ...row,
        period_from: week.period_from,
        period_to: week.period_to,
        is_sellout: row.unsold_units === 0 && row.sold_units > 0,
        is_near_sellout: row.sell_through >= 0.9,
      };
    }),
  }));
  return payload;
}

function SignalPill({signal}) {
  return <span className={`inline-flex border rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${SIGNAL_STYLES[signal] || SIGNAL_STYLES.Watch}`}>{signal}</span>;
}

function heatColor(value, present=true) {
  if (!present) return {background:'#f1f5f9', color:'#94a3b8'};
  if (value >= 1) return {background:'#be123c', color:'white'};
  if (value >= .9) return {background:'#f97316', color:'white'};
  if (value >= .7) return {background:'#059669', color:'white'};
  if (value >= .5) return {background:'#7dd3fc', color:'#0c4a6e'};
  return {background:'#e2e8f0', color:'#475569'};
}

function WeekCells({product, weeks, compact=false}) {
  const byWeek = new Map(product.history.map(row => [row.week_id, row]));
  return (
    <div className="flex gap-1" aria-label="Weekly sell-through history">
      {weeks.map(week => {
        const row = byWeek.get(week.id);
        const style = heatColor(row ? row.sell_through : 0, !!row);
        const title = row
          ? `${fmtShortDate(row.period_from)}–${fmtShortDate(row.period_to)}: ${fmtPct(row.sell_through)} · ${fmtN(row.sold_units)}/${fmtN(row.allocated_units)} units`
          : `${fmtShortDate(week.period_from)}–${fmtShortDate(week.period_to)}: not allocated`;
        return <span key={week.id} title={title} style={style}
                     className={`${compact?'w-4 h-4':'w-5 h-5'} rounded-[3px] flex items-center justify-center text-[8px] font-mono font-semibold`}>{row ? Math.round(row.sell_through*10) : '·'}</span>;
      })}
    </div>
  );
}

function PressureStrip({weeks}) {
  const maxShortage = Math.max(...weeks.map(w => w.near_sellouts || 0), 1);
  return (
    <div className="grid grid-cols-12 gap-1.5 mt-5" aria-label="Twelve-week sellout pressure">
      {weeks.map((week, index) => {
        const height = 12 + Math.round((week.near_sellouts / maxShortage) * 34);
        return (
          <div key={week.id} className="min-w-0" title={`${week.name}: ${week.exact_sellouts} exact sellouts, ${week.near_sellouts} at 90%+`}>
            <div className="h-12 flex items-end rounded-sm overflow-hidden bg-white/5">
              <div className="w-full rounded-sm transition-all" style={{height, background:index===weeks.length-1?'#34d399':'rgba(52,211,153,.38)'}}></div>
            </div>
            <div className="mt-1 text-[9px] text-slate-300 font-mono truncate text-center">{fmtShortDate(week.period_to)}</div>
          </div>
        );
      })}
    </div>
  );
}

function SortHead({label, field, sort, setSort, align='left'}) {
  const active = sort.field === field;
  const onClick = () => setSort(active ? {field, dir:sort.dir==='asc'?'desc':'asc'} : {field, dir:'desc'});
  return (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} onClick={onClick}>
      <span className="inline-flex gap-1 items-center">{label}<span className={active?'text-emerald-700':'text-slate-300'}>{active?(sort.dir==='asc'?'↑':'↓'):'↕'}</span></span>
    </th>
  );
}

function exportSellThroughCsv(products) {
  const headers = [
    'Product','Brand','Category','Signal','Weeks Available','Exact Sellout Weeks','Weeks 90%+','Sellout Rate',
    'Weighted Sell Through','Recent 4 Week Sell Through','Total Allocated','Total Sold','Total Unsold','Median Weekly Allocated',
    'Median Weekly Sold','P75 Weekly Sold','Realized Revenue Per Unit','Volume Adjustment %','Recommended Weekly Allocation','Price Signal','Rationale'
  ];
  const esc = value => `"${String(value == null ? '' : value).replace(/"/g,'""')}"`;
  const rows = products.map(p => [
    p.product_name,p.brand_name,p.category_name,p.signal,p.weeks_available,p.soldout_weeks,p.near_sellout_weeks,p.sellout_rate,
    p.weighted_sell_through,p.recent_4_week_sell_through,p.total_allocated_units,p.total_sold_units,p.total_unsold_units,
    p.median_weekly_allocated,p.median_weekly_sold,p.p75_weekly_sold,p.realized_revenue_per_unit,p.volume_adjustment_pct,
    p.recommended_weekly_allocation,p.price_signal,p.rationale
  ]);
  const csv = [headers, ...rows].map(row => row.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bamboo-sellout-intelligence-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function Metric({label, value, note}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
      <div className="font-mono text-[17px] font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
      {note && <div className="text-[10px] text-slate-500 mt-0.5">{note}</div>}
    </div>
  );
}

function ProductDrawer({product, weeks, onClose}) {
  const byWeek = new Map(product.history.map(row => [row.week_id, row]));
  const maxAllocation = Math.max(...product.history.map(row => row.allocated_units), 1);
  return (
    <div className="fixed inset-0 z-50 flex justify-end backdrop-anim" style={{background:'rgba(15,23,42,.28)', backdropFilter:'blur(3px)'}} onClick={onClose}>
      <aside className="w-[680px] max-w-[96vw] h-full bg-slate-50 shadow-2xl drawer-anim overflow-auto" onClick={e => e.stopPropagation()} aria-label={`${product.product_name} details`}>
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2"><SignalPill signal={product.signal} /><span className="text-[10px] text-slate-500 font-mono">{product.weeks_available} weeks available</span></div>
            <h2 className="font-display text-[22px] leading-tight font-semibold text-slate-950">{product.product_name}</h2>
            <p className="text-[11px] text-slate-500 mt-1">{product.brand_name} · {product.category_name}</p>
          </div>
          <button onClick={onClose} className="btn btn-ghost" aria-label="Close product details">Close</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="Exact sellouts" value={`${product.soldout_weeks}/${product.weeks_available}`} note={fmtPct(product.sellout_rate)} />
            <Metric label="Weighted sell-through" value={fmtPct(product.weighted_sell_through)} note={`Recent ${fmtPct(product.recent_4_week_sell_through)}`} />
            <Metric label="Realized revenue/unit" value={fmtMoney(product.realized_revenue_per_unit)} note="Revenue ÷ sold units" />
            <Metric label="Volume action" value={`${product.volume_adjustment_pct>0?'+':''}${product.volume_adjustment_pct}%`} note={`${fmtN(product.recommended_weekly_allocation)} suggested`} />
          </div>

          <section className="bg-slate-950 text-white rounded-xl p-5 border border-slate-800">
            <div className="text-[10px] uppercase tracking-[.16em] text-emerald-300 font-semibold">Recommended next step</div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-4 mt-2 items-end">
              <div>
                <div className="font-display text-[20px] font-semibold">{product.volume_adjustment_pct>0?`Increase weekly allocation ${product.volume_adjustment_pct}%`:product.volume_adjustment_pct<0?`Reduce weekly allocation ${Math.abs(product.volume_adjustment_pct)}%`:'Hold weekly allocation'}</div>
                <p className="text-[12px] text-slate-300 mt-1 leading-relaxed">{product.rationale}</p>
              </div>
              <div className="text-right border-l border-white/10 pl-4">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Pricing</div>
                <div className="text-[12px] font-semibold text-emerald-300 mt-1">{product.price_signal}</div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-baseline">
              <div>
                <h3 className="text-[13px] font-semibold text-slate-900">Twelve-week allocation history</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Filled bars are sold units. The full track is allocated units.</p>
              </div>
              <div className="flex gap-3 text-[9px] text-slate-500"><span><b className="text-rose-700">100%</b> sold out</span><span><b className="text-orange-600">90%+</b> near sellout</span></div>
            </div>
            <div className="divide-y divide-slate-100">
              {[...weeks].reverse().map(week => {
                const row = byWeek.get(week.id);
                if (!row) return (
                  <div key={week.id} className="grid grid-cols-[95px_1fr_84px] gap-3 items-center px-4 py-2 text-[10px] text-slate-400">
                    <span className="font-mono">{fmtShortDate(week.period_from)}–{fmtShortDate(week.period_to)}</span><span className="h-2 rounded bg-slate-100"></span><span className="text-right">Not allocated</span>
                  </div>
                );
                const barWidth = (row.allocated_units / maxAllocation) * 100;
                const soldWidth = row.allocated_units ? (row.sold_units / row.allocated_units) * 100 : 0;
                return (
                  <div key={week.id} className="grid grid-cols-[95px_1fr_84px] gap-3 items-center px-4 py-2.5 text-[10px]">
                    <span className="font-mono text-slate-500">{fmtShortDate(week.period_from)}–{fmtShortDate(week.period_to)}</span>
                    <div className="relative h-4">
                      <div className="absolute left-0 top-1 h-2.5 bg-slate-200 rounded" style={{width:barWidth+'%'}}>
                        <div className="h-full rounded" style={{width:soldWidth+'%', background:heatColor(row.sell_through).background}}></div>
                      </div>
                    </div>
                    <span className="text-right font-mono tabular-nums text-slate-700">{fmtN(row.sold_units)}/{fmtN(row.allocated_units)} <b className={row.sell_through>=.9?'text-rose-700':'text-slate-500'}>{fmtPct(row.sell_through)}</b></span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Metric label="Median weekly allocation" value={fmtN(product.median_weekly_allocated)} />
            <Metric label="75th percentile weekly sales" value={fmtN(product.p75_weekly_sold)} />
            <Metric label="Total units sold" value={fmtN(product.total_sold_units)} note={`${fmtN(product.total_allocated_units)} allocated`} />
            <Metric label="Order count" value={fmtN(product.total_order_count)} note={`${fmtMoney(product.total_sold_revenue)} sold revenue`} />
          </section>

          <p className="text-[10px] leading-relaxed text-slate-500 border-t border-slate-200 pt-4">
            Sellout timing is not available in this completed-week endpoint. A sold-out week shows censored demand: actual demand may have exceeded the allocation. Pricing guidance is a controlled test signal, not an automatic price change.
          </p>
        </div>
      </aside>
    </div>
  );
}

function SellThroughPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [signal, setSignal] = useState('All');
  const [brand, setBrand] = useState('All');
  const [category, setCategory] = useState('All');
  const [decisionReady, setDecisionReady] = useState(true);
  const [sort, setSort] = useState({field:'priority', dir:'asc'});
  const [limit, setLimit] = useState(200);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    fetch(SELLTHROUGH_DATA_URL + '?v=' + (window.__BAMBOO_BUILD || Date.now()), {cache:'no-cache'})
      .then(response => {
        if (!response.ok) throw new Error('Weekly sell-through data returned ' + response.status);
        return response.json();
      })
      .then(payload => setData(expandSellThroughHistory(payload)))
      .catch(err => setError(String(err)));
  }, []);

  const brands = useMemo(() => data ? [...new Set(data.products.map(p => p.brand_name))].sort() : [], [data]);
  const categories = useMemo(() => data ? [...new Set(data.products.map(p => p.category_name))].sort() : [], [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const rows = data.products.filter(p => {
      if (q && !`${p.product_name} ${p.brand_name} ${p.category_name}`.toLowerCase().includes(q)) return false;
      if (signal !== 'All' && p.signal !== signal) return false;
      if (brand !== 'All' && p.brand_name !== brand) return false;
      if (category !== 'All' && p.category_name !== category) return false;
      if (decisionReady && (p.weeks_available < 4 || p.median_weekly_allocated < 25)) return false;
      return true;
    });
    const value = (p, field) => {
      if (field === 'priority') return SIGNAL_ORDER[p.signal] ?? 99;
      if (field === 'product_name') return p.product_name.toLowerCase();
      return number(p[field]);
    };
    rows.sort((a,b) => {
      const av = value(a, sort.field), bv = value(b, sort.field);
      if (av === bv) return (b.soldout_weeks - a.soldout_weeks) || (b.total_sold_units - a.total_sold_units);
      const comparison = av < bv ? -1 : 1;
      return sort.dir === 'asc' ? comparison : -comparison;
    });
    return rows;
  }, [data, query, signal, brand, category, decisionReady, sort]);

  useEffect(() => { setLimit(200); }, [query, signal, brand, category, decisionReady]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setPicked(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error) return <div className="h-full grid place-items-center bg-slate-50"><div className="border border-rose-200 bg-white rounded-xl p-6 max-w-md"><h2 className="font-display text-xl font-semibold text-rose-800">Sell-through data unavailable</h2><p className="text-sm text-slate-600 mt-2">{error}</p><p className="text-xs text-slate-500 mt-3">Run the weekly refresh or check the GitHub Action.</p></div></div>;
  if (!data) return <div className="h-full p-6 bg-slate-50"><div className="h-52 shimmer rounded-xl"></div><div className="mt-4 h-10 shimmer rounded"></div>{Array.from({length:10}).map((_,i)=><div key={i} className="mt-2 h-8 shimmer rounded"></div>)}</div>;

  const summary = data.summary;
  const weeks = data.weeks;
  const visible = filtered.slice(0, limit);
  const recurring = data.products.filter(p => p.signal === 'Chronic sellout' || p.signal === 'Recurring sellout').length;
  const fast = data.products.filter(p => p.signal === 'Consistent fast mover' || p.signal === 'Emerging shortage').length;
  const sourceTime = data.source.generated_at ? new Date(data.source.generated_at).toLocaleString('en-US', {timeZone:data.source.timezone, month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'}) : 'Unknown';

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <div className="bg-slate-950 text-white border-b border-slate-800">
        <div className="max-w-[1800px] mx-auto px-5 py-5 grid lg:grid-cols-[1fr_520px] gap-7 items-end">
          <div>
            <div className="text-[10px] uppercase tracking-[.18em] text-emerald-300 font-semibold">Weekly allocation pressure</div>
            <h2 className="font-display text-[30px] leading-tight font-semibold mt-1">Sellout Intelligence</h2>
            <p className="text-[12px] text-slate-300 mt-2 max-w-2xl leading-relaxed">Find products that repeatedly exhaust their allocation, separate real shortages from volatile one-off allocations, and set the next volume or pricing test from twelve completed weeks.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-[10px] text-slate-400 font-mono">
              <span>Historical · {fmtShortDate(summary.period_from)}–{fmtShortDate(summary.period_to)}</span>
              <span>{summary.week_count} completed weeks</span>
              <span>WA · {data.source.timezone}</span>
              <span>Refreshed {sourceTime}</span>
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between gap-4">
              <div><span className="font-mono text-2xl font-semibold tabular-nums">{fmtN(recurring)}</span><span className="text-[10px] text-slate-400 ml-2">repeat shortage signals</span></div>
              <div className="text-right"><span className="font-mono text-lg font-semibold text-emerald-300 tabular-nums">{fmtN(fast)}</span><span className="text-[10px] text-slate-400 ml-2">fast / emerging</span></div>
            </div>
            <PressureStrip weeks={weeks} />
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-5 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden mb-4">
          {[
            ['Chronic sellouts', summary.chronic_sellout_count, 'High-confidence volume pressure'],
            ['Exact sellout 3+ weeks', summary.recurring_sellout_count, 'Includes volatile allocations'],
            ['Fast and emerging', summary.fast_mover_count, '90%+ sell-through pattern'],
            ['Slow movers', summary.slow_mover_count, 'Recent sell-through below 50%'],
          ].map(([label,value,note]) => <div key={label} className="bg-white px-4 py-3"><div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div><div className="flex items-baseline gap-2 mt-1"><span className="font-mono text-xl font-semibold tabular-nums">{fmtN(value)}</span><span className="text-[10px] text-slate-400">{note}</span></div></div>)}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex flex-wrap items-center gap-2 mb-3">
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search product, brand, or category" className="w-72 max-w-full text-xs" aria-label="Search sell-through products" />
          <select value={signal} onChange={e=>setSignal(e.target.value)} className="text-xs" aria-label="Filter by signal">
            <option value="All">All signals</option>{Object.keys(SIGNAL_ORDER).map(value=><option key={value}>{value}</option>)}
          </select>
          <select value={brand} onChange={e=>setBrand(e.target.value)} className="text-xs max-w-[190px]" aria-label="Filter by brand"><option value="All">All brands</option>{brands.map(value=><option key={value}>{value}</option>)}</select>
          <select value={category} onChange={e=>setCategory(e.target.value)} className="text-xs max-w-[230px]" aria-label="Filter by category"><option value="All">All categories</option>{categories.map(value=><option key={value}>{value}</option>)}</select>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600 ml-1"><input type="checkbox" checked={decisionReady} onChange={e=>setDecisionReady(e.target.checked)} /> Decision-ready only</label>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-500 tabular-nums">{fmtN(filtered.length)} products</span>
            <button className="btn btn-ghost" onClick={()=>exportSellThroughCsv(filtered)}>Download CSV</button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-315px)]">
            <table className="dt min-w-[1540px]">
              <thead><tr>
                <SortHead label="Product" field="product_name" sort={sort} setSort={setSort} />
                <SortHead label="Signal" field="priority" sort={sort} setSort={setSort} />
                <th className="text-left">Brand / category</th>
                <SortHead label="Sold out" field="soldout_weeks" sort={sort} setSort={setSort} align="right" />
                <SortHead label="90%+" field="near_sellout_weeks" sort={sort} setSort={setSort} align="right" />
                <SortHead label="Weighted" field="weighted_sell_through" sort={sort} setSort={setSort} align="right" />
                <SortHead label="Recent 4" field="recent_4_week_sell_through" sort={sort} setSort={setSort} align="right" />
                <th className="text-left">12-week pressure</th>
                <SortHead label="Median alloc." field="median_weekly_allocated" sort={sort} setSort={setSort} align="right" />
                <SortHead label="Avg sold" field="average_weekly_sold" sort={sort} setSort={setSort} align="right" />
                <SortHead label="Revenue/unit" field="realized_revenue_per_unit" sort={sort} setSort={setSort} align="right" />
                <SortHead label="Volume" field="volume_adjustment_pct" sort={sort} setSort={setSort} align="right" />
                <th className="text-left">Pricing</th>
              </tr></thead>
              <tbody>
                {visible.map(product => (
                  <tr key={product.product_id} onClick={()=>setPicked(product)} className="cursor-pointer" tabIndex="0" onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setPicked(product)}}>
                    <td className="max-w-[300px]"><div className="font-semibold text-slate-900 truncate" title={product.product_name}>{product.product_name}</div><div className="text-[9px] font-mono text-slate-400 mt-0.5">{product.weeks_available} weeks · {fmtN(product.total_sold_units)} sold</div></td>
                    <td><SignalPill signal={product.signal} /></td>
                    <td className="max-w-[210px]"><div className="truncate font-medium" title={product.brand_name}>{product.brand_name}</div><div className="truncate text-[9px] text-slate-400" title={product.category_name}>{product.category_name}</div></td>
                    <td className="text-right font-mono tabular-nums"><b className={product.soldout_weeks>=3?'text-rose-700':'text-slate-800'}>{product.soldout_weeks}</b><span className="text-slate-400">/{product.weeks_available}</span></td>
                    <td className="text-right font-mono tabular-nums">{product.near_sellout_weeks}</td>
                    <td className="text-right font-mono tabular-nums font-semibold">{fmtPct(product.weighted_sell_through)}</td>
                    <td className="text-right font-mono tabular-nums">{fmtPct(product.recent_4_week_sell_through)}</td>
                    <td><WeekCells product={product} weeks={weeks} compact /></td>
                    <td className="text-right font-mono tabular-nums">{fmtN(product.median_weekly_allocated)}</td>
                    <td className="text-right font-mono tabular-nums">{fmtN(product.average_weekly_sold)}</td>
                    <td className="text-right font-mono tabular-nums">{fmtMoney(product.realized_revenue_per_unit)}</td>
                    <td className={`text-right font-mono tabular-nums font-semibold ${product.volume_adjustment_pct>0?'text-rose-700':product.volume_adjustment_pct<0?'text-sky-700':'text-slate-500'}`}>{product.volume_adjustment_pct>0?'+':''}{product.volume_adjustment_pct}%</td>
                    <td className="text-[10px] text-slate-600 max-w-[170px]">{product.price_signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500">
            <span>Click a product for its weekly allocation history and recommendation evidence.</span>
            {limit < filtered.length && <button className="btn btn-ghost" onClick={()=>setLimit(value=>value+200)}>Show 200 more</button>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3 text-[10px] text-slate-500 leading-relaxed pb-5">
          <p className="max-w-3xl"><b className="text-slate-700">Decision rule:</b> exact sellout means allocated units were positive and unsold units reached zero. Recommendations require at least four available weeks and a median allocation of 25 units. Volatile allocations stay on hold even when some weeks sold out.</p>
          <a href={data.source.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 font-semibold">Open source API</a>
        </div>
      </div>

      {picked && <ProductDrawer product={picked} weeks={weeks} onClose={()=>setPicked(null)} />}
    </div>
  );
}

window.BambooSellThrough = { SellThroughPanel };
