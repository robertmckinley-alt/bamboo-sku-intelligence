/* eslint-disable */
const { useState, useMemo } = React;
const { fmt$, fmtN, fmtPct, fmtNum } = window.BambooCore;
const { Tag, TagChips, ScoreBar, Sparkline } = window.BambooUI;

// Radial penetration ring
function PenetrationRing({pct, size=64, label, sub, color='#059669'}) {
  const r = size/2 - 5;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{width: size, height: size}}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} stroke="#e5e7eb" strokeWidth="5" fill="none" />
          <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth="5" fill="none"
                  strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                  transform={`rotate(-90 ${size/2} ${size/2})`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center font-mono tabular-nums">
          <div className="text-[12px] font-semibold text-slate-900 leading-none">{Math.round(pct*100)}%</div>
        </div>
      </div>
      {label && <div className="text-[10px] text-slate-600 font-semibold small-caps text-center">{label}</div>}
      {sub && <div className="text-[9px] text-slate-400 font-mono">{sub}</div>}
    </div>
  );
}

function CategoryCard({a, cat, onPickSku, onSelect, selected}) {
  const stats = useMemo(() => {
    const skus = a.skus.filter(s => s.c === cat);
    const rev = skus.reduce((sum, s) => sum + s.rev, 0);
    const units = skus.reduce((sum, s) => sum + s.u, 0);
    const totalStores = a.clients.length;
    // category penetration: % of stores carrying ANY sku in this category
    let storesWithCat = 0;
    for (const cl of a.clients) {
      const rs = a.byClient.get(cl.i) || [];
      const has = rs.some(([s,r,u]) => r > 0 && a.skuById.get(s)?.c === cat);
      if (has) storesWithCat++;
    }
    const penetration = storesWithCat / totalStores;
    const avgScore = skus.length ? skus.reduce((s, x) => s + x.score, 0) / skus.length : 0;
    const top = [...skus].sort((x,y) => y.rev - x.rev).slice(0, 5);
    const tagCounts = {SCALE:0, PUSH:0, MONITOR:0, FIX:0, CUT:0};
    for (const s of skus) tagCounts[s.tag] = (tagCounts[s.tag]||0) + 1;
    const oppSum = skus.reduce((s, x) => s + x.oppEst, 0);
    return { skus, rev, units, penetration, avgScore, top, tagCounts, oppSum, storesWithCat };
  }, [a, cat]);

  const revShare = stats.rev / a.meta.totalRevenue;

  return (
    <div className={`bg-white border rounded-lg overflow-hidden cursor-pointer transition ${selected?'border-emerald-500 ring-2 ring-emerald-200':'border-slate-200 hover:border-slate-300'}`}
         style={{boxShadow:'0 1px 0 rgba(15,23,42,.04)'}}
         onClick={() => onSelect(cat)}>
      <div className="px-4 py-3 border-b border-slate-200 flex items-start gap-3">
        <PenetrationRing pct={stats.penetration} label={null} color="#059669" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-slate-900 leading-tight truncate">{cat}</h3>
            <span className="text-[9px] font-mono text-slate-400 tabular-nums small-caps">{stats.skus.length} SKUs</span>
          </div>
          <div className="font-mono tabular-nums text-[16px] font-semibold text-slate-900">{fmt$(stats.rev)}</div>
          <div className="text-[10px] font-mono text-slate-500 tabular-nums mt-0.5">
            {fmtPct(revShare,1)} of total · {fmtN(stats.units)}u · {stats.storesWithCat}/{a.clients.length} stores
          </div>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-1.5">
        {Object.entries(stats.tagCounts).filter(([k,v]) => v > 0).map(([k,v]) => (
          <Tag key={k} tag={k} />
        )).map((el, i) => <span key={i} className="inline-flex items-center gap-1">{el}<span className="text-[10px] font-mono text-slate-400 tabular-nums">{stats.tagCounts[el.props.tag]}</span></span>)}
      </div>
      <table className="dt">
        <tbody>
          {stats.top.map((s, i) => (
            <tr key={s.i} onClick={(e) => { e.stopPropagation(); onPickSku(s.i); }} className="cursor-pointer">
              <td className="text-[10px] tabular-nums text-slate-400 w-6 text-right font-mono">#{s.rank}</td>
              <td className="truncate max-w-[180px]">{s.n}</td>
              <td className="text-right tabular-nums font-mono text-slate-700">{fmt$(s.rev)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Detailed leaderboard for a selected category
function CategoryLeaderboard({a, cat, onPickSku}) {
  const [sort, setSort] = useState({key: 'score', dir: 'desc'});
  const skus = useMemo(() => {
    let arr = a.skus.filter(s => s.c === cat);
    const k = sort.key;
    const m = sort.dir === 'asc' ? 1 : -1;
    arr.sort((x,y) => {
      const xv = x[k], yv = y[k];
      if (typeof xv === 'string') return (xv||'').localeCompare(yv||'') * m;
      return ((xv ?? 0) - (yv ?? 0)) * m;
    });
    return arr.slice(0, 25);
  }, [a, cat, sort]);

  const click = (k) => setSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}));
  const Th = ({k, label, align='left'}) => (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} onClick={() => click(k)}>
      <span className="inline-flex items-center gap-1">{label}<span className="text-[8px] text-slate-300">{sort.key===k?(sort.dir==='asc'?'▲':'▼'):'▴▾'}</span></span>
    </th>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div>
          <h3 className="font-display text-[16px] font-semibold tracking-tight">{cat} <span className="text-slate-400 italic">— leaderboard</span></h3>
          <div className="text-[10px] font-mono text-slate-500 small-caps">top 25 by score</div>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="dt">
          <thead>
            <tr>
              <Th k="rank" label="#" align="right" />
              <Th k="n" label="SKU" />
              <Th k="score" label="Score" align="right" />
              <Th k="tag" label="Tag" />
              <Th k="rev" label="Revenue" align="right" />
              <Th k="u" label="Units" align="right" />
              <Th k="stores" label="Stores" align="right" />
              <Th k="velocity" label="Vel." align="right" />
              <Th k="oppEst" label="Opp $" align="right" />
            </tr>
          </thead>
          <tbody>
            {skus.map(s => (
              <tr key={s.i} onClick={() => onPickSku(s.i)} className="cursor-pointer">
                <td className="text-right tabular-nums font-mono text-slate-500">{s.rank}</td>
                <td className="truncate max-w-[260px]">{s.n}</td>
                <td className="text-right" style={{minWidth:120}}><ScoreBar score={s.score} height={5} /></td>
                <td><Tag tag={s.tag} /></td>
                <td className="text-right tabular-nums font-mono">{fmt$(s.rev)}</td>
                <td className="text-right tabular-nums font-mono text-slate-500">{fmtN(s.u)}</td>
                <td className="text-right tabular-nums font-mono">{s.stores}/{a.clients.length}</td>
                <td className="text-right tabular-nums font-mono">{fmtNum(s.velocity, 0)}</td>
                <td className="text-right tabular-nums font-mono text-emerald-700">{fmt$(s.oppEst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ============== Top Products by Category (individual SKU level) ==============
// Drills below the SKU-group level. Source: data.products[] — individual products
// from the Products Ordered file, mapped to SKU group + high-level category.
function TopProductsByCategory({a, onPickSku}) {
  const products = a.products || [];
  const cats = useMemo(() => {
    if (!products.length) return [];
    const totals = {};
    for (const p of products) totals[p.c] = (totals[p.c] || 0) + p.rev;
    return Object.keys(totals).sort((x, y) => totals[y] - totals[x]);
  }, [products]);

  const [cat, setCat] = useState('All');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('All');
  const [sort, setSort] = useState({key: 'rev', dir: 'desc'});
  const [topN, setTopN] = useState(50);

  const brandOptions = useMemo(() => {
    const set = new Set(['All']);
    for (const p of products) if (p.b) set.add(p.b);
    return [...set].sort();
  }, [products]);

  const rows = useMemo(() => {
    let arr = products.slice();
    if (cat !== 'All') arr = arr.filter(p => p.c === cat);
    if (brandFilter !== 'All') arr = arr.filter(p => p.b === brandFilter);
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
    return arr.slice(0, topN);
  }, [products, cat, brandFilter, search, sort, topN]);

  const catCounts = useMemo(() => {
    const counts = {All: products.length};
    for (const p of products) counts[p.c] = (counts[p.c] || 0) + 1;
    return counts;
  }, [products]);

  const catTotals = useMemo(() => {
    const t = {};
    for (const p of products) {
      if (!t[p.c]) t[p.c] = {rev: 0, u: 0, count: 0};
      t[p.c].rev += p.rev; t[p.c].u += p.u; t[p.c].count += 1;
    }
    return t;
  }, [products]);

  const click = (k) => setSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}));
  const Th = ({k, label, align='left', hint}) => (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} title={hint} onClick={() => click(k)}>
      <span className="inline-flex items-center gap-1">{label}<span className="text-[8px] text-slate-300">{sort.key===k?(sort.dir==='asc'?'▲':'▼'):'▴▾'}</span></span>
    </th>
  );

  if (!products.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-[12px] text-slate-500">
        No individual product data in dataset. Add <span className="font-mono">products[]</span> to data/dataset.json.
      </div>
    );
  }

  const maxRev = Math.max(1, ...rows.map(r => r.rev));
  const totalShownRev = rows.reduce((s, r) => s + r.rev, 0);
  const totalCatRev = cat === 'All' ? a.meta.totalRevenue : (catTotals[cat]?.rev || 1);

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-[16px] font-semibold tracking-tight">Top Performing SKUs <span className="text-slate-400 italic">— by product category</span></h3>
          <div className="text-[10px] font-mono text-slate-500 small-caps">{products.length} individual products · click a row to open its SKU group</div>
        </div>
        <div className="flex items-center gap-2">
          <input id="prod-search" type="search" placeholder="Search product or brand…"
                 value={search} onChange={e => setSearch(e.target.value)}
                 className="w-56 text-[11px]" />
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="text-[11px]">
            {brandOptions.map(b => <option key={b} value={b}>{b === 'All' ? 'All brands' : b}</option>)}
          </select>
          <select value={topN} onChange={e => setTopN(parseInt(e.target.value))} className="text-[11px]">
            {[25, 50, 100, 250, 1000].map(n => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
      </div>
      <div className="px-4 py-2 border-b border-slate-200 bg-white">
        <TagChips
          options={['All', ...cats]}
          value={cat}
          onChange={setCat}
          counts={catCounts}
        />
      </div>
      <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-500 tabular-nums flex items-center gap-4">
        <span>Showing <b className="text-slate-700">{rows.length}</b> of {products.length}</span>
        <span>Filter rev: <b className="text-slate-700">{fmt$(totalShownRev)}</b></span>
        <span>{cat === 'All' ? 'Of total' : `Of ${cat}`}: <b className="text-emerald-700">{fmtPct(totalShownRev/totalCatRev, 1)}</b></span>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="dt">
          <thead>
            <tr>
              <Th k="rkC" label="#" align="right" hint="Rank within high-level category" />
              <th className="text-left">Product</th>
              <th className="text-left">Brand</th>
              <th className="text-left">SKU Group</th>
              <th className="text-left">Category</th>
              <Th k="rev" label="Revenue" align="right" />
              <th className="text-right" style={{width:120}}>Share</th>
              <Th k="u" label="Units" align="right" />
              <Th k="vel" label="Vel / mo" align="right" hint="Units per month" />
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const groupName = a.skuById.get(p.sg)?.n || '—';
              return (
                <tr key={p.i} onClick={() => onPickSku(p.sg)} className="cursor-pointer">
                  <td className="text-right tabular-nums font-mono text-slate-500">{p.rkC}</td>
                  <td className="truncate max-w-[280px]" title={p.n}>{p.n}</td>
                  <td className="text-slate-600">{p.b || <span className="text-slate-300">—</span>}</td>
                  <td className="truncate max-w-[180px] text-slate-500" title={groupName}>{groupName}</td>
                  <td><span className="pill" style={{background:'rgba(11,18,32,.04)', color:'#374151', borderColor:'#e5e7eb'}}>{p.c}</span></td>
                  <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(p.rev)}</td>
                  <td className="text-right" style={{minWidth:120}}>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                        <div className="h-full" style={{width: ((p.rev/maxRev)*100)+'%', background:'linear-gradient(90deg,#34d399,#047857)'}}></div>
                      </div>
                      <span className="font-mono tabular-nums text-[10px] text-slate-600 w-8 text-right">{fmtPct(p.rev/totalCatRev, 1)}</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(p.u)}</td>
                  <td className="text-right tabular-nums font-mono text-slate-500">{fmtNum(p.vel, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoryLeaderboards({a, onPickSku}) {
  const cats = useMemo(() => {
    const arr = [...a.cats];
    arr.sort((x, y) => {
      const rx = a.skus.filter(s => s.c === x).reduce((s, v) => s + v.rev, 0);
      const ry = a.skus.filter(s => s.c === y).reduce((s, v) => s + v.rev, 0);
      return ry - rx;
    });
    return arr;
  }, [a]);
  const [selected, setSelected] = useState(cats[0]);

  // Top performers across ALL categories
  const summary = useMemo(() => {
    return cats.map(c => {
      const skus = a.skus.filter(s => s.c === c);
      const rev = skus.reduce((s, x) => s + x.rev, 0);
      const units = skus.reduce((s, x) => s + x.u, 0);
      const oppSum = skus.reduce((s, x) => s + x.oppEst, 0);
      const avgScore = skus.length ? skus.reduce((s, x) => s + x.score, 0) / skus.length : 0;
      let storesWithCat = 0;
      for (const cl of a.clients) {
        const rs = a.byClient.get(cl.i) || [];
        const has = rs.some(([s,r,u]) => r > 0 && a.skuById.get(s)?.c === c);
        if (has) storesWithCat++;
      }
      return {cat: c, rev, units, oppSum, avgScore, count: skus.length, penetration: storesWithCat/a.clients.length, storesWithCat};
    });
  }, [a, cats]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-[18px] font-semibold tracking-tight">Category Leaderboards</h2>
          <span className="text-[10px] font-mono text-slate-500 small-caps">{cats.length} categories · click a card for detail</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {cats.map(c => <CategoryCard key={c} a={a} cat={c} onPickSku={onPickSku} onSelect={setSelected} selected={selected===c} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <CategoryLeaderboard a={a} cat={selected} onPickSku={onPickSku} />
        </div>
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="font-display text-[16px] font-semibold tracking-tight">Category index</h3>
            <div className="text-[10px] font-mono text-slate-500 small-caps">all categories at a glance</div>
          </div>
          <table className="dt">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">% of total</th>
                <th className="text-right">Stores</th>
                <th className="text-right">Penetration</th>
                <th className="text-right">Avg score</th>
                <th className="text-right">Opp $</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.cat} onClick={() => setSelected(s.cat)} className={`cursor-pointer ${selected===s.cat?'selected':''}`}>
                  <td><div className="flex items-center gap-2"><span className="w-1.5 h-3 rounded-sm" style={{background:'#0b1220'}}></span>{s.cat}</div></td>
                  <td className="text-right tabular-nums font-mono">{s.count}</td>
                  <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(s.rev)}</td>
                  <td className="text-right tabular-nums font-mono text-slate-500">{fmtPct(s.rev/a.meta.totalRevenue,1)}</td>
                  <td className="text-right tabular-nums font-mono">{s.storesWithCat}</td>
                  <td className="text-right" style={{width:100}}>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-100">
                        <div className="h-full" style={{width: (s.penetration*100)+'%', background:'linear-gradient(90deg,#34d399,#047857)'}}></div>
                      </div>
                      <span className="font-mono tabular-nums text-[10px] text-slate-600 w-7 text-right">{Math.round(s.penetration*100)}%</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums font-mono">{s.avgScore.toFixed(0)}</td>
                  <td className="text-right tabular-nums font-mono text-emerald-700">{fmt$(s.oppSum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-[18px] font-semibold tracking-tight">Top Performing Products <span className="italic text-emerald-700">— individual SKUs</span></h2>
          <span className="text-[10px] font-mono text-slate-500 small-caps">{(a.products||[]).length} products · ranked within high-level category</span>
        </div>
        <TopProductsByCategory a={a} onPickSku={onPickSku} />
      </div>
    </div>
  );
}

window.BambooCategories = { CategoryLeaderboards, CategoryCard, PenetrationRing, TopProductsByCategory };
