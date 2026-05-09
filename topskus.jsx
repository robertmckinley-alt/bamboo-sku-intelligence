/* eslint-disable */
const { useMemo, useState } = React;
const { fmt$, fmtN, fmtPct, fmtNum } = window.BambooCore;
const { Tag, TagChips, ScoreBar } = window.BambooUI;

// ============================================================
//   TOP SKUs TAB
// ============================================================
//
// Per high-level category, show top 25 individual products.
// Clicking a product opens the existing SkuDetail drawer for the
// SKU group that product belongs to. The drawer's existing
// "Retailers NOT carrying" table is the answer to "which stores
// don't have this product yet."
//
// Data caveat: distribution is recorded at SKU group level, not
// per individual product, so the non-carrier list is for the
// product's group. We surface this in the section header.
function TopSkusPanel({a, onPickSku}) {
  const products = a.products || [];

  // High-level categories sorted by total revenue
  const cats = useMemo(() => {
    if (!products.length) return [];
    const totals = {};
    for (const p of products) totals[p.c] = (totals[p.c] || 0) + p.rev;
    return Object.keys(totals).sort((x, y) => totals[y] - totals[x]);
  }, [products]);

  const [cat, setCat] = useState(cats[0] || 'All');
  const [sort, setSort] = useState({key: 'rev', dir: 'desc'});
  const [search, setSearch] = useState('');

  // Counts per category (for chip labels)
  const catCounts = useMemo(() => {
    const counts = {};
    for (const p of products) counts[p.c] = (counts[p.c] || 0) + 1;
    return counts;
  }, [products]);

  const catTotals = useMemo(() => {
    const t = {};
    for (const p of products) {
      if (!t[p.c]) t[p.c] = {rev: 0, u: 0};
      t[p.c].rev += p.rev; t[p.c].u += p.u;
    }
    return t;
  }, [products]);

  // Top 25 (after filter & sort) within selected category
  const rows = useMemo(() => {
    let arr = products.filter(p => p.c === cat);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(p => p.n.toLowerCase().includes(q) || (p.b||'').toLowerCase().includes(q));
    }
    const k = sort.key, m = sort.dir === 'asc' ? 1 : -1;
    arr.sort((x, y) => {
      const xv = x[k], yv = y[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr.slice(0, 50);
  }, [products, cat, search, sort]);

  const click = (k) => setSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}));
  const Th = ({k, label, align='left', hint}) => (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} title={hint} onClick={() => click(k)}>
      <span className="inline-flex items-center gap-1">{label}<span className="text-[8px] text-slate-300">{sort.key===k?(sort.dir==='asc'?'▲':'▼'):'▴▾'}</span></span>
    </th>
  );

  // For each category card on the left rail summary
  const catSummary = useMemo(() => cats.map(c => {
    const list = products.filter(p => p.c === c);
    return {cat: c, count: list.length, rev: catTotals[c]?.rev || 0, u: catTotals[c]?.u || 0};
  }), [cats, products, catTotals]);

  if (!products.length) {
    return (
      <div className="p-6 text-[12px] text-slate-500">
        No individual product data available. Add <span className="font-mono">products[]</span> to data/dataset.json.
      </div>
    );
  }

  // Per-row max for the inline share bar
  const maxRev = Math.max(1, ...rows.map(r => r.rev));
  const totalCatRev = catTotals[cat]?.rev || 1;
  const top25Rev = rows.reduce((s, r) => s + r.rev, 0);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-[18px] font-semibold tracking-tight">Top SKUs <span className="italic text-emerald-700">— individual products by category</span></h2>
          <span className="text-[10px] font-mono text-slate-500 small-caps">{products.length} products · {cats.length} categories · click row to open non-carriers list</span>
        </div>

        {/* Category chips */}
        <TagChips
          options={cats}
          value={cat}
          onChange={setCat}
          counts={catCounts}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
        {/* Main table */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-display text-[16px] font-semibold tracking-tight">{cat} <span className="text-slate-400 italic">— top 50</span></h3>
              <div className="text-[10px] font-mono text-slate-500 small-caps">
                {fmtN(catCounts[cat]||0)} products · top 50 = <b className="text-slate-700">{fmt$(top25Rev)}</b> ({fmtPct(top25Rev/totalCatRev, 0)} of {cat} revenue)
              </div>
            </div>
            <input id="topskus-search" type="search" placeholder="Search product or brand…"
                   value={search} onChange={e => setSearch(e.target.value)}
                   className="w-56 text-[11px]" />
          </div>
          <div className="overflow-auto" style={{maxHeight: '70vh'}}>
            <table className="dt">
              <thead>
                <tr>
                  <th className="text-right" style={{width: 36}}>#</th>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>SKU Group</th>
                  <Th k="rev" label="Revenue" align="right" />
                  <th className="text-right" style={{width: 110}}>Share</th>
                  <Th k="u" label="Units" align="right" />
                  <Th k="vel" label="Vel / mo" align="right" hint="Units per month" />
                  <th className="text-center" style={{width: 32}} title="Click to see stores not carrying">↗</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const groupName = a.skuById.get(p.sg)?.n || '—';
                  return (
                    <tr key={p.i} onClick={() => onPickSku(p.sg)} className="cursor-pointer"
                        title={`Click → open ${groupName} drawer with non-carriers list`}>
                      <td className="text-right tabular-nums font-mono text-slate-500">{i + 1}</td>
                      <td className="truncate max-w-[280px]" title={p.n}>{p.n}</td>
                      <td className="text-slate-600">{p.b || <span className="text-slate-300">—</span>}</td>
                      <td className="truncate max-w-[180px] text-slate-500" title={groupName}>{groupName}</td>
                      <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(p.rev)}</td>
                      <td className="text-right">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                            <div className="h-full" style={{width: ((p.rev/maxRev)*100)+'%', background: 'linear-gradient(90deg,#34d399,#047857)'}}></div>
                          </div>
                          <span className="font-mono tabular-nums text-[10px] text-slate-600 w-8 text-right">{fmtPct(p.rev/totalCatRev, 1)}</span>
                        </div>
                      </td>
                      <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(p.u)}</td>
                      <td className="text-right tabular-nums font-mono text-slate-500">{fmtNum(p.vel, 0)}</td>
                      <td className="text-center text-slate-300">›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-500 leading-relaxed">
            <b>Note:</b> Distribution data is at SKU-group level, not per individual product. Clicking a row opens the drawer for that product's SKU group ({rows[0] ? a.skuById.get(rows[0].sg)?.n : '—'}, etc.) — the "Retailers NOT carrying" list there is your call sheet.
          </div>
        </div>

        {/* Right rail: per-category summary */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-200 bg-slate-50">
            <h3 className="font-display text-[13px] font-semibold tracking-tight">All categories</h3>
            <div className="text-[9px] font-mono text-slate-500 small-caps">click to switch view</div>
          </div>
          <div className="divide-y divide-slate-100">
            {catSummary.map(c => (
              <button key={c.cat} onClick={() => setCat(c.cat)}
                      className={`w-full text-left px-3 py-2 transition ${cat===c.cat ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className={`text-[12px] font-semibold ${cat===c.cat ? 'text-emerald-900' : 'text-slate-800'}`}>{c.cat}</span>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">{c.count} skus</span>
                </div>
                <div className="font-mono tabular-nums text-[12px] text-slate-700">{fmt$(c.rev)}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex-1 h-1 rounded-full overflow-hidden bg-slate-100">
                    <div className="h-full" style={{width: ((c.rev/(catSummary[0]?.rev||1))*100)+'%', background: cat===c.cat ? 'linear-gradient(90deg,#34d399,#047857)' : '#94a3b8'}}></div>
                  </div>
                  <span className="text-[9px] font-mono text-slate-400 tabular-nums w-8 text-right">{fmtN(c.u)}u</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.BambooTopSkus = { TopSkusPanel };
