/* eslint-disable */
const { useState, useEffect, useMemo } = React;
const { fmt$, fmtN, fmtPct } = window.BambooCore;
const { Tag } = window.BambooUI;

// ============================================================
//   CLOSURES TAB — track "void closures" (new SKU placements)
// ============================================================
//
// A "closure" = a (store, SKU group) pair that had zero revenue
// yesterday and positive revenue today. Detected by the daily
// diff cron (scripts/diff_closures.py) and appended to
// data/closures.json with both Sales Rep and VMI Rep attribution.
//
// This tab loads closures.json, filters by date range / rep /
// search, and exports CSV for reporting up the chain.

function ClosuresPanel({a}) {
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState(null);

  const [repType, setRepType] = useState('sr');       // 'sr' | 'vr'
  const [repFilter, setRepFilter] = useState('All');
  const [range, setRange] = useState('30d');          // '7d' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({key: 'ts', dir: 'desc'});

  useEffect(() => {
    fetch('data/closures.json?v=' + (window.__BAMBOO_BUILD || Date.now()), {cache: 'no-cache'})
      .then(r => r.ok ? r.json() : [])
      .then(setClosures)
      .catch(e => { setError(String(e)); setClosures([]); });
  }, []);

  // Resolve the active date range to [from, to] inclusive
  const [dateFrom, dateTo] = useMemo(() => {
    const today = new Date();
    const toIso = today.toISOString().slice(0, 10);
    const days = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    if (range === 'all')    return ['0000-01-01', '9999-12-31'];
    if (range === '7d')     return [days(7), toIso];
    if (range === '30d')    return [days(30), toIso];
    if (range === '90d')    return [days(90), toIso];
    if (range === 'mtd')    return [today.toISOString().slice(0,8)+'01', toIso];
    if (range === 'qtd') {
      const q = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), q, 1);
      return [start.toISOString().slice(0, 10), toIso];
    }
    if (range === 'ytd')    return [today.getFullYear() + '-01-01', toIso];
    if (range === 'custom') return [customFrom || '0000-01-01', customTo || '9999-12-31'];
    return ['0000-01-01', '9999-12-31'];
  }, [range, customFrom, customTo]);

  // Build the rep dropdown from the LIVE analytics roster (all reps, even those
  // with no closures yet) PLUS any names that show up in historical closures
  // (covering reps who left but have past attribution).
  const repOptions = useMemo(() => {
    const s = new Set();
    if (a && a.clients) {
      for (const cl of a.clients) {
        const k = cl[repType] || 'Unassigned';
        if (k) s.add(k);
      }
    }
    if (closures) {
      for (const c of closures) {
        const k = c[repType] || 'Unassigned';
        if (k) s.add(k);
      }
    }
    return ['All', ...[...s].sort()];
  }, [closures, repType, a]);

  // Lookup: rep name -> number of stores assigned today (for the dropdown counts)
  const repStoreCounts = useMemo(() => {
    const out = {};
    if (a && a.clients) {
      for (const cl of a.clients) {
        const k = cl[repType] || 'Unassigned';
        out[k] = (out[k] || 0) + 1;
      }
    }
    return out;
  }, [a, repType]);

  React.useEffect(() => { setRepFilter('All'); }, [repType]);

  const filtered = useMemo(() => {
    if (!closures) return [];
    let arr = closures.filter(c => c.ts >= dateFrom && c.ts <= dateTo);
    if (repFilter !== 'All') arr = arr.filter(c => (c[repType] || 'Unassigned') === repFilter);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(c =>
        (c.clientName || '').toLowerCase().includes(q) ||
        (c.skuName || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q)
      );
    }
    const k = sort.key, m = sort.dir === 'asc' ? 1 : -1;
    arr.sort((x, y) => {
      const xv = x[k], yv = y[k];
      if (typeof xv === 'string') return (xv || '').localeCompare(yv || '') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [closures, dateFrom, dateTo, repFilter, repType, search, sort]);

  // Per-rep summary (within current date range)
  const repSummary = useMemo(() => {
    if (!closures) return [];
    const inRange = closures.filter(c => c.ts >= dateFrom && c.ts <= dateTo);
    const map = new Map();
    for (const c of inRange) {
      const k = c[repType] || 'Unassigned';
      if (!map.has(k)) map.set(k, {name: k, count: 0, rev: 0, units: 0, stores: new Set(), skus: new Set()});
      const r = map.get(k);
      r.count += 1; r.rev += c.rev || 0; r.units += c.units || 0;
      r.stores.add(c.client); r.skus.add(c.sku);
    }
    return [...map.values()].map(r => ({...r, stores: r.stores.size, skus: r.skus.size}))
      .sort((x, y) => y.rev - x.rev);
  }, [closures, dateFrom, dateTo, repType]);

  // Aggregate totals
  const totals = useMemo(() => {
    const rev = filtered.reduce((s, c) => s + (c.rev || 0), 0);
    const units = filtered.reduce((s, c) => s + (c.units || 0), 0);
    const stores = new Set(filtered.map(c => c.client)).size;
    const skus = new Set(filtered.map(c => c.sku)).size;
    return {count: filtered.length, rev, units, stores, skus};
  }, [filtered]);

  const click = (k) => setSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}));
  const Th = ({k, label, align='left', hint}) => (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} title={hint} onClick={() => click(k)}>
      <span className="inline-flex items-center gap-1">{label}<span className="text-[8px] text-slate-300">{sort.key===k?(sort.dir==='asc'?'▲':'▼'):'▴▾'}</span></span>
    </th>
  );

  const exportCsv = () => {
    const rows = [['Date','Store','SKU Group','Category','Revenue','Units','Sales Rep','VMI Rep'].join(',')];
    for (const c of filtered) {
      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      };
      rows.push([c.ts, c.clientName, c.skuName, c.category, c.rev, c.units, c.sr, c.vr].map(esc).join(','));
    }
    const blob = new Blob([rows.join('\n')], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `closures-${dateFrom}-to-${dateTo}${repFilter !== 'All' ? '-' + repFilter.replace(/\s+/g, '_') : ''}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (closures === null) return <div className="p-6 text-[12px] text-slate-500 font-mono">Loading closures…</div>;

  const empty = closures.length === 0;

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Void Closures <span className="italic text-emerald-700">— new SKU placements</span></h2>
            <div className="text-[10px] font-mono text-slate-500 small-caps mt-0.5">
              {empty
                ? `no closures recorded yet — ${fmtN(repOptions.length - 1)} ${repType==='sr'?'sales':'VMI'} reps in roster · daily refresh will populate this list`
                : `${fmtN(closures.length)} total closures recorded · ${fmtN(filtered.length)} in current view · ${fmtN(repOptions.length - 1)} ${repType==='sr'?'sales':'VMI'} reps in roster`}
            </div>
          </div>
          <button onClick={exportCsv} disabled={filtered.length === 0}
                  className="btn btn-emerald" title="Download filtered rows as CSV">
            ↓ Export CSV ({filtered.length})
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Range</span>
            <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
              {[['7d','7d'],['30d','30d'],['90d','90d'],['mtd','MTD'],['qtd','QTD'],['ytd','YTD'],['all','All'],['custom','Custom']].map(([k,l]) => (
                <button key={k} onClick={() => setRange(k)}
                        className={`px-2 py-0.5 rounded ${range===k?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{l}</button>
              ))}
            </div>
            {range === 'custom' && (
              <span className="flex items-center gap-1 text-[11px]">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-[11px]" />
                <span className="text-slate-400">to</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="text-[11px]" />
              </span>
            )}
            <span className="text-[10px] font-mono text-slate-400 ml-2">{dateFrom} → {dateTo}</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Rep</span>
            <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
              {[['sr','Sales'],['vr','VMI']].map(([k,l]) => (
                <button key={k} onClick={() => setRepType(k)}
                        className={`px-2 py-0.5 rounded ${repType===k?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{l}</button>
              ))}
            </div>
            <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="text-[11px]" style={{maxWidth: 260}}>
              {repOptions.map(r => {
                if (r === 'All') return <option key={r} value={r}>{repType==='sr'?'All sales reps':'All VMI reps'} ({fmtN(repOptions.length - 1)})</option>;
                const cnt = repStoreCounts[r];
                return <option key={r} value={r}>{r}{cnt ? ` — ${cnt} stores` : ''}</option>;
              })}
            </select>
            <input type="search" placeholder="Search store, SKU, or category…"
                   value={search} onChange={e => setSearch(e.target.value)}
                   className="text-[11px] flex-1 min-w-[200px]" />
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Closures</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.count)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Revenue Captured</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-emerald-700 mt-0.5">{fmt$(totals.rev)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Units</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.units)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Unique Stores</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.stores)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Unique SKU Groups</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.skus)}</div>
        </div>
      </div>

      {empty ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <h3 className="font-display text-[16px] font-semibold text-slate-700 mb-2">No closures recorded yet</h3>
          <p className="text-[12px] text-slate-500 max-w-md mx-auto leading-relaxed">
            Closures appear here once the daily data refresh detects new placements.
            Wire <span className="font-mono">scripts/diff_closures.py</span> into your cron job — it compares yesterday's dataset against today's and appends any new (store × SKU group) placements to <span className="font-mono">data/closures.json</span>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Main closure table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold small-caps flex items-center gap-2">
                Closure log
                <span className="text-slate-400 normal-case font-normal">— click column to sort</span>
                <span className="ml-auto font-mono text-slate-700">{filtered.length} rows</span>
              </h3>
            </div>
            <div className="overflow-auto" style={{maxHeight: '70vh'}}>
              <table className="dt">
                <thead>
                  <tr>
                    <Th k="ts" label="Date" />
                    <Th k="clientName" label="Store" />
                    <Th k="skuName" label="SKU Group" />
                    <Th k="category" label="Category" />
                    <Th k="rev" label="Revenue" align="right" />
                    <Th k="units" label="Units" align="right" />
                    <Th k="sr" label="Sales Rep" />
                    <Th k="vr" label="VMI Rep" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={i}>
                      <td className="font-mono tabular-nums text-[10px] text-slate-600">{c.ts}</td>
                      <td className="truncate max-w-[220px]" title={c.clientName}>{c.clientName}</td>
                      <td className="truncate max-w-[200px]" title={c.skuName}>{c.skuName}</td>
                      <td><span className="pill" style={{background: 'rgba(11,18,32,.04)', color: '#374151', borderColor: '#e5e7eb'}}>{c.category}</span></td>
                      <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(c.rev)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(c.units)}</td>
                      <td className="truncate max-w-[140px] text-slate-700">{c.sr}</td>
                      <td className="truncate max-w-[140px] text-slate-700">{c.vr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right rail: per-rep summary */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden h-fit">
            <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold small-caps">
                {repType === 'sr' ? 'Sales Reps' : 'VMI Reps'} <span className="text-slate-400 normal-case font-normal">— in range</span>
              </h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
              {/* Merge analytics roster with closure-derived summary so reps with 0 closures still appear */}
              {(() => {
                const have = new Set(repSummary.map(r => r.name));
                const padded = [...repSummary];
                for (const name of repOptions) {
                  if (name === 'All') continue;
                  if (!have.has(name)) padded.push({name, count: 0, rev: 0, stores: 0, skus: 0, _empty: true});
                }
                padded.sort((x, y) => y.rev - x.rev || x.name.localeCompare(y.name));
                if (padded.length === 0) return <div className="p-4 text-[11px] text-slate-400">No reps in roster.</div>;
                return padded.map(r => {
                  const sel = repFilter === r.name;
                  return (
                    <button key={r.name} onClick={() => setRepFilter(sel ? 'All' : r.name)}
                            className={`w-full text-left px-3 py-2 transition ${sel ? 'bg-emerald-50' : 'hover:bg-slate-50'} ${r._empty ? 'opacity-60' : ''}`}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-[12px] font-semibold ${sel ? 'text-emerald-900' : 'text-slate-800'}`}>{r.name}</span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-700">{r.count}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {r._empty ? <span className="text-slate-400">no closures in range · {repStoreCounts[r.name] || 0} stores</span> : <>{fmt$(r.rev)} · {r.stores} stores · {r.skus} skus</>}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.BambooClosures = { ClosuresPanel };
