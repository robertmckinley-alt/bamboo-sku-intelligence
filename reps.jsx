/* eslint-disable */
const { useMemo, useState } = React;
const { fmt$, fmtN, fmtPct, fmtNum } = window.BambooCore;
const { Tag, ScoreBar } = window.BambooUI;

// ============================================================
//   REPS TAB — sales rep performance with product drill-down
// ============================================================
//
// Per-rep aggregation:
//   • Stores assigned (clients[].sr matches rep name)
//   • Total revenue, units, orders, avg AOV across their book
//   • Top SKU groups for their book — computed by summing matrix
//     rows where the client belongs to the rep
//   • Top individual products in their dominant categories
//     (drawn from data.products[] filtered by category)
//
// The matrix is sku-group × client; we don't have product × client
// attribution, so individual product context is global within the
// categories the rep already covers — useful as a "what to pitch"
// reference, not a hard attribution.
function RepsPanel({a, onPickClient, onPickSku, onExportRep}) {
  const [selected, setSelected] = useState(null);
  // 'sr' = Sales Rep (default), 'vr' = VMI Rep
  const [repType, setRepType] = useState('sr');
  const [storeTagFilter, setStoreTagFilter] = useState('');  // empty = show all; otherwise a tag name
  // High-priority stores table sort. Default: opp score, descending.
  const [storeSort, setStoreSort] = useState({key: 'oppScore', dir: 'desc'});
  // Reset the tag filter + sort when switching reps so a stale filter doesn't hide everything.
  React.useEffect(() => { setStoreTagFilter(''); setStoreSort({key: 'oppScore', dir: 'desc'}); }, [selected, repType]);
  const drilldownRef = React.useRef(null);

  // When a rep is picked, scroll the drilldown (store list etc.) into view.
  const pickRep = (name) => {
    setSelected(name);
    requestAnimationFrame(() => {
      const el = drilldownRef.current;
      if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
  };

  // When the rep type changes, clear the selected rep so we don't try to
  // look up a sales-rep name in the VMI-rep aggregation (or vice versa).
  React.useEffect(() => { setSelected(null); }, [repType]);

  // Aggregate per rep — keyed by either cl.sr (sales rep) or cl.vr (VMI rep)
  const reps = useMemo(() => {
    const map = new Map();
    for (const cl of a.clients) {
      const key = cl[repType] || 'Unassigned';
      if (!map.has(key)) {
        map.set(key, {
          name: key, stores: 0, revenue: 0, units: 0, orders: 0,
          missedRev: 0, missingTopCount: 0, oppScoreSum: 0, clientIds: [],
          atRisk: 0, highValue: 0,
        });
      }
      const r = map.get(key);
      r.stores += 1;
      r.revenue += cl.rev || 0;
      r.units += cl.u || 0;
      r.orders += cl.o || 0;
      r.missedRev += cl.missedRev || 0;
      r.missingTopCount += cl.missingTopCount || 0;
      r.oppScoreSum += cl.oppScore || 0;
      r.clientIds.push(cl.i);
      if (cl.storeTag === 'AT RISK') r.atRisk += 1;
      if (cl.storeTag === 'CALL NOW') r.highValue += 1;
    }
    const arr = [...map.values()];
    for (const r of arr) {
      r.aov = r.orders ? r.revenue / r.orders : 0;
      r.oppScore = r.stores ? r.oppScoreSum / r.stores : 0;
    }
    arr.sort((x, y) => y.revenue - x.revenue);
    return arr;
  }, [a, repType]);

  const sel = useMemo(
    () => reps.find(r => r.name === selected) || reps[0],
    [reps, selected]
  );

  // For the selected rep — top SKU groups computed from the matrix
  // rows that belong to their clients
  const repBook = useMemo(() => {
    if (!sel) return null;
    const clientSet = new Set(sel.clientIds);
    const bySku = new Map();   // skuId -> {rev, u, stores}
    const byCat = new Map();   // hi-level cat -> {rev, u, stores: Set}
    const carrying = new Set(); // skuIds the rep has placement for
    for (const m of a.matrixRaw) {
      if (!clientSet.has(m.c)) continue;
      const sku = a.skuById.get(m.s);
      if (!sku) continue;
      if (!bySku.has(m.s)) bySku.set(m.s, {sku, rev: 0, u: 0, stores: 0});
      const b = bySku.get(m.s);
      b.rev += m.r || 0; b.u += m.u || 0;
      if ((m.r || 0) > 0) { b.stores += 1; carrying.add(m.s); }
      if (!byCat.has(sku.c)) byCat.set(sku.c, {rev: 0, u: 0, skus: new Set()});
      const c = byCat.get(sku.c);
      c.rev += m.r || 0; c.u += m.u || 0; c.skus.add(m.s);
    }
    const topSkus = [...bySku.values()].sort((x, y) => y.rev - x.rev);
    const cats = [...byCat.entries()].map(([k, v]) => ({cat: k, rev: v.rev, u: v.u, skuCount: v.skus.size}))
      .sort((x, y) => y.rev - x.rev);
    return {topSkus, cats, carrying};
  }, [sel, a]);

  const maxRev = reps[0]?.revenue || 1;

  if (!reps.length) {
    return <div className="p-6 text-[12px] text-slate-500">No rep data.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-[18px] font-semibold tracking-tight">{repType === 'sr' ? 'Sales Reps' : 'VMI Reps'}</h2>
            <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
              {[['sr','Sales Rep'],['vr','VMI Rep']].map(([k,l]) => (
                <button key={k} onClick={() => setRepType(k)}
                        className={`px-2.5 py-0.5 rounded ${repType===k ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
              ))}
            </div>
          </div>
          <span className="text-[10px] font-mono text-slate-500 small-caps">{reps.length} {repType === 'sr' ? 'sales reps' : 'VMI reps'} · click a card to open their store list</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {reps.map(r => (
            <div key={r.name}
                 onClick={() => pickRep(r.name)}
                 className={`bg-white border rounded-lg overflow-hidden cursor-pointer transition ${sel?.name===r.name ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'}`}
                 style={{boxShadow: '0 1px 0 rgba(15,23,42,.04)'}}>
              <div className="px-4 py-3 border-b border-slate-200">
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-display text-[15px] font-semibold tracking-tight truncate" title={r.name}>{r.name}</h3>
                  <span className="text-[9px] font-mono text-slate-400 small-caps">{r.stores} stores</span>
                </div>
                <div className="font-mono tabular-nums text-[16px] font-semibold text-slate-900">{fmt$(r.revenue)}</div>
                <div className="text-[10px] font-mono text-slate-500 tabular-nums mt-0.5">
                  {fmtPct(r.revenue / a.meta.totalRevenue, 1)} of network · {fmtN(r.units)}u · {r.orders} orders · AOV {fmt$(r.aov)}
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                      <div className="h-full" style={{width: ((r.revenue/maxRev)*100)+'%', background: 'linear-gradient(90deg,#34d399,#047857)'}}></div>
                    </div>
                    <span className="font-mono tabular-nums text-[10px] text-slate-500 w-12 text-right">{fmt$(r.missedRev)}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">missed-rev opportunity</div>
                </div>
              </div>
              <div className="px-4 py-2 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-600">
                <span>Avg opp <b className="text-slate-800">{r.oppScore.toFixed(0)}</b></span>
                {r.highValue > 0 && <span className="text-emerald-700">{r.highValue} call-now</span>}
                {r.atRisk > 0 && <span className="text-rose-700">{r.atRisk} at risk</span>}
                <button onClick={(e) => { e.stopPropagation(); onExportRep && onExportRep(r.name, repType); }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-900 hover:text-white rounded transition">📄 Print</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div ref={drilldownRef} />
      {sel && repBook && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-display text-[16px] font-semibold tracking-tight">{sel.name} <span className="text-slate-400 italic">— top SKU groups</span></h3>
            <div className="text-[10px] font-mono text-slate-500 small-caps">attributed via this {repType === 'sr' ? 'sales rep' : 'VMI rep'}'s clients · click to open</div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th className="text-right" style={{width: 36}}>#</th>
                  <th>SKU Group</th>
                  <th>Category</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Stores</th>
                  <th className="text-right" title="Penetration across this rep's stores">Rep %</th>
                  <th className="text-right" title="Global penetration across the full network">Net %</th>
                  <th className="text-right" title="Global penetration goal (from goal sheet)">Goal</th>
                  <th className="text-right" title="Stores in this rep's book still needed to hit the goal across their base">To Goal</th>
                </tr>
              </thead>
              <tbody>
                {repBook.topSkus.slice(0, 25).map((row, i) => {
                  // Rep-scoped penetration: % of THIS rep's stores carrying the group.
                  const repPenet = sel.stores ? row.stores / sel.stores : 0;
                  const goal = row.sku.distGoal;
                  const overGoal = goal != null && repPenet >= goal;
                  const penetClass = repPenet>=0.7?'text-emerald-700':repPenet>=0.4?'text-amber-700':'text-rose-700';
                  const goalClass = goal == null ? 'text-slate-400'
                    : overGoal ? 'text-emerald-700'
                    : (goal - repPenet) <= 0.10 ? 'text-amber-700'
                    : 'text-rose-700';
                  const need = goal != null ? Math.max(0, Math.ceil(goal * sel.stores) - row.stores) : null;
                  const needClass = need == null ? 'text-slate-400' : need === 0 ? 'text-emerald-700' : need >= 10 ? 'text-rose-700' : 'text-amber-700';
                  return (
                    <tr key={row.sku.i} onClick={() => onPickSku && onPickSku(row.sku.i, sel ? {repFilter: sel.name, repType} : null)} className="cursor-pointer">
                      <td className="text-right tabular-nums font-mono text-slate-500">{i + 1}</td>
                      <td className="truncate max-w-[220px]" title={row.sku.n}>{row.sku.n}</td>
                      <td><span className="pill" style={{background: 'rgba(11,18,32,.04)', color: '#374151', borderColor: '#e5e7eb'}}>{row.sku.c}</span></td>
                      <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(row.rev)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(row.u)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-500">{row.stores}/{sel.stores}</td>
                      <td className={`text-right tabular-nums font-mono ${penetClass}`}>{fmtPct(repPenet, 0)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-500" title={`Network: ${row.sku.stores}/${a.clients.length} stores`}>{fmtPct(row.sku.distPct, 0)}</td>
                      <td className={`text-right tabular-nums font-mono ${goalClass}`} title={goal != null ? `Global goal: ${(goal*100).toFixed(0)}%` : 'No goal set'}>
                        {goal == null ? '—' : fmtPct(goal, 0)}
                      </td>
                      <td className={`text-right tabular-nums font-mono ${needClass}`} title={goal != null ? `Stores in ${sel.name}'s book still needed for ${(goal*100).toFixed(0)}% goal` : ''}>
                        {need == null ? '—' : (need === 0 ? '✓' : '+' + need)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sel && (() => {
        // Pull this rep's clients, sort by opp score, show as a high-priority list.
        const repClients = a.clients
          .filter(c => sel.clientIds.includes(c.i))
          .slice()
          .sort((x, y) => (y.oppScore || 0) - (x.oppScore || 0));
        const callNow  = repClients.filter(c => c.storeTag === 'CALL NOW');
        const atRisk   = repClients.filter(c => c.storeTag === 'AT RISK');
        const highUp   = repClients.filter(c => c.storeTag === 'HIGH UPSIDE');
        const crossSell= repClients.filter(c => c.storeTag === 'CROSS-SELL');
        let top = storeTagFilter
          ? repClients.filter(c => c.storeTag === storeTagFilter)
          : repClients.slice();
        // Apply column sort
        const k = storeSort.key, m = storeSort.dir === 'asc' ? 1 : -1;
        top.sort((x, y) => {
          let xv, yv;
          if (k === 'name') { xv = x.n || ''; yv = y.n || ''; }
          else if (k === 'days') { xv = x.daysSinceOrder ?? 9999; yv = y.daysSinceOrder ?? 9999; }
          else if (k === 'skus') { xv = x.skusCarried || 0; yv = y.skusCarried || 0; }
          else { xv = x[k] || 0; yv = y[k] || 0; }
          if (typeof xv === 'string') return (xv || '').localeCompare(yv || '') * m;
          return (xv - yv) * m;
        });
        const StoreTh = ({k, label, align='left', hint}) => (
          <th className={`sortable ${align==='right'?'text-right':'text-left'}`} title={hint}
              onClick={() => setStoreSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}))}>
            <span className="inline-flex items-center gap-1">{label}
              <span className={`text-[8px] ${storeSort.key===k?'text-slate-700':'text-slate-300'}`}>
                {storeSort.key===k ? (storeSort.dir==='asc'?'▲':'▼') : '▴▾'}
              </span>
            </span>
          </th>
        );

        const tagColor = (t) => {
          if (t === 'CALL NOW') return 'bg-emerald-600 text-white';
          if (t === 'AT RISK') return 'bg-rose-50 text-rose-800 border border-rose-200';
          if (t === 'HIGH UPSIDE') return 'bg-blue-50 text-blue-800 border border-blue-200';
          if (t === 'CROSS-SELL') return 'bg-amber-50 text-amber-800 border border-amber-200';
          return 'bg-slate-50 text-slate-600 border border-slate-200';
        };

        return (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-[16px] font-semibold tracking-tight">{sel.name} <span className="text-slate-400 italic">— high-priority stores</span></h3>
                <div className="text-[10px] font-mono text-slate-500 small-caps">{top.length}{top.length !== repClients.length ? ` of ${repClients.length}` : ''} stores{storeTagFilter ? ` · ${storeTagFilter}` : ''} · click any column to sort</div>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
                {(() => {
                  const chips = [
                    {tag: 'CALL NOW',    count: callNow.length,   label: 'call now',    cls: 'bg-emerald-600 text-white',                          selCls: 'ring-2 ring-emerald-800'},
                    {tag: 'AT RISK',     count: atRisk.length,    label: 'at risk',     cls: 'bg-rose-50 text-rose-800 border border-rose-200',     selCls: 'ring-2 ring-rose-500'},
                    {tag: 'HIGH UPSIDE', count: highUp.length,    label: 'high upside', cls: 'bg-blue-50 text-blue-800 border border-blue-200',     selCls: 'ring-2 ring-blue-500'},
                    {tag: 'CROSS-SELL',  count: crossSell.length, label: 'cross-sell',  cls: 'bg-amber-50 text-amber-800 border border-amber-200',  selCls: 'ring-2 ring-amber-500'},
                  ].filter(c => c.count > 0);
                  return chips.map(c => {
                    const isOn = storeTagFilter === c.tag;
                    return (
                      <button key={c.tag}
                              onClick={() => setStoreTagFilter(isOn ? '' : c.tag)}
                              className={`px-2 py-0.5 rounded transition cursor-pointer ${c.cls} ${isOn ? c.selCls : 'opacity-90 hover:opacity-100'}`}
                              title={isOn ? 'click to clear filter' : `click to filter to ${c.label}`}>
                        {c.count} {c.label}
                      </button>
                    );
                  });
                })()}
                {storeTagFilter && (
                  <button onClick={() => setStoreTagFilter('')}
                          className="text-slate-500 hover:text-slate-900 underline decoration-dotted">
                    clear
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th className="text-right" style={{width: 36}}>#</th>
                    <StoreTh k="name" label="Store" />
                    <StoreTh k="oppScore" label="Opp score" align="right" />
                    <StoreTh k="rev" label="Revenue" align="right" />
                    <StoreTh k="missedRev" label="Missed $" align="right" />
                    <StoreTh k="days" label="Last order" align="right" hint="Days since the store's last order" />
                    <StoreTh k="skus" label="SKUs" align="right" hint="SKU groups currently carried" />
                  </tr>
                </thead>
                <tbody>
                  {top.map((c, i) => {
                    const d = c.daysSinceOrder;
                    const lastTxt = d == null ? '—' : (d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d}d ago`);
                    const lastCls = d != null && d <= 7 ? 'text-emerald-700' : d != null && d >= 30 ? 'text-rose-700' : 'text-slate-500';
                    return (
                      <tr key={c.i} onClick={() => onPickClient && onPickClient(c.i)} className="cursor-pointer">
                        <td className="text-right tabular-nums font-mono text-slate-500">{i + 1}</td>
                        <td className="truncate max-w-[260px]" title={c.n}>{c.n}</td>
                        <td className="text-right tabular-nums font-mono">{(c.oppScore || 0).toFixed(0)}</td>
                        <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(c.rev)}</td>
                        <td className="text-right tabular-nums font-mono text-rose-700">{fmt$(c.missedRev || 0)}</td>
                        <td className={`text-right tabular-nums font-mono ${lastCls}`} title={c.ls || ''}>{lastTxt}</td>
                        <td className="text-right tabular-nums font-mono text-slate-500">{c.skusCarried}/{c.skusAll}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-[10px] font-mono text-slate-500 bg-slate-50 border-t border-slate-200">
              {storeTagFilter ? `Filtered to ${storeTagFilter}: ${top.length} of ${repClients.length} stores` : `Showing all ${top.length} stores`} · click any row to open the store drawer
            </div>
          </div>
        );
      })()}
    </div>
  );
}

window.BambooReps = { RepsPanel };
