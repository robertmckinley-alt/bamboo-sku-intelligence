/* eslint-disable */
const { useState, useMemo } = React;
const { fmt$, fmtN, fmtPct, fmtNum } = window.BambooCore;
const { Tag, TagChips, MiniBar, ScoreBar, Th } = window.BambooUI;

// ============== Master SKU Table ==============
function MasterSkuTable({a, onPick, search, setSearch, catFilter, setCatFilter, tagFilter, setTagFilter, view, setView}) {
  const [sort, setSort] = useState({key:'rank', dir:'asc'});
  const cats = useMemo(() => ['All', ...new Set(a.skus.map(s => s.c))].sort(), [a]);

  const filtered = useMemo(() => {
    let f = a.skus;
    if (catFilter && catFilter !== 'All') f = f.filter(s => s.c === catFilter);
    if (tagFilter && tagFilter !== 'All') f = f.filter(s => s.tag === tagFilter);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(s => s.n.toLowerCase().includes(q) || s.c.toLowerCase().includes(q));
    }
    return f;
  }, [a, catFilter, tagFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const k = sort.key;
    const m = sort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      const xv = x[k], yv = y[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [filtered, sort]);

  const tagCounts = useMemo(() => {
    const c = {All: a.skus.length};
    for (const s of a.skus) c[s.tag] = (c[s.tag]||0)+1;
    return c;
  }, [a]);

  const VIEWS = ['Revenue','Velocity','Distribution','Opportunity'];
  const highlight = view === 'Revenue' ? 'rev' : view === 'Velocity' ? 'velocity' : view === 'Distribution' ? 'distPct' : 'oppEst';

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input id="sku-search" type="search" placeholder="Search SKUs (press / to focus)…" value={search} onChange={e => setSearch(e.target.value)}
                 className="text-xs flex-1 min-w-[180px]" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-xs">
            {cats.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
          </select>
          <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
            {VIEWS.map(v => (
              <button key={v} onClick={() => setView(v)}
                      className={`px-2 py-0.5 rounded ${view===v?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{v}</button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums ml-auto">{sorted.length} SKUs</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tag</span>
          <TagChips options={['All','SCALE','PUSH','MONITOR','FIX','CUT']} value={tagFilter} onChange={setTagFilter} counts={tagCounts} />
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="dt">
          <thead>
            <tr>
              <Th k="rank" sort={sort} setSort={setSort} label="#" align="right" w={36} />
              <Th k="n" sort={sort} setSort={setSort} label="SKU" />
              <Th k="c" sort={sort} setSort={setSort} label="Category" />
              <Th k="score" sort={sort} setSort={setSort} label="Score" align="right" />
              <Th k="tag" sort={sort} setSort={setSort} label="Tag" />
              <Th k="rev" sort={sort} setSort={setSort} label="Revenue" align="right" />
              <Th k="u" sort={sort} setSort={setSort} label="Units" align="right" />
              <Th k="stores" sort={sort} setSort={setSort} label="Stores" align="right" />
              <Th k="distPct" sort={sort} setSort={setSort} label="Penet." align="right" />
              <Th k="unitsPerStore" sort={sort} setSort={setSort} label="U/Store" align="right" />
              <Th k="revPerStore" sort={sort} setSort={setSort} label="$/Store" align="right" />
              <Th k="velocity" sort={sort} setSort={setSort} label="Velocity" align="right" />
              <Th k="reorderProxy" sort={sort} setSort={setSort} label="Reorder" align="right" />
              <Th k="distGap" sort={sort} setSort={setSort} label="Gap" align="right" />
              <Th k="oppEst" sort={sort} setSort={setSort} label="Opp $" align="right" />
              <th style={{width:24}}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const dist = s.distPct;
              const distClass = dist>=0.7?'text-emerald-700':dist>=0.4?'text-amber-700':'text-rose-700';
              return (
                <tr key={s.i} onClick={() => onPick(s.i)} className="cursor-pointer">
                  <td className="text-right tabular-nums font-mono text-slate-500">{s.rank}</td>
                  <td className="truncate max-w-[280px]">{s.n}</td>
                  <td className="text-slate-600">{s.c}</td>
                  <td className="text-right" style={{minWidth:110}}>
                    <ScoreBar score={s.score} height={4} />
                  </td>
                  <td><Tag tag={s.tag} /></td>
                  <td className={`text-right tabular-nums font-mono ${highlight==='rev'?'bg-emerald-50 font-semibold':''}`}>{fmt$(s.rev)}</td>
                  <td className="text-right tabular-nums font-mono">{fmtN(s.u)}</td>
                  <td className="text-right tabular-nums font-mono">{s.stores}/{a.clients.length}</td>
                  <td className={`text-right tabular-nums font-mono ${distClass} ${highlight==='distPct'?'bg-emerald-50 font-semibold':''}`}>{fmtPct(s.distPct, 0)}</td>
                  <td className="text-right tabular-nums font-mono">{fmtN(s.unitsPerStore)}</td>
                  <td className="text-right tabular-nums font-mono">{fmt$(s.revPerStore)}</td>
                  <td className={`text-right tabular-nums font-mono ${highlight==='velocity'?'bg-emerald-50 font-semibold':''}`}>{fmtNum(s.velocity, 0)}</td>
                  <td className="text-right tabular-nums font-mono">{s.reorderProxy.toFixed(2)}</td>
                  <td className="text-right tabular-nums font-mono text-rose-700">{s.distGap}</td>
                  <td className={`text-right tabular-nums font-mono text-emerald-700 ${highlight==='oppEst'?'bg-emerald-50 font-semibold':''}`}>{fmt$(s.oppEst)}</td>
                  <td className="text-center text-slate-400">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============== Retailer Table ==============
function RetailerTable({a, onPick, search, setSearch, repFilter, setRepFilter, storeTagFilter, setStoreTagFilter}) {
  const [sort, setSort] = useState({key:'rev', dir:'desc'});
  const [repType, setRepType] = useState('sr'); // 'sr' = Sales Rep, 'vr' = VMI Rep
  const reps = useMemo(
    () => ['All', ...[...new Set(a.clients.map(c => c[repType] || 'Unassigned'))].sort()],
    [a, repType]
  );

  const filtered = useMemo(() => {
    let f = a.clients;
    if (repFilter && repFilter !== 'All') f = f.filter(c => (c[repType]||'Unassigned') === repFilter);
    if (storeTagFilter && storeTagFilter !== 'All') f = f.filter(c => c.storeTag === storeTagFilter);
    if (search) {
      const q = search.toLowerCase();
      f = f.filter(c => c.n.toLowerCase().includes(q));
    }
    return f;
  }, [a, repFilter, repType, storeTagFilter, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const k = sort.key;
    const m = sort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      const xv = x[k], yv = y[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr;
  }, [filtered, sort]);

  const tagCounts = useMemo(() => {
    const c = {All: a.clients.length};
    for (const cl of a.clients) c[cl.storeTag] = (c[cl.storeTag]||0)+1;
    return c;
  }, [a]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="search" placeholder="Search retailers…" value={search} onChange={e => setSearch(e.target.value)}
                 className="text-xs flex-1 min-w-[200px]" />
          <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
            {[['sr','Sales'],['vr','VMI']].map(([k,l]) => (
              <button key={k} onClick={() => { setRepType(k); setRepFilter('All'); }}
                      className={`px-2 py-0.5 rounded ${repType===k?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{l}</button>
            ))}
          </div>
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} className="text-xs" style={{maxWidth:200}} title={repType==='sr'?'Filter by Sales Rep':'Filter by VMI Rep'}>
            {reps.map(c => <option key={c} value={c}>{c === 'All' ? (repType==='sr'?'All sales reps':'All VMI reps') : c}</option>)}
          </select>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums ml-auto">{sorted.length} retailers</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Tag</span>
          <TagChips options={['All','HIGH VALUE — CALL NOW','CROSS-SELL','CATEGORY EXPANSION','LOW PRIORITY','AT RISK']} value={storeTagFilter} onChange={setStoreTagFilter} counts={tagCounts} />
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="dt">
          <thead>
            <tr>
              <Th k="n" sort={sort} setSort={setSort} label="Retailer" />
              <Th k={repType} sort={sort} setSort={setSort} label={repType==="sr"?"Sales Rep":"VMI Rep"} />
              <Th k="storeTag" sort={sort} setSort={setSort} label="Tag" />
              <Th k="oppScore" sort={sort} setSort={setSort} label="Opp Score" align="right" />
              <Th k="rev" sort={sort} setSort={setSort} label="Revenue" align="right" />
              <Th k="u" sort={sort} setSort={setSort} label="Units" align="right" />
              <Th k="o" sort={sort} setSort={setSort} label="Orders" align="right" />
              <Th k="aov" sort={sort} setSort={setSort} label="AOV" align="right" />
              <Th k="orderFreq" sort={sort} setSort={setSort} label="Orders/mo" align="right" />
              <Th k="skusCarried" sort={sort} setSort={setSort} label="SKUs" align="right" />
              <Th k="skuPenetration" sort={sort} setSort={setSort} label="Penet." align="right" />
              <Th k="catCount" sort={sort} setSort={setSort} label="Cats" align="right" />
              <Th k="missingTopCount" sort={sort} setSort={setSort} label="Miss30" align="right" />
              <Th k="missedRev" sort={sort} setSort={setSort} label="Missed $" align="right" />
              <Th k="ls" sort={sort} setSort={setSort} label="Last Order" />
              <th style={{width:24}}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(c => (
              <tr key={c.i} onClick={() => onPick(c.i)} className="cursor-pointer">
                <td className="truncate max-w-[260px]">{c.n}</td>
                <td className="text-slate-600 truncate max-w-[140px]" title={`Sales: ${c.sr||"—"} · VMI: ${c.vr||"—"}`}>{c[repType] || '—'}</td>
                <td><Tag tag={c.storeTag} /></td>
                <td className="text-right" style={{minWidth:110}}><ScoreBar score={c.oppScore} height={4} /></td>
                <td className="text-right tabular-nums font-mono">{fmt$(c.rev)}</td>
                <td className="text-right tabular-nums font-mono text-slate-500">{fmtN(c.u)}</td>
                <td className="text-right tabular-nums font-mono">{c.o}</td>
                <td className="text-right tabular-nums font-mono">{fmt$(c.aov)}</td>
                <td className="text-right tabular-nums font-mono">{c.orderFreq.toFixed(1)}</td>
                <td className="text-right tabular-nums font-mono">{c.skusCarried}/{c.skusAll}</td>
                <td className="text-right tabular-nums font-mono">{fmtPct(c.skuPenetration, 0)}</td>
                <td className="text-right tabular-nums font-mono">{c.catCount}</td>
                <td className="text-right tabular-nums font-mono text-rose-700">{c.missingTopCount}</td>
                <td className="text-right tabular-nums font-mono text-emerald-700">{fmt$(c.missedRev)}</td>
                <td className="text-slate-600 font-mono text-[10px] tabular-nums">{c.ls || '—'}</td>
                <td className="text-center text-slate-400">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

window.BambooTables = { MasterSkuTable, RetailerTable };
