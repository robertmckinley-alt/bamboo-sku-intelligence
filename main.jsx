/* eslint-disable */
const { useState, useEffect, useMemo, useRef, useCallback } = React;
const { buildAnalytics, DEFAULT_SKU_WEIGHTS, DEFAULT_STORE_WEIGHTS, useUrlState, fmt$, fmtN, fmtPct } = window.BambooCore;
const { Tag, ExecStrip, WeightPanel, AppBar, Skeleton } = window.BambooUI;
const { MasterSkuTable, RetailerTable } = window.BambooTables;
const { SkuDetail, RetailerDetail, DistributionMatrix, Buckets } = window.BambooPanels;
const { CategoryLeaderboards } = window.BambooCategories;
const { RepsPanel } = window.BambooReps;
const { TopSkusPanel } = window.BambooTopSkus;
const { exportCallSheetCSV, exportCallSheetPrintable } = window.BambooExport;
const { HowTo } = window.BambooHowTo;

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('data/dataset.json?v=' + (window.__BAMBOO_BUILD || Date.now()), {cache: 'no-cache'})
      .then(r => r.json())
      .then(setData)
      .catch(e => setError(String(e)));
  }, []);

  // Persisted state
  const [tab, setTab] = useUrlState('tab', 'skus');
  const [skuW, setSkuW] = useUrlState('skuW', DEFAULT_SKU_WEIGHTS);
  const [storeW, setStoreW] = useUrlState('storeW', DEFAULT_STORE_WEIGHTS);
  const [skuSearch, setSkuSearch] = useUrlState('skuQ', '');
  const [skuCat, setSkuCat] = useUrlState('skuC', 'All');
  const [skuTag, setSkuTag] = useUrlState('skuT', 'All');
  const [skuView, setSkuView] = useUrlState('skuV', 'Revenue');
  const [retailerSearch, setRetailerSearch] = useUrlState('retQ', '');
  const [repFilter, setRepFilter] = useUrlState('repF', 'All');
  const [storeTagFilter, setStoreTagFilter] = useUrlState('storeT', 'All');
  const [pickedSku, setPickedSku] = useState(null);
  const [pickedClient, setPickedClient] = useState(null);
  const [pickedSkuFocusClient, setPickedSkuFocusClient] = useState(null);
  const [bulkExportOpen, setBulkExportOpen] = useState(false);

  const analytics = useMemo(() => data ? buildAnalytics(data, skuW, storeW) : null, [data, skuW, storeW]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        document.getElementById('sku-search')?.focus();
      }
      if (e.key === 'Escape') {
        if (pickedSku != null || pickedClient != null) { setPickedSku(null); setPickedClient(null); }
        else setBulkExportOpen(false);
      }
      if (!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
        if (e.key === '1') setTab('skus');
        if (e.key === '2') setTab('retailers');
        if (e.key === '3') setTab('matrix');
        if (e.key === '4') setTab('categories');
        if (e.key === '5') setTab('topskus');
        if (e.key === '6') setTab('reps');
        if (e.key === '7') setTab('buckets');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab, pickedSku, pickedClient]);

  const resetWeights = () => { setSkuW(DEFAULT_SKU_WEIGHTS); setStoreW(DEFAULT_STORE_WEIGHTS); };

  const TABS = [
    {id:'skus', label:'SKU Engine'},
    {id:'retailers', label:'Retailers'},
    {id:'matrix', label:'Distribution Matrix'},
    {id:'categories', label:'Categories'},
    {id:'topskus', label:'Top SKUs'},
    {id:'reps', label:'Reps'},
    {id:'buckets', label:'Buckets'},
    {id:'howto', label:'How to Use'},
  ];

  if (error) return <div className="p-8 text-rose-700 font-mono">Error loading data: {error}</div>;
  if (!analytics) return <Skeleton />;

  const onCellClick = (skuId, clientId) => {
    // Cell click in matrix → open SKU drawer with client highlighted
    setPickedSkuFocusClient(clientId);
    setPickedSku(skuId);
  };

  return (
    <div className="h-screen flex flex-col canvas-grain text-slate-900">
      <AppBar tabs={TABS} tab={tab} setTab={setTab} onBulkExport={() => setBulkExportOpen(true)} />
      <ExecStrip a={analytics} />

      <div className="flex-1 flex min-h-0 main-stack">
        <div className="flex-1 overflow-hidden min-w-0">
          {tab === 'skus' && (
            <MasterSkuTable a={analytics} onPick={setPickedSku}
              search={skuSearch} setSearch={setSkuSearch}
              catFilter={skuCat} setCatFilter={setSkuCat}
              tagFilter={skuTag} setTagFilter={setSkuTag}
              view={skuView} setView={setSkuView} />
          )}
          {tab === 'retailers' && (
            <RetailerTable a={analytics} onPick={setPickedClient}
              search={retailerSearch} setSearch={setRetailerSearch}
              repFilter={repFilter} setRepFilter={setRepFilter}
              storeTagFilter={storeTagFilter} setStoreTagFilter={setStoreTagFilter} />
          )}
          {tab === 'matrix' && (
            <DistributionMatrix a={analytics} onPickSku={setPickedSku} onPickClient={setPickedClient} onCellClick={onCellClick} />
          )}
          {tab === 'categories' && (
            <div className="overflow-auto h-full">
              <CategoryLeaderboards a={analytics} onPickSku={setPickedSku} />
            </div>
          )}
          {tab === 'topskus' && (
            <div className="overflow-auto h-full">
              <TopSkusPanel a={analytics} onPickSku={setPickedSku} />
            </div>
          )}
          {tab === 'reps' && (
            <div className="overflow-auto h-full">
              <RepsPanel a={analytics} onPickClient={setPickedClient} onPickSku={setPickedSku}
                onExportRep={(rep, repType) => {
                  const field = repType === 'vr' ? 'vr' : 'sr';
                  const ids = analytics.clients.filter(c => (c[field]||'Unassigned') === rep).map(c => c.i);
                  exportCallSheetPrintable(analytics, ids);
                }} />
            </div>
          )}
          {tab === 'buckets' && (
            <div className="overflow-auto h-full">
              <Buckets a={analytics} onPickSku={setPickedSku} />
            </div>
          )}
          {tab === 'howto' && <HowTo a={analytics} />}
        </div>

        <aside className="rail w-72 border-l border-slate-200 bg-white flex-shrink-0 overflow-auto rail-stack no-print">
          <WeightPanel skuW={skuW} setSkuW={setSkuW} storeW={storeW} setStoreW={setStoreW} onReset={resetWeights} />
          <RepLeaderboard a={analytics} onPickClient={setPickedClient} onExportRep={(rep) => {
            const ids = analytics.clients.filter(c => (c.sr||'Unassigned') === rep).map(c => c.i);
            exportCallSheetPrintable(analytics, ids);
          }} />
          <TagSummary a={analytics} />
          <Footnote a={analytics} />
        </aside>
      </div>

      {pickedSku != null && (
        <SkuDetail
          a={analytics} skuId={pickedSku}
          focusClientId={pickedSkuFocusClient}
          onClose={() => { setPickedSku(null); setPickedSkuFocusClient(null); }}
          onPickClient={(id) => { setPickedSku(null); setPickedSkuFocusClient(null); setPickedClient(id); }}
          onAddCallSheet={(ids) => exportCallSheetPrintable(analytics, ids, [pickedSku])}
        />
      )}
      {pickedClient != null && (
        <RetailerDetail
          a={analytics} clientId={pickedClient}
          onClose={() => setPickedClient(null)}
          onPickSku={(id) => { setPickedClient(null); setPickedSku(id); }}
          onExportCallSheet={(ids, skuIds) => exportCallSheetPrintable(analytics, ids, skuIds)}
        />
      )}
      {bulkExportOpen && <BulkExport a={analytics} onClose={() => setBulkExportOpen(false)} />}
    </div>
  );
}

