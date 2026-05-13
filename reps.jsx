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
  // Min/max range filters for each numeric column on the high-priority stores table.
  // Empty string = no bound.
  const emptyRanges = { oppMin:'', oppMax:'', revMin:'', revMax:'', missMin:'', missMax:'', daysMin:'', daysMax:'', skuMin:'', skuMax:'' };
  const [ranges, setRanges] = useState(emptyRanges);
  const setRange = (k, v) => setRanges(r => ({...r, [k]: v}));
  const clearRanges = () => setRanges(emptyRanges);
  // Reset the tag filter + ranges when switching reps so a stale filter doesn't hide everything.
  React.useEffect(() => { setStoreTagFilter(''); setRanges(emptyRanges); }, [selected, repType]);
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

  // For the selected rep — top individual products in their leading categories
  // (global ranking, not per-rep attribution; we don't have product × client data)
  const repProducts = useMemo(() => {
    if (!sel || !repBook) return [];
    const topCats = new Set(repBook.cats.slice(0, 4).map(c => c.cat));
    return (a.products || [])
      .filter(p => topCats.has(p.c))
      .sort((x, y) => y.rev - x.rev)
      .slice(0, 25);
  }, [sel, repBook, a.products]);

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="font-display text-[16px] font-semibold tracking-tight">{sel.name} <span className="text-slate-400 italic">— top SKU groups</span></h3>
              <div className="text-[10px] font-mono text-slate-500 small-caps">attributed via this {repType === 'sr' ? 'sales rep' : 'VMI rep'}'s clients · click to open</div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th className="text-right" style={{width: 36}}>#</th>
                    <th>SKU Group</th>
                    <th>Category</th>
                    <th>Tag</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Units</th>
                    <th className="text-right">Stores</th>
                  </tr>
                </thead>
                <tbody>
                  {repBook.topSkus.slice(0, 25).map((row, i) => (
                    <tr key={row.sku.i} onClick={() => onPickSku && onPickSku(row.sku.i, sel ? {repFilter: sel.name, repType} : null)} className="cursor-pointer">
                      <td className="text-right tabular-nums font-mono text-slate-500">{i + 1}</td>
                      <td className="truncate max-w-[220px]" title={row.sku.n}>{row.sku.n}</td>
                      <td><span className="pill" style={{background: 'rgba(11,18,32,.04)', color: '#374151', borderColor: '#e5e7eb'}}>{row.sku.c}</span></td>
                      <td><Tag tag={row.sku.tag} /></td>
                      <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(row.rev)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(row.u)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-500">{row.stores}/{sel.stores}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="font-display text-[16px] font-semibold tracking-tight">Top Products to Pitch <span className="text-slate-400 italic">— in {sel.name}'s lead categories ({repType === 'sr' ? 'sales rep' : 'VMI rep'})</span></h3>
              <div className="text-[10px] font-mono text-slate-500 small-caps">individual SKUs · global rank within rep's top categories</div>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th className="text-right" style={{width: 36}}>#</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>SKU Group</th>
                    <th>Category</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {repProducts.map((p, i) => {
                    const groupName = a.skuById.get(p.sg)?.n || '—';
                    const carried = repBook.carrying.has(p.sg);
                    return (
                      <tr key={p.i} onClick={() => onPickSku && onPickSku(p.sg, sel ? {repFilter: sel.name, repType} : null)} className="cursor-pointer">
                        <td className="text-right tabular-nums font-mono text-slate-500">{i + 1}</td>
                        <td className="truncate max-w-[220px]" title={p.n}>
                          {p.n}
                          {!carried && <span className="ml-1.5 text-[9px] font-mono text-amber-600 small-caps">opp</span>}
                        </td>
                        <td className="text-slate-600">{p.b || <span className="text-slate-300">—</span>}</td>
                        <td className="truncate max-w-[160px] text-slate-500" title={groupName}>{groupName}</td>
                        <td><span className="pill" style={{background: 'rgba(11,18,32,.04)', color: '#374151', borderColor: '#e5e7eb'}}>{p.c}</span></td>
                        <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(p.rev)}</td>
                        <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(p.u)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
        // Range helpers — empty string = no bound
        const gte = (v, s) => s === '' ? true : v >= parseFloat(s);
        const lte = (v, s) => s === '' ? true : v <= parseFloat(s);
        const passesRange = (c) => (
          gte(c.oppScore || 0,        ranges.oppMin)  && lte(c.oppScore || 0,        ranges.oppMax)  &&
          gte(c.rev || 0,             ranges.revMin)  && lte(c.rev || 0,             ranges.revMax)  &&
          gte(c.missedRev || 0,       ranges.missMin) && lte(c.missedRev || 0,       ranges.missMax) &&
          gte(c.daysSinceOrder ?? 9999, ranges.daysMin) && lte(c.daysSinceOrder ?? 9999, ranges.daysMax) &&
          gte(c.skusCarried || 0,     ranges.skuMin)  && lte(c.skusCarried || 0,     ranges.skuMax)
        );
        const top      = (storeTagFilter
                          ? repClients.filter(c => c.storeTag === storeTagFilter && passesRange(c))
                          : repClients.filter(passesRange));
        const anyRange = Object.values(ranges).some(v => v !== '');

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
                <div className="text-[10px] font-mono text-slate-500 small-caps">{top.length}{top.length !== repClients.length ? ` of ${repClients.length}` : ''} stores{storeTagFilter ? ` · ${storeTagFilter}` : ''}{anyRange ? ' · ranges applied' : ''} · sorted by opp</div>
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
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-3 flex-wrap text-[10px] font-mono">
                <span className="uppercase tracking-wider text-slate-500 font-semibold">Min/Max:</span>
                {[
                  ['Opp',    'oppMin',  'oppMax',  '0-100'],
                  ['Rev $',  'revMin',  'revMax',  '$'],
                  ['Miss $', 'missMin', 'missMax', '$'],
                  ['Days',   'daysMin', 'daysMax', 'd'],
                  ['SKUs',   'skuMin',  'skuMax',  '#'],
                ].map(([label, kMin, kMax, hint]) => (
                  <span key={kMin} className="inline-flex items-center gap-1">
                    <span className="text-slate-600">{label}</span>
                    <input type="number" placeholder="min" value={ranges[kMin]} onChange={e => setRange(kMin, e.target.value)}
                           className="text-[10px] w-14 py-0.5 px-1.5" title={`Minimum ${label} (${hint})`} />
                    <span className="text-slate-300">–</span>
                    <input type="number" placeholder="max" value={ranges[kMax]} onChange={e => setRange(kMax, e.target.value)}
                           className="text-[10px] w-14 py-0.5 px-1.5" title={`Maximum ${label} (${hint})`} />
                  </span>
                ))}
                {anyRange && (
                  <button onClick={clearRanges} className="text-slate-500 hover:text-slate-900 underline decoration-dotted">
                    clear ranges
                  </button>
                )}
              </div>
              <table className="dt">
                <thead>
                  <tr>
                    <th className="text-right" style={{width: 36}}>#</th>
                    <th>Store</th>
                    <th className="text-right">Opp score</th>
                    <th className="text-right">Revenue</th>
                    <th className="text-right">Missed $</th>
                    <th className="text-right">Last order</th>
                    <th className="text-right">SKUs</th>
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
