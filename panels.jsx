/* eslint-disable */
const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = React;
const { fmt$, fmt$d, fmtN, fmtPct, fmtNum, parseLastOrder } = window.BambooCore;
const { Tag, TagChips, MiniBar, ScoreBar, Sparkline, Th, EmptyState } = window.BambooUI;

// ============================================================
//   DRAWER — shared overlay shell with backdrop blur + animation
// ============================================================
function Drawer({onClose, width=820, children}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="drawer-overlay fixed inset-0 z-40 flex justify-end backdrop-anim"
         style={{background: 'rgba(15,23,42,0.32)', backdropFilter: 'blur(8px) saturate(120%)', WebkitBackdropFilter: 'blur(8px) saturate(120%)'}}
         onClick={onClose}>
      <div className="drawer-anim bg-white h-full overflow-auto flex flex-col"
           style={{width: width+'px', maxWidth: '95vw', boxShadow: '-12px 0 48px rgba(15,23,42,.20)'}}
           onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
//   SKU DETAIL PANEL
// ============================================================
function SkuDetail({a, skuId, onClose, onPickClient, onAddCallSheet, focusClientId}) {
  const sku = a.skuById.get(skuId);
  const [nonCarrySort, setNonCarrySort] = useState({key: 'oppScore', dir: 'desc'});
  const [carrySort, setCarrySort] = useState({key: 'r', dir: 'desc'});
  const [pipelineIds, setPipelineIds] = useState(new Set());
  if (!sku) return null;

  const carriers = useMemo(() => {
    return (a.bySku.get(skuId) || []).filter(([c,r,u]) => r > 0)
      .map(([c,r,u]) => ({client: a.clients[c], r, u}));
  }, [a, skuId]);
  const sortedCarriers = useMemo(() => {
    const arr = [...carriers];
    const k = carrySort.key;
    const m = carrySort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      let xv = k === 'r' ? x.r : k === 'u' ? x.u : k === 'pct' ? x.r/(x.client.rev||1) : x.client[k];
      let yv = k === 'r' ? y.r : k === 'u' ? y.u : k === 'pct' ? y.r/(y.client.rev||1) : y.client[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [carriers, carrySort]);

  const carriedSet = new Set(carriers.map(x => x.client.i));
  const nonCarriers = useMemo(() => {
    const list = a.clients.filter(c => !carriedSet.has(c.i));
    const avgRevPerStore = a.meta.totalRevenue / a.clients.length;
    return list.map(c => {
      const sizeFactor = Math.min(2, Math.max(0.2, c.rev / Math.max(1, avgRevPerStore)));
      const adoption = Math.min(0.95, sku.distPct + 0.1); // probability proxy
      const est = sku.revPerStore * sizeFactor * adoption;
      const suggestedUnits = Math.round(sku.unitsPerStore * sizeFactor);
      return {client: c, est, suggestedUnits, adoption};
    });
  }, [a, sku, carriedSet]);

  const sortedNonCarriers = useMemo(() => {
    const arr = [...nonCarriers];
    const k = nonCarrySort.key;
    const m = nonCarrySort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      let xv = k === 'est' ? x.est : k === 'rev' ? x.client.rev : k === 'oppScore' ? x.client.oppScore : k === 'sr' ? x.client.sr : k === 'n' ? x.client.n : x.client[k];
      let yv = k === 'est' ? y.est : k === 'rev' ? y.client.rev : k === 'oppScore' ? y.client.oppScore : k === 'sr' ? y.client.sr : k === 'n' ? y.client.n : y.client[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [nonCarriers, nonCarrySort]);

  const totalOpp = nonCarriers.reduce((s, x) => s + x.est, 0);
  const highValMissing = nonCarriers.filter(x => x.client.storeTag === 'HIGH VALUE — CALL NOW' || x.client.oppScore >= 70);
  const highValOpp = highValMissing.reduce((s, x) => s + x.est, 0);

  const togglePipeline = (cid) => {
    const s = new Set(pipelineIds);
    if (s.has(cid)) s.delete(cid); else s.add(cid);
    setPipelineIds(s);
  };
  const exportPipeline = () => {
    if (onAddCallSheet) onAddCallSheet([...pipelineIds]);
  };

  const action = sku.tag === 'SCALE' ? {label:'EXPAND', text:`Push into the ${sku.distGap} stores not yet carrying. Velocity strong, reorder solid.`} :
                 sku.tag === 'PUSH'  ? {label:'PUSH', text:`High score, low distribution. Estimated $${fmtN(sku.oppEst)} captured by closing the gap.`} :
                 sku.tag === 'FIX'   ? {label:'FIX', text:'Reorder rate or velocity weak. Investigate price, packaging, or training before further placements.'} :
                 sku.tag === 'CUT'   ? {label:'CUT', text:'Bottom of score distribution. Consider deprecation or repositioning.'} :
                 {label:'MONITOR', text:'Steady performer. Watch for movement up or down.'};

  return (
    <Drawer onClose={onClose} width={920}>
      <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-start gap-3 z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-slate-500 small-caps">sku #{sku.rank} · {sku.c}</span>
            <Tag tag={sku.tag} />
            <span className="text-[10px] font-mono text-slate-400">percentile {fmtPct(sku.percentile,0)}</span>
          </div>
          <h2 className="font-display text-[20px] font-semibold tracking-tight leading-tight">{sku.n}</h2>
          <p className="text-[12px] text-slate-600 mt-1.5 leading-snug">
            Carried in <b className="text-slate-900">{sku.stores}</b> of <b>{a.clients.length}</b> stores ({fmtPct(sku.distPct,0)}).
            <b className="text-rose-700 ml-1">{sku.distGap} missing</b> ·
            <b className="text-emerald-700 ml-1">{highValMissing.length} high-value missing</b> stores worth
            <b className="text-emerald-700 ml-1">{fmt$(highValOpp)}</b> in projected revenue.
          </p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-2xl leading-none -mt-1" aria-label="Close">×</button>
      </div>

      <div className="px-5 py-3 grid grid-cols-6 gap-2 text-[11px] border-b border-slate-200 bg-slate-50">
        <Stat l="Score" v={sku.score.toFixed(0)} bar={<ScoreBar score={sku.score} height={4}/>} />
        <Stat l="Revenue" v={fmt$(sku.rev)} accent />
        <Stat l="Units" v={fmtN(sku.u)} />
        <Stat l="Distribution" v={fmtPct(sku.distPct,0)} sub={`${sku.stores}/${a.clients.length}`} />
        <Stat l="Velocity" v={fmtNum(sku.velocity,0)} sub="u/store/mo" />
        <Stat l="$ / store" v={fmt$(sku.revPerStore)} sub={`${fmtN(sku.unitsPerStore)}u/store`} />
        <Stat l="Reorder index" v={sku.reorderProxy.toFixed(2)} />
        <Stat l="Avg orders / buyer" v={fmtNum(sku.avgOrdersPerBuyer, 1)} />
        <Stat l="Distribution gap" v={sku.distGap} accentColor="text-rose-700" sub="stores" />
        <Stat l="Total opportunity" v={fmt$(totalOpp)} accentColor="text-emerald-700" />
        <Stat l="High-value missing $" v={fmt$(highValOpp)} accentColor="text-emerald-700" />
        <Stat l="Trend" v={sku.trend} />
      </div>

      <div className="px-5 py-3 border-b border-slate-200" style={{background: 'linear-gradient(to right, rgba(16,185,129,.06), white)'}}>
        <div className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1 small-caps font-semibold">Suggested action — {action.label}</div>
        <div className="text-[13px] text-slate-800 leading-snug">{action.text}</div>
      </div>

      {pipelineIds.size > 0 && (
        <div className="px-5 py-2.5 border-b border-slate-200 bg-emerald-50 flex items-center gap-3 sticky" style={{top: 84, zIndex: 8}}>
          <span className="text-[12px] text-emerald-900"><b>{pipelineIds.size}</b> store{pipelineIds.size===1?'':'s'} added to call-sheet pipeline</span>
          <button onClick={exportPipeline} className="btn btn-emerald ml-auto">📄 Export call sheet</button>
          <button onClick={() => setPipelineIds(new Set())} className="btn btn-ghost">clear</button>
        </div>
      )}

      <div className="grid grid-cols-2 divide-x divide-slate-200">
        <div className="overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-semibold flex justify-between sticky" style={{top: pipelineIds.size?142:84, zIndex:7}}>
            <span>Carrying ({carriers.length})</span>
            <span className="font-mono text-slate-700">{fmt$(sku.rev)}</span>
          </div>
          <table className="dt">
            <thead>
              <tr>
                <Th k="n" sort={carrySort} setSort={setCarrySort} label="Retailer" align="left" />
                <Th k="r" sort={carrySort} setSort={setCarrySort} label="Revenue" align="right" />
                <Th k="u" sort={carrySort} setSort={setCarrySort} label="Units" align="right" />
                <Th k="pct" sort={carrySort} setSort={setCarrySort} label="% of store" align="right" />
              </tr>
            </thead>
            <tbody>
              {sortedCarriers.map(({client, r, u}) => (
                <tr key={client.i} onClick={() => onPickClient(client.i)} className="cursor-pointer">
                  <td className="truncate max-w-[200px]">{client.n}</td>
                  <td className="text-right tabular-nums font-mono">{fmt$(r)}</td>
                  <td className="text-right tabular-nums font-mono text-slate-500">{fmtN(u)}</td>
                  <td className="text-right tabular-nums font-mono text-slate-500">{fmtPct(r/(client.rev||1),0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-600 font-semibold flex justify-between items-center sticky" style={{top: pipelineIds.size?142:84, zIndex:7}}>
            <span>NOT carrying ({nonCarriers.length})</span>
            <span className="font-mono text-emerald-700">opp {fmt$(totalOpp)}</span>
          </div>
          <table className="dt">
            <thead>
              <tr>
                <th style={{width: 24}}></th>
                <Th k="n" sort={nonCarrySort} setSort={setNonCarrySort} label="Retailer" align="left" />
                <Th k="oppScore" sort={nonCarrySort} setSort={setNonCarrySort} label="Opp" align="right" />
                <Th k="rev" sort={nonCarrySort} setSort={setNonCarrySort} label="Store $" align="right" />
                <Th k="est" sort={nonCarrySort} setSort={setNonCarrySort} label="Est $" align="right" />
                <Th k="sr" sort={nonCarrySort} setSort={setNonCarrySort} label="Rep" align="left" />
              </tr>
            </thead>
            <tbody>
              {sortedNonCarriers.map(({client, est}) => (
                <tr key={client.i} className={`cursor-pointer ${pipelineIds.has(client.i)?'selected':''} ${focusClientId===client.i?'selected':''}`}>
                  <td className="text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={pipelineIds.has(client.i)} onChange={() => togglePipeline(client.i)} className="cursor-pointer" />
                  </td>
                  <td className="truncate max-w-[180px]" onClick={() => onPickClient(client.i)}>
                    <div>{client.n}</div>
                    <div className="text-[9px] text-slate-400 -mt-0.5"><Tag tag={client.storeTag} size="sm"/></div>
                  </td>
                  <td className="text-right tabular-nums font-mono" onClick={() => onPickClient(client.i)}>{client.oppScore.toFixed(0)}</td>
                  <td className="text-right tabular-nums font-mono text-slate-500" onClick={() => onPickClient(client.i)}>{fmt$(client.rev)}</td>
                  <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold" onClick={() => onPickClient(client.i)}>{fmt$(est)}</td>
                  <td className="truncate max-w-[110px] text-slate-500" onClick={() => onPickClient(client.i)}>{client.sr || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ============== Individual Products in this SKU group ============== */}
        <SkuProductsSection a={a} sku={sku} />
      </div>
    </Drawer>
  );
}

function SkuProductsSection({a, sku}) {
  const products = useMemo(
    () => (a.products || []).filter(p => p.sg === sku.i).sort((x, y) => y.rev - x.rev),
    [a.products, sku.i]
  );
  const [expanded, setExpanded] = useState(false);
  if (!products.length) return null;
  const shown = expanded ? products : products.slice(0, 8);
  const total = products.reduce((s, p) => s + p.rev, 0);
  const top3Share = products.slice(0, 3).reduce((s, p) => s + p.rev, 0) / (total || 1);
  return (
    <div className="border-t border-slate-200 px-5 py-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display text-[15px] font-semibold tracking-tight">
          Individual Products <span className="text-slate-400 italic">— in this SKU group</span>
        </h3>
        <span className="text-[10px] font-mono text-slate-500 small-caps tabular-nums">
          {products.length} products · top 3 = {fmtPct(top3Share, 0)} of group rev
        </span>
      </div>
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="dt">
          <thead>
            <tr>
              <th className="text-right" style={{width: 36}}>#</th>
              <th>Product</th>
              <th>Brand</th>
              <th className="text-right">Revenue</th>
              <th className="text-right">Share</th>
              <th className="text-right">Units</th>
              <th className="text-right">Vel / mo</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.i}>
                <td className="text-right tabular-nums font-mono text-slate-500">{p.rkG}</td>
                <td className="truncate max-w-[260px]" title={p.n}>{p.n}</td>
                <td className="text-slate-600">{p.b || <span className="text-slate-300">—</span>}</td>
                <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(p.rev)}</td>
                <td className="text-right" style={{minWidth: 100}}>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                      <div className="h-full" style={{width: ((p.rev / (total||1)) * 100) + '%', background: 'linear-gradient(90deg,#34d399,#047857)'}}></div>
                    </div>
                    <span className="font-mono tabular-nums text-[10px] text-slate-600 w-8 text-right">{fmtPct(p.rev / (total||1), 1)}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(p.u)}</td>
                <td className="text-right tabular-nums font-mono text-slate-500">{fmtNum(p.vel, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {products.length > 8 && (
        <button onClick={() => setExpanded(e => !e)}
                className="mt-2 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900">
          {expanded ? '▴ Show top 8 only' : `▾ Show all ${products.length} products`}
        </button>
      )}
    </div>
  );
}

function Stat({l, v, sub, accent, accentColor, bar}) {
  return (
    <div className="bg-white px-2.5 py-2 rounded-md border border-slate-200">
      <div className="text-[9px] uppercase text-slate-500 tracking-wider small-caps">{l}</div>
      <div className={`font-mono tabular-nums mt-0.5 ${accentColor || (accent?'text-slate-900 font-semibold':'text-slate-800')} text-[13px] leading-tight`}>{v}</div>
      {sub && <div className="text-[9px] text-slate-400 mt-0.5 font-mono">{sub}</div>}
      {bar && <div className="mt-1.5">{bar}</div>}
    </div>
  );
}

// ============================================================
//   RETAILER DETAIL — STORE OPPORTUNITY DRAWER (centerpiece)
// ============================================================
function RetailerDetail({a, clientId, onClose, onPickSku, onExportCallSheet}) {
  const cl = a.clients[clientId];
  const [missingSort, setMissingSort] = useState({key: 'rank', dir: 'asc'});
  const [carrySort, setCarrySort] = useState({key: 'r', dir: 'desc'});
  const [bundleIds, setBundleIds] = useState(new Set());
  if (!cl) return null;

  const carrying = useMemo(() => {
    return (a.byClient.get(clientId) || []).filter(([s,r,u]) => r > 0)
      .map(([s,r,u]) => ({sku: a.skuById.get(s), r, u}))
      .filter(x => x.sku);
  }, [a, clientId]);
  const sortedCarrying = useMemo(() => {
    const arr = [...carrying];
    const k = carrySort.key;
    const m = carrySort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      const xv = k === 'r' ? x.r : k === 'u' ? x.u : k === 'rank' ? x.sku.rank : k === 'n' ? x.sku.n : x.sku[k];
      const yv = k === 'r' ? y.r : k === 'u' ? y.u : k === 'rank' ? y.sku.rank : k === 'n' ? y.sku.n : y.sku[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [carrying, carrySort]);

  // Missing — every top SKU not carried, plus all top-revenue SKUs
  const missing = useMemo(() => {
    const carriedSet = new Set(carrying.map(x => x.sku.i));
    const avgRevPerStore = a.meta.totalRevenue / a.clients.length;
    const sizeFactor = Math.min(2, Math.max(0.2, cl.rev / Math.max(1, avgRevPerStore)));
    return a.skusByScore.filter(s => !carriedSet.has(s.i)).map(s => {
      const adoption = Math.min(0.95, s.distPct + 0.1);
      const est = s.revPerStore * sizeFactor * adoption;
      return { sku: s, est, adoption, suggestedUnits: Math.round(s.unitsPerStore * sizeFactor) };
    });
  }, [a, cl, carrying]);

  const sortedMissing = useMemo(() => {
    const arr = [...missing];
    const k = missingSort.key;
    const m = missingSort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      const xv = k === 'rank' ? x.sku.rank : k === 'n' ? x.sku.n : k === 'c' ? x.sku.c : k === 'tag' ? x.sku.tag : k === 'rps' ? x.sku.revPerStore : k === 'est' ? x.est : k === 'sug' ? x.suggestedUnits : x.sku[k];
      const yv = k === 'rank' ? y.sku.rank : k === 'n' ? y.sku.n : k === 'c' ? y.sku.c : k === 'tag' ? y.sku.tag : k === 'rps' ? y.sku.revPerStore : k === 'est' ? y.est : k === 'sug' ? y.suggestedUnits : y.sku[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [missing, missingSort]);

  // Category gap data
  const categoryGap = useMemo(() => {
    const globalCatStats = {};
    for (const c of a.cats) {
      const skus = a.skus.filter(s => s.c === c);
      const totalSkus = skus.length;
      const carriedHere = carrying.filter(x => x.sku.c === c).length;
      // global avg: across all clients, how many of this category SKUs do they carry?
      let total = 0;
      for (const cl2 of a.clients) {
        const rs = a.byClient.get(cl2.i) || [];
        const skuIdsCarried = new Set(rs.filter(([s,r,u]) => r > 0).map(([s]) => s));
        const cnt = skus.filter(s => skuIdsCarried.has(s.i)).length;
        total += cnt;
      }
      const avgGlobal = total / a.clients.length;
      globalCatStats[c] = {
        totalSkus,
        carriedHere,
        carriedHerePct: totalSkus ? carriedHere / totalSkus : 0,
        avgGlobalPct: totalSkus ? avgGlobal / totalSkus : 0,
        rev: cl.catRev[c] || 0,
        underIndex: totalSkus ? (carriedHere / totalSkus) < (avgGlobal / totalSkus) * 0.7 : false,
      };
    }
    return globalCatStats;
  }, [a, cl, carrying]);

  const bundle = sortedMissing.slice(0, 10);
  const bundleLift = bundle.reduce((s, x) => s + x.est, 0);
  const days = parseLastOrder(cl.ls, a.meta.endDate);

  const toggleBundle = (sid) => {
    const s = new Set(bundleIds);
    if (s.has(sid)) s.delete(sid); else s.add(sid);
    setBundleIds(s);
  };

  return (
    <Drawer onClose={onClose} width={1080}>
      <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start gap-3 z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Tag tag={cl.storeTag} size="lg" />
            <span className="text-[11px] font-mono text-slate-500">License {cl.lic || '—'}</span>
            {days < 999 && <span className="text-[11px] font-mono text-slate-500">· last order {days}d ago</span>}
            <span className="text-[11px] font-mono text-slate-500">· opp score {cl.oppScore.toFixed(0)}</span>
          </div>
          <h2 className="font-display text-[22px] font-semibold tracking-tight leading-tight">{cl.n}</h2>
          <div className="text-[12px] text-slate-600 mt-1 grid grid-cols-3 gap-x-4">
            <span>Sales: <b className="text-slate-900">{cl.sr || '—'}</b></span>
            <span>VMI: <b className="text-slate-900">{cl.vr || '—'}</b></span>
            <span>Pricing: <b className="text-slate-900 truncate">{cl.pg || '—'}</b></span>
          </div>
        </div>
        <button onClick={() => onExportCallSheet([cl.i])} className="btn btn-emerald">📄 Call sheet</button>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-2xl leading-none" aria-label="Close">×</button>
      </div>

      {/* Performance block */}
      <div className="px-5 py-3 grid grid-cols-6 gap-2 text-[11px] border-b border-slate-200 bg-slate-50">
        <Stat l="Opportunity" v={cl.oppScore.toFixed(0)} bar={<ScoreBar score={cl.oppScore} height={4}/>} />
        <Stat l="Revenue" v={fmt$(cl.rev)} accent />
        <Stat l="Units" v={fmtN(cl.u)} />
        <Stat l="Orders" v={cl.o} sub={cl.orderFreq.toFixed(1)+' / mo'} />
        <Stat l="AOV" v={fmt$(cl.aov)} sub={`${fmtN(cl.avgOrderUnits)} u/order`} />
        <Stat l="SKUs" v={`${cl.skusCarried}/${cl.skusAll}`} sub={fmtPct(cl.skuPenetration,0)+' penetration'} />
        <Stat l="Categories" v={`${cl.catCount} of ${a.cats.length}`} />
        <Stat l="Last order" v={cl.ls || '—'} sub={days < 999 ? `${days}d ago` : '—'} />
        <Stat l="Missing top 30" v={cl.missingTopCount} accentColor="text-rose-700" />
        <Stat l="Missed $" v={fmt$(cl.missedRev)} accentColor="text-emerald-700" />
        <Stat l="Bundle lift (top 10)" v={fmt$(bundleLift)} accentColor="text-emerald-700" />
        <Stat l="Tenure" v={cl.tenureDays != null ? Math.round(cl.tenureDays/365*10)/10+' yr' : '—'} />
      </div>

      {/* Category gap chart */}
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-wider text-slate-600 font-semibold small-caps">Category Coverage <span className="text-slate-400 normal-case">— this store vs global avg</span></h3>
          <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#0b1220'}}></span>this store</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-slate-300 bg-slate-100"></span>global avg</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {a.cats.map(c => {
            const cs = categoryGap[c];
            const here = cs.carriedHerePct;
            const global = cs.avgGlobalPct;
            const under = cs.underIndex;
            return (
              <div key={c} className="grid items-center gap-3 text-[11px]" style={{gridTemplateColumns:'130px 1fr 80px 80px 80px'}}>
                <div className={`truncate ${under ? 'text-rose-700 font-semibold' : 'text-slate-700'}`}>{c}{under && ' ▲'}</div>
                <div className="relative h-4 rounded bg-slate-100 overflow-hidden">
                  <div className="absolute inset-y-0 border-r border-slate-300" style={{left: (global*100)+'%', borderRightStyle: 'dashed'}}></div>
                  <div className="absolute inset-y-0 left-0 transition-all" style={{width: (here*100)+'%', background: under ? 'linear-gradient(90deg,#fda4af,#dc2626)' : 'linear-gradient(90deg,#1f2937,#0b1220)'}}></div>
                </div>
                <div className="text-right tabular-nums font-mono text-slate-700">{cs.carriedHere}/{cs.totalSkus}</div>
                <div className="text-right tabular-nums font-mono text-slate-500">{fmtPct(here,0)}</div>
                <div className="text-right tabular-nums font-mono text-slate-400">{fmtPct(global,0)} avg</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Missing Top SKUs — centerpiece */}
      <div className="border-b border-slate-200">
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky" style={{top: 0, zIndex: 6}}>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold small-caps">Missing Top SKUs <span className="text-slate-500 normal-case">({sortedMissing.length} ranked, by global score)</span></h3>
          <div className="flex items-center gap-2">
            {bundleIds.size > 0 && <span className="text-[11px] text-emerald-700 font-mono">{bundleIds.size} selected</span>}
            <button disabled={bundleIds.size === 0} onClick={() => onExportCallSheet([cl.i], [...bundleIds])} className="btn btn-emerald">→ Add to call sheet</button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="dt">
            <thead>
              <tr>
                <th style={{width: 24}}></th>
                <Th k="rank" sort={missingSort} setSort={setMissingSort} label="Rank" align="right" />
                <Th k="n" sort={missingSort} setSort={setMissingSort} label="SKU" align="left" />
                <Th k="c" sort={missingSort} setSort={setMissingSort} label="Cat" align="left" />
                <Th k="tag" sort={missingSort} setSort={setMissingSort} label="Tag" align="left" />
                <Th k="rps" sort={missingSort} setSort={setMissingSort} label="Avg $/store" align="right" />
                <Th k="est" sort={missingSort} setSort={setMissingSort} label="Est $ here" align="right" />
                <Th k="sug" sort={missingSort} setSort={setMissingSort} label="Sugg u" align="right" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedMissing.map(({sku, est, suggestedUnits}) => (
                <tr key={sku.i} className={bundleIds.has(sku.i)?'selected':''}>
                  <td className="text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={bundleIds.has(sku.i)} onChange={() => toggleBundle(sku.i)} />
                  </td>
                  <td className="text-right tabular-nums font-mono text-slate-500">#{sku.rank}</td>
                  <td onClick={() => onPickSku(sku.i)} className="cursor-pointer truncate max-w-[260px]"><span className="hover:underline">{sku.n}</span></td>
                  <td className="text-slate-500">{sku.c}</td>
                  <td><Tag tag={sku.tag} /></td>
                  <td className="text-right tabular-nums font-mono">{fmt$(sku.revPerStore)}</td>
                  <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(est)}</td>
                  <td className="text-right tabular-nums font-mono">{suggestedUnits}</td>
                  <td><button onClick={() => onPickSku(sku.i)} className="text-[10px] text-slate-400 hover:text-emerald-700">view →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suggested order bundle */}
      <div className="border-b border-slate-200" style={{background: 'linear-gradient(135deg, rgba(16,185,129,.04), white 60%)'}}>
        <div className="px-5 py-2.5 border-b border-slate-200">
          <h3 className="text-[11px] uppercase tracking-wider text-emerald-800 font-semibold small-caps flex items-center gap-2">
            Suggested order bundle
            <span className="text-slate-400 normal-case font-normal">— top 10 missing</span>
            <span className="ml-auto text-emerald-700 font-mono text-[12px]">potential lift {fmt$(bundleLift)}</span>
          </h3>
        </div>
        <div className="px-5 py-3">
          <pre className="text-[11px] text-slate-700 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 border border-slate-200 rounded p-3 select-all">
{bundle.map((b,i) => `${(i+1).toString().padStart(2)}. ${b.sku.n.padEnd(38).slice(0,38)}  ${(b.suggestedUnits+'u').padStart(6)}  ~ ${fmt$(b.est).padStart(8)}`).join('\n')}
{`\n${'─'.repeat(70)}\nTotal projected lift                           ${fmt$(bundleLift).padStart(12)}`}
          </pre>
        </div>
      </div>

      {/* Currently carrying */}
      <div>
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center sticky" style={{top: 0, zIndex: 5}}>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-700 font-semibold small-caps">Currently carrying ({sortedCarrying.length})</h3>
          <span className="font-mono text-[11px] text-slate-700">{fmt$(cl.rev)}</span>
        </div>
        <table className="dt">
          <thead>
            <tr>
              <Th k="rank" sort={carrySort} setSort={setCarrySort} label="Rank" align="right" />
              <Th k="n" sort={carrySort} setSort={setCarrySort} label="SKU" align="left" />
              <Th k="c" sort={carrySort} setSort={setCarrySort} label="Cat" align="left" />
              <Th k="r" sort={carrySort} setSort={setCarrySort} label="Revenue" align="right" />
              <Th k="u" sort={carrySort} setSort={setCarrySort} label="Units" align="right" />
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedCarrying.map(({sku, r, u}) => (
              <tr key={sku.i} onClick={() => onPickSku(sku.i)} className="cursor-pointer">
                <td className="text-right tabular-nums font-mono text-slate-500">#{sku.rank}</td>
                <td className="truncate max-w-[280px]">{sku.n}</td>
                <td className="text-slate-500">{sku.c}</td>
                <td className="text-right tabular-nums font-mono">{fmt$(r)}</td>
                <td className="text-right tabular-nums font-mono text-slate-500">{fmtN(u)}</td>
                <td><Tag tag={sku.tag} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}

// ============================================================
//   DISTRIBUTION MATRIX — virtualized SKU × retailer grid
// ============================================================
function DistributionMatrix({a, onPickSku, onPickClient, onCellClick}) {
  const [skuSort, setSkuSort] = useState('rev');     // 'rev'|'name'|'score'|'stores'
  const [storeSort, setStoreSort] = useState('rev'); // 'rev'|'name'|'rep'|'opp'
  const [catFilter, setCatFilter] = useState('All');
  const [skuTagFilter, setSkuTagFilter] = useState('All');
  const [storeTagFilter, setStoreTagFilter] = useState('All');
  const [repFilter, setRepFilter] = useState('All');
  const [repType, setRepType] = useState('sr'); // 'sr' = Sales Rep, 'vr' = VMI Rep
  React.useEffect(() => { setRepFilter('All'); }, [repType]);
  const [skuSearch, setSkuSearch] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [hideCarrying, setHideCarrying] = useState(false);
  const [density, setDensity] = useState('comfortable'); // 'compact'|'comfortable'
  const [fullscreen, setFullscreen] = useState(false);
  // Tooltip is managed imperatively (refs + direct DOM writes) to avoid
  // re-rendering the entire grid on every mouseenter — that re-render was
  // causing cells to unmount/remount and producing a hover-flicker loop.
  const tooltipRef = useRef(null);
  const lastHoverRef = useRef(null);

  const cellW = density === 'compact' ? 14 : 22;
  const cellH = density === 'compact' ? 14 : 22;
  const skuColW = 240;
  const headerH = 130;

  const skus = useMemo(() => {
    let arr = [...a.skus];
    if (catFilter !== 'All') arr = arr.filter(s => s.c === catFilter);
    if (skuTagFilter !== 'All') arr = arr.filter(s => s.tag === skuTagFilter);
    if (skuSearch) {
      const q = skuSearch.toLowerCase();
      arr = arr.filter(s => s.n.toLowerCase().includes(q));
    }
    if (skuSort === 'rev') arr.sort((x,y) => y.rev - x.rev);
    else if (skuSort === 'name') arr.sort((x,y) => x.n.localeCompare(y.n));
    else if (skuSort === 'score') arr.sort((x,y) => y.score - x.score);
    else if (skuSort === 'stores') arr.sort((x,y) => y.stores - x.stores);
    return arr;
  }, [a, catFilter, skuTagFilter, skuSearch, skuSort]);

  const clients = useMemo(() => {
    let arr = [...a.clients];
    if (storeTagFilter !== 'All') arr = arr.filter(c => c.storeTag === storeTagFilter);
    if (repFilter !== 'All') arr = arr.filter(c => (c[repType] || 'Unassigned') === repFilter);
    if (storeSearch) {
      const q = storeSearch.toLowerCase();
      arr = arr.filter(c => c.n.toLowerCase().includes(q));
    }
    if (storeSort === 'rev') arr.sort((x,y) => y.rev - x.rev);
    else if (storeSort === 'name') arr.sort((x,y) => x.n.localeCompare(y.n));
    else if (storeSort === 'rep') arr.sort((x,y) => (x.sr||'').localeCompare(y.sr||''));
    else if (storeSort === 'opp') arr.sort((x,y) => y.oppScore - x.oppScore);
    return arr;
  }, [a, storeTagFilter, repFilter, repType, storeSearch, storeSort]);

  // lookup: skuId -> clientId -> {r, u}
  const lookup = useMemo(() => {
    const m = new Map();
    for (const row of (a.matrixRaw || [])) {
      const c = row.c, s = row.s, r = row.r, u = row.u;
      if (!m.has(s)) m.set(s, new Map());
      m.get(s).set(c, {r, u});
    }
    return m;
  }, [a]);

  // Per-SKU max revenue (for heatmap intensity within a row)
  const maxRevPerSku = useMemo(() => {
    const m = new Map();
    for (const s of skus) {
      const row = lookup.get(s.i);
      if (!row) { m.set(s.i, 0); continue; }
      let mx = 0;
      for (const v of row.values()) if (v.r > mx) mx = v.r;
      m.set(s.i, mx);
    }
    return m;
  }, [skus, lookup]);

  // Optionally hide stores carrying every visible SKU (rare; leave as no-op-ish — instead apply at row level: show only stores with at least one missing SKU among visible)
  const filteredClients = useMemo(() => {
    if (!hideCarrying) return clients;
    return clients.filter(c => skus.some(s => !lookup.get(s.i)?.has(c.i) || !(lookup.get(s.i).get(c.i)?.r > 0)));
  }, [clients, skus, lookup, hideCarrying]);

  // Virtualization — track scroll
  const scrollerRef = useRef(null);
  const [scroll, setScroll] = useState({x: 0, y: 0, w: 0, h: 0});

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setScroll({x: el.scrollLeft, y: el.scrollTop, w: el.clientWidth, h: el.clientHeight});
    update();
    const onScroll = () => setScroll(s => ({...s, x: el.scrollLeft, y: el.scrollTop}));
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [fullscreen]);

  // Calculate visible window
  const overscan = 5;
  const startCol = Math.max(0, Math.floor(scroll.x / cellW) - overscan);
  const endCol = Math.min(filteredClients.length, Math.ceil((scroll.x + scroll.w) / cellW) + overscan);
  const startRow = Math.max(0, Math.floor(scroll.y / cellH) - overscan);
  const endRow = Math.min(skus.length, Math.ceil((scroll.y + scroll.h) / cellH) + overscan);

  const totalW = filteredClients.length * cellW + skuColW;
  const totalH = skus.length * cellH;

  const cats = ['All', ...[...new Set(a.skus.map(s => s.c))].sort()];
  const reps = useMemo(() => ['All', ...[...new Set(a.clients.map(c => c[repType] || 'Unassigned'))].sort()], [a, repType]);

  const onCellEnter = useCallback((sx, cx, ev) => {
    // Avoid re-firing if we're already showing this exact cell
    if (lastHoverRef.current && lastHoverRef.current.sx === sx && lastHoverRef.current.cx === cx) return;
    lastHoverRef.current = { sx, cx };
    const tip = tooltipRef.current;
    if (!tip) return;
    const sku = a.skuById.get(sx);
    const client = a.clients[cx];
    if (!sku || !client) return;
    const cell = lookup.get(sx)?.get(cx);
    const r = cell?.r || 0;
    const u = cell?.u || 0;
    const pct = client.rev ? r / client.rev : 0;
    const carrying = r > 0;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 270, rect.right + 6);
    const y = Math.min(window.innerHeight - 130, rect.top);
    // Body
    const bodyHTML = carrying
      ? `<div>revenue: <span style="color:#6ee7b7;font-weight:600">${fmt$(r)}</span></div>`
      + `<div>units: ${fmtN(u)}</div>`
      + `<div>${fmtPct(pct,1)} of this store's spend</div>`
      : `<div style="color:#fda4af;font-weight:600">not carrying — opportunity</div>`;
    tip.innerHTML =
      `<div style="font-weight:600;color:#6ee7b7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(sku.n)}</div>`
      + `<div style="color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">× ${escapeHtml(client.n)}</div>`
      + `<div style="height:1px;background:#475569;margin:6px 0"></div>`
      + bodyHTML;
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.opacity = '1';
    tip.style.visibility = 'visible';
  }, [a, lookup]);
  const onCellLeave = useCallback(() => {
    lastHoverRef.current = null;
    const tip = tooltipRef.current;
    if (!tip) return;
    tip.style.opacity = '0';
    tip.style.visibility = 'hidden';
  }, []);
  const onCellClickInternal = (s, c) => {
    if (onCellClick) onCellClick(s.i, c.i);
    else { onPickSku(s.i); }
  };

  const wrapperCls = fullscreen ? 'fixed inset-0 z-50 bg-white flex flex-col' : 'flex flex-col h-full';

  return (
    <div className={wrapperCls}>
      {/* Filters */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" placeholder="Search SKUs…" value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
                 className="text-xs" style={{width:160}} />
          <input type="search" placeholder="Search retailers…" value={storeSearch} onChange={e => setStoreSearch(e.target.value)}
                 className="text-xs" style={{width:160}} />
          <span className="h-5 w-px bg-slate-200 mx-1"></span>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-xs">
            {cats.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
          </select>
          <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
            {[['sr','Sales'],['vr','VMI']].map(([k,l]) => (
              <button key={k} onClick={() => setRepType(k)}
                      className={`px-2 py-0.5 rounded ${repType===k?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{l}</button>
            ))}
          </div>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="text-xs" style={{maxWidth:160}} title={repType==='sr'?'Filter retailer columns by Sales Rep':'Filter retailer columns by VMI Rep'}>
            {reps.map(r => <option key={r} value={r}>{r === 'All' ? 'All reps' : r}</option>)}
          </select>
          <span className="h-5 w-px bg-slate-200 mx-1"></span>
          <select value={skuSort} onChange={e => setSkuSort(e.target.value)} className="text-xs">
            <option value="rev">SKUs: revenue ↓</option>
            <option value="score">SKUs: score ↓</option>
            <option value="stores">SKUs: store count ↓</option>
            <option value="name">SKUs: name A-Z</option>
          </select>
          <select value={storeSort} onChange={e => setStoreSort(e.target.value)} className="text-xs">
            <option value="rev">Stores: revenue ↓</option>
            <option value="opp">Stores: opp score ↓</option>
            <option value="name">Stores: name A-Z</option>
            <option value="rep">Stores: by rep</option>
          </select>
          <span className="h-5 w-px bg-slate-200 mx-1"></span>
          <label className="text-[11px] text-slate-600 flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={hideCarrying} onChange={e => setHideCarrying(e.target.checked)} />
            Hide all-carrying stores
          </label>
          <div className="ml-auto flex gap-1 items-center">
            <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
              <button onClick={() => setDensity('compact')} className={`px-2 py-0.5 rounded ${density==='compact'?'bg-white shadow-sm text-slate-900':'text-slate-500'}`}>Compact</button>
              <button onClick={() => setDensity('comfortable')} className={`px-2 py-0.5 rounded ${density==='comfortable'?'bg-white shadow-sm text-slate-900':'text-slate-500'}`}>Comfortable</button>
            </div>
            <button onClick={() => setFullscreen(!fullscreen)} className="btn btn-ghost" title={fullscreen?'Exit fullscreen':'Fullscreen'}>
              {fullscreen ? '⤢ exit' : '⤢ expand'}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">SKU tag</span>
          <TagChips options={['All','SCALE','PUSH','MONITOR','FIX','CUT']} value={skuTagFilter} onChange={setSkuTagFilter} />
          <span className="h-4 w-px bg-slate-200 mx-1"></span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Store tag</span>
          <TagChips options={['All','HIGH VALUE — CALL NOW','CROSS-SELL','CATEGORY EXPANSION','LOW PRIORITY','AT RISK']} value={storeTagFilter} onChange={setStoreTagFilter} />
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
          <span>{skus.length} SKUs × {filteredClients.length} stores · {(skus.length * filteredClients.length).toLocaleString()} cells</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span>0</span>
            <span className="inline-block h-3 w-32 rounded-sm" style={{background: 'linear-gradient(90deg, #f1f5f9, #d1fae5 30%, #34d399 60%, #047857)'}}></span>
            <span>row max $</span>
          </span>
          <span className="text-slate-400">· hover for details · click for SKU detail</span>
        </div>
      </div>

      {/* Grid */}
      <div ref={scrollerRef} className="flex-1 overflow-auto bg-white" style={{position:'relative'}}>
        <div style={{position: 'relative', width: totalW, height: totalH + headerH, minHeight: '100%'}}>
          {/* Sticky header row (column headers) */}
          <div style={{position: 'sticky', top: 0, zIndex: 6, height: headerH, background: 'white', borderBottom: '1px solid #e5e7eb', width: totalW}}>
            <div style={{position: 'sticky', left: 0, top: 0, width: skuColW, height: headerH, background: 'white', borderRight: '1px solid #e5e7eb', zIndex: 8, display:'flex', alignItems:'flex-end', padding: '0 10px 8px'}}>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold small-caps">SKU ↓ / Retailer →</div>
            </div>
            {filteredClients.slice(startCol, endCol).map((c, idx) => {
              const i = startCol + idx;
              return (
                <div key={c.i} className="absolute" style={{left: skuColW + i * cellW, top: 0, width: cellW, height: headerH, cursor:'pointer'}}
                     onClick={() => onPickClient(c.i)} title={c.n}>
                  <div className="absolute origin-bottom-left whitespace-nowrap" style={{transform: 'rotate(-65deg)', bottom: 6, left: cellW - 2, width: headerH - 12, fontSize: 9, color: '#475569', fontFamily: 'JetBrains Mono'}}>
                    <span className="font-semibold">{c.n}</span>
                    <span className="ml-1 text-emerald-700">{fmt$(c.rev/1000).replace('$','$')+'k'}</span>
                    <span className="ml-1 text-slate-400" title={`Sales: ${c.sr||'—'} · VMI: ${c.vr||'—'}`}>{c[repType] ? c[repType].split(' ').map(p=>p[0]).join('').slice(0,2) : '–'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky SKU column + cells */}
          {skus.slice(startRow, endRow).map((s, ridx) => {
            const i = startRow + ridx;
            const top = headerH + i * cellH;
            const mxr = maxRevPerSku.get(s.i) || 1;
            const tagS = window.BambooUI.TAG_STYLES[s.tag] || {dot:'#94a3b8'};
            return (
              <React.Fragment key={s.i}>
                <div style={{position: 'absolute', left: 0, top, width: skuColW, height: cellH, background: 'white', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #f1f5f9', zIndex: 5, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, cursor: 'pointer'}}
                     className="hover:bg-emerald-50"
                     onClick={() => onPickSku(s.i)}>
                  <span className="font-mono text-[9px] text-slate-400 tabular-nums">#{s.rank}</span>
                  <span className="w-1 h-3 rounded-sm flex-shrink-0" style={{background: tagS.dot}}></span>
                  <span className="text-[11px] text-slate-800 truncate flex-1" title={s.n}>{s.n}</span>
                  <span className="text-[9px] text-slate-400 font-mono tabular-nums">{s.stores}</span>
                </div>
                {filteredClients.slice(startCol, endCol).map((c, cidx) => {
                  const cidxAbs = startCol + cidx;
                  const cell = lookup.get(s.i)?.get(c.i);
                  const left = skuColW + cidxAbs * cellW;
                  if (!cell || !cell.r) {
                    return (
                      <div key={c.i} className="absolute hm-cell"
                           style={{left, top, width: cellW, height: cellH, background: 'transparent', borderRight: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', cursor:'pointer'}}
                           onMouseEnter={(e) => onCellEnter(s.i, c.i, e)}
                           onMouseLeave={onCellLeave}
                           onClick={() => onCellClickInternal(s, c)}
                      ></div>
                    );
                  }
                  const intensity = Math.min(1, cell.r / mxr);
                  // gradient: light → emerald
                  const r = Math.round(241 - 234 * intensity);
                  const g = Math.round(245 - 125 * intensity);
                  const b = Math.round(249 - 162 * intensity);
                  const bg = `rgb(${r},${g},${b})`;
                  const showCheck = cellW >= 16 && intensity > 0.05;
                  return (
                    <div key={c.i} className="absolute hm-cell"
                         style={{left, top, width: cellW, height: cellH, background: bg, borderRight: '1px solid rgba(255,255,255,.5)', borderBottom: '1px solid rgba(255,255,255,.5)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color: intensity > 0.6 ? 'white' : '#065f46', fontSize: cellW < 16 ? 7 : 9, fontWeight: 700, fontFamily: 'JetBrains Mono'}}
                         onMouseEnter={(e) => onCellEnter(s.i, c.i, e)}
                         onMouseLeave={onCellLeave}
                         onClick={() => onCellClickInternal(s, c)}>
                      {showCheck ? '✔' : ''}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        {/* Tooltip — single always-mounted node, updated imperatively to avoid grid re-renders */}
        <div
          ref={tooltipRef}
          className="rounded-md shadow-xl border border-slate-700 text-white text-[11px] font-mono p-2.5 leading-snug ink-grad"
          style={{
            position: 'fixed', left: 0, top: 0, width: 260, zIndex: 50,
            pointerEvents: 'none', visibility: 'hidden', opacity: 0,
            transition: 'opacity 80ms linear',
            willChange: 'transform',
          }}
          aria-hidden="true"
        ></div>
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
//   PERFORMANCE BUCKETS
// ============================================================
function Buckets({a, onPickSku}) {
  const top10Rev = [...a.skus].sort((x,y) => y.rev - x.rev).slice(0, 10);
  const top10Vel = [...a.skus].sort((x,y) => y.velocity - x.velocity).slice(0, 10);
  const top10Dist = [...a.skus].sort((x,y) => y.stores - x.stores).slice(0, 10);
  const hidden = [...a.skus].filter(s => s.velocity > 0 && s.distPct < 0.4 && s.score >= 30).sort((x,y) => y.velocity - x.velocity).slice(0, 10);
  const weak = [...a.skus].sort((x,y) => x.score - y.score).slice(0, 10);

  const Bucket = ({title, sub, items, getter, color, icon}) => (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden" style={{boxShadow:'0 1px 0 rgba(15,23,42,.04)'}}>
      <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{background: color}}></span>
        <div>
          <div className="text-[11px] font-semibold text-slate-800 small-caps">{title}</div>
          {sub && <div className="text-[9px] text-slate-400 font-mono small-caps">{sub}</div>}
        </div>
      </div>
      <table className="dt">
        <tbody>
          {items.map((s,i) => (
            <tr key={s.i} onClick={() => onPickSku(s.i)} className="cursor-pointer">
              <td className="text-slate-400 w-7 text-right tabular-nums font-mono">{i+1}</td>
              <td className="truncate max-w-[180px]">{s.n}</td>
              <td className="text-right tabular-nums font-mono text-slate-700">{getter(s)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 p-4">
      <Bucket title="Top revenue drivers" sub="$ contribution" items={top10Rev} getter={s => fmt$(s.rev)} color="#059669" />
      <Bucket title="Highest velocity" sub="units/store/month" items={top10Vel} getter={s => fmtNum(s.velocity, 0)} color="#0b1220" />
      <Bucket title="Most distributed" sub="store count" items={top10Dist} getter={s => `${s.stores}/${a.clients.length}`} color="#2563eb" />
      <Bucket title="Hidden winners" sub="high vel · low dist" items={hidden} getter={s => `${fmtNum(s.velocity, 0)} · ${fmtPct(s.distPct,0)}`} color="#d97706" />
      <Bucket title="Weak SKUs" sub="lowest score" items={weak} getter={s => `score ${s.score.toFixed(0)}`} color="#dc2626" />
    </div>
  );
}

window.BambooPanels = { SkuDetail, RetailerDetail, DistributionMatrix, Buckets, Drawer };