// ============== Rep Leaderboard ==============
function RepLeaderboard({a, onPickClient, onExportRep}) {
  const reps = useMemo(() => {
    const r = {};
    for (const c of a.clients) {
      const k = c.sr || 'Unassigned';
      if (!r[k]) r[k] = {name: k, stores: 0, revenue: 0, units: 0, orders: 0, missedRev: 0};
      r[k].stores++;
      r[k].revenue += c.rev;
      r[k].units += c.u;
      r[k].orders += c.o;
      r[k].missedRev += c.missedRev;
    }
    return Object.values(r).sort((x,y) => y.revenue - x.revenue);
  }, [a]);
  const maxRev = reps[0]?.revenue || 1;
  return (
    <div className="border-t border-slate-200">
      <h3 className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 small-caps flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Sales Reps
      </h3>
      <div className="px-2 pb-2">
        {reps.map(r => (
          <div key={r.name} className="group rounded-md hover:bg-slate-50 px-2 py-1.5 transition">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] truncate flex-1 font-semibold" title={r.name}>{r.name}</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-700">{fmt$(r.revenue)}</span>
              <button onClick={() => onExportRep(r.name)} className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-900 hover:text-white rounded transition" title="Print combined call sheet">📄</button>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex-1 h-1 rounded-full overflow-hidden bg-slate-100">
                <div className="h-full" style={{width: ((r.revenue/maxRev)*100)+'%', background:'linear-gradient(90deg,#34d399,#047857)'}}></div>
              </div>
              <span className="text-[9px] font-mono text-slate-400 tabular-nums">{r.stores}st · {fmt$(r.missedRev)}opp</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagSummary({a}) {
  const skuTags = {};
  for (const s of a.skus) skuTags[s.tag] = (skuTags[s.tag]||0)+1;
  const storeTags = {};
  for (const c of a.clients) storeTags[c.storeTag] = (storeTags[c.storeTag]||0)+1;
  return (
    <div className="border-t border-slate-200">
      <h3 className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-700 small-caps flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Tag Summary
      </h3>
      <div className="px-2 pb-3 space-y-1">
        <div className="text-[9px] uppercase text-slate-400 tracking-wider mt-1 px-1 small-caps">SKUs</div>
        {['SCALE','PUSH','MONITOR','FIX','CUT'].map(t => (
          <div key={t} className="flex justify-between items-center px-1.5">
            <Tag tag={t} />
            <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-700">{skuTags[t]||0}</span>
          </div>
        ))}
        <div className="text-[9px] uppercase text-slate-400 tracking-wider mt-2 px-1 small-caps">Retailers</div>
        {['HIGH VALUE — CALL NOW','CROSS-SELL','CATEGORY EXPANSION','LOW PRIORITY','AT RISK'].map(t => (
          <div key={t} className="flex justify-between items-center px-1.5">
            <Tag tag={t} />
            <span className="font-mono tabular-nums text-[11px] font-semibold text-slate-700">{storeTags[t]||0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footnote({a}) {
  return (
    <div className="border-t border-slate-200 px-3 py-3 text-[10px] text-slate-500 leading-relaxed">
      <div className="font-mono tabular-nums mb-1">
        <b className="text-slate-700">{fmt$(a.meta.totalRevenue)}</b> · {fmtN(a.meta.totalUnits)} u · {a.skus.length} SKUs · {a.clients.length} stores
      </div>
      <div>Source: Bamboo Dashboard pivot reconciled to Performance file.<br />Period {a.meta.startDate} → {a.meta.endDate}.</div>
    </div>
  );
}

// ============== Bulk Export Modal ==============
function BulkExport({a, onClose}) {
  const [mode, setMode] = useState('rep');
  const [rep, setRep] = useState('');
  const [storeTag, setStoreTag] = useState('HIGH VALUE — CALL NOW');
  const [selected, setSelected] = useState(new Set());
  const reps = useMemo(() => [...new Set(a.clients.map(c => c.sr || 'Unassigned'))].sort(), [a]);

  const ids = useMemo(() => {
    if (mode === 'rep') return a.clients.filter(c => (c.sr||'Unassigned') === rep).map(c => c.i);
    if (mode === 'tag') return a.clients.filter(c => c.storeTag === storeTag).map(c => c.i);
    return [...selected];
  }, [a, mode, rep, storeTag, selected]);

  const toggleSelect = (i) => {
    const s = new Set(selected);
    if (s.has(i)) s.delete(i); else s.add(i);
    setSelected(s);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-anim"
         style={{background:'rgba(15,23,42,0.32)', backdropFilter:'blur(8px) saturate(120%)', WebkitBackdropFilter:'blur(8px) saturate(120%)'}}
         onClick={onClose}>
      <div className="bg-white w-[680px] max-w-[95vw] rounded-xl flex flex-col max-h-[80vh] drawer-anim"
           style={{boxShadow:'0 20px 60px rgba(15,23,42,.25)'}}
           onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-baseline">
          <div>
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Bulk Call Sheet Export</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Generate a single printable PDF or CSV across many retailers.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 text-2xl leading-none -mt-1">×</button>
        </div>
        <div className="px-5 py-3 border-b border-slate-200 flex gap-1 text-xs bg-slate-50">
          {[['rep','By Rep'],['tag','By Store Tag'],['select','Manual Pick']].map(([k,l]) => (
            <button key={k} onClick={() => setMode(k)} className={`btn ${mode===k?'btn-primary':'btn-ghost'}`}>{l}</button>
          ))}
        </div>
        <div className="px-5 py-4 flex-1 overflow-auto">
          {mode === 'rep' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold small-caps">Sales Rep</label>
              <select value={rep} onChange={e => setRep(e.target.value)} className="block w-full mt-1 text-sm">
                <option value="">— pick a rep —</option>
                {reps.map(r => <option key={r} value={r}>{r} ({a.clients.filter(c => (c.sr||'Unassigned')===r).length} stores)</option>)}
              </select>
            </div>
          )}
          {mode === 'tag' && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold small-caps">Store Tag</label>
              <select value={storeTag} onChange={e => setStoreTag(e.target.value)} className="block w-full mt-1 text-sm">
                {['HIGH VALUE — CALL NOW','CROSS-SELL','CATEGORY EXPANSION','LOW PRIORITY','AT RISK'].map(t =>
                  <option key={t} value={t}>{t} ({a.clients.filter(c => c.storeTag===t).length})</option>)}
              </select>
            </div>
          )}
          {mode === 'select' && (
            <div>
              <div className="text-[11px] text-slate-600 mb-2">Click stores to include — sorted by opportunity score. <b>{selected.size}</b> selected.</div>
              <div className="border border-slate-200 rounded-md max-h-72 overflow-auto bg-white">
                {a.clients.slice().sort((x,y) => y.oppScore - x.oppScore).map(c => (
                  <label key={c.i} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-emerald-50 cursor-pointer border-b border-slate-100 last:border-0">
                    <input type="checkbox" checked={selected.has(c.i)} onChange={() => toggleSelect(c.i)} />
                    <span className="flex-1 truncate">{c.n}</span>
                    <Tag tag={c.storeTag} />
                    <span className="font-mono tabular-nums text-slate-500 w-10 text-right text-[11px]">{c.oppScore.toFixed(0)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-between items-center text-xs bg-slate-50 rounded-b-xl">
          <span className="font-mono tabular-nums text-slate-700"><b>{ids.length}</b> stores will be exported</span>
          <div className="flex gap-2">
            <button disabled={ids.length===0} onClick={() => exportCallSheetCSV(a, ids)} className="btn btn-ghost">Download CSV</button>
            <button disabled={ids.length===0} onClick={() => exportCallSheetPrintable(a, ids)} className="btn btn-emerald">Print / PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
