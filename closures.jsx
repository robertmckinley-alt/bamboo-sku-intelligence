/* eslint-disable */

// BSI_TRANSFORM_V1 — dedup + retag + category override for closures.json.
// Applied at load time so filters, KPIs, and log rows all see clean data.
const BSI_CAT_OVERRIDES = [
  { m: /live\s*resin.*(gumm|chocolat|caramel|brownie|cookie|candy|mint|hard\s*candy|lozeng|taff|choc)/i, cat: 'Edibles' },
  { m: /\bLR\s*(gumm|chocolat|caramel|brownie|cookie|candy|edible)/i, cat: 'Edibles' },
];
function bsiFixCategory(c) {
  const src = (c.skuName || '') + ' | ' + (c.skuGroup || c.skuName || '');
  for (const r of BSI_CAT_OVERRIDES) if (r.m.test(src)) return r.cat;
  return c.category || 'Other';
}
function transformClosures(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return arr || [];
  const patched = arr.map(c => Object.assign({}, c, { category: bsiFixCategory(c) }));
  const sorted = patched.slice().sort((a, b) => (a.ts || '') < (b.ts || '') ? -1 : (a.ts || '') > (b.ts || '') ? 1 : 0);
  const seenGrp = new Set();
  const deduped = [];
  for (const c of sorted) {
    const grp = c.skuGroup || c.skuName || '';
    const client = c.clientName || c.client || c.store;
    if (!client || !grp) continue;
    const k = client + '||' + grp;
    if (seenGrp.has(k)) continue;
    seenGrp.add(k);
    deduped.push(c);
  }
  const seenCat = new Set();
  return deduped.map(c => {
    const catKey = (c.clientName || c.client || c.store) + '||' + c.category;
    const isCatNew = !seenCat.has(catKey);
    if (isCatNew) seenCat.add(catKey);
    return Object.assign({}, c, { type: isCatNew ? 'cat-new' : 'top-sku' });
  });
}
const { useState, useEffect, useMemo } = React;
const { fmt$, fmtN, fmtPct } = window.BambooCore;
const { Tag } = window.BambooUI;

// ============================================================
//   CLOSURES TAB — track "void closures" (new SKU placements)
// ============================================================
//
// A "closure" = new business in an existing store: either a priority
// SKU first ordered at a store ("top-sku") or a retail-category line
// first opened at a store ("cat-new"). Spec v2026-06-08-d. The daily
// cron (scripts/refresh_closures.py) rebuilds data/closures.json from
// scratch each run with both Sales Rep and VMI Rep attribution.
//
// MIN_CLOSURE_DATE is a hard floor — events on or before this date
// are discarded everywhere in the UI. The 5/13 bootstrap run
// emitted ~12k events for already-active (store, SKU) pairs
// because no previous snapshot existed; those are NOT true voids
// and must never appear in this report. Only events strictly
// AFTER this date represent a true void closing.
//
// This tab loads closures.json, filters by date range / rep /
// search, and exports CSV for reporting up the chain.
const MIN_CLOSURE_DATE = '2026-05-31';  // exclusive — closures dated 6/1 or later are post-baseline (spec v2026-06-08-d)
const DATA_START      = '2026-06-01';  // inclusive — ledger start per spec v2026-06-08-d

function ClosuresPanel({a, hide}) {
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState(null);

  const [repType, setRepType] = useState('sr');       // 'sr' | 'vr'
  const [repFilter, setRepFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');   // 'All' | 'top-sku' | 'cat-new'

  const [range, setRange] = useState('thisweek');     // 'thisweek' | 'lastweek' | '30d' | '90d' | 'mtd' | 'qtd' | 'ytd' | 'all' | 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({key: 'ts', dir: 'desc'});

  // Site-wide VMI roster gate. Same allowlist as apiAdapter.jsx — anything else
  // collapses to 'Unassigned' so VMI counts/dropdowns/CSVs stay clean.
  const VMI_PATTERNS = [/^josh\s+novak\b/i, /^koen\b/i, /^curtis\b/i];
  const normVmiClosure = (rn) => {
    const t = (rn || '').replace(/\s*-\s*house\s*$/i, '').trim();
    return VMI_PATTERNS.some(p => p.test(t)) ? t : 'Unassigned';
  };
  const [trackerStart, setTrackerStart] = useState(null);
  useEffect(() => {
    fetch('data/tracker_meta.json?v=' + (window.__BAMBOO_BUILD || Date.now()), {cache: 'no-cache'})
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j && j.tracker_start) setTrackerStart(j.tracker_start); })
      .catch(()=>{});
  }, []);
  useEffect(() => {
    fetch('data/closures.json?v=' + (window.__BAMBOO_BUILD || Date.now()), {cache: 'no-cache'})
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        // Support both array-of-objects and compact {cols, rows} form
        if (d && d.cols && d.rows) {
          const c = d.cols;
          const arr = d.rows.map(row => {
            const obj = {};
            for (let i = 0; i < c.length; i++) obj[c[i]] = row[i];
            // Legacy rows (pre product-level): default type and skuGroup.
            if (!obj.type) obj.type = 'top-sku';
            if (!obj.skuGroup) obj.skuGroup = obj.skuName || '';
            obj.vr = normVmiClosure(obj.vr);
            return obj;
          });
          setClosures(transformClosures(arr));
        } else {
          // Older array-of-objects shape; still backfill.
          const arr = (d || []).map(o => {
            if (!o.type) o.type = 'top-sku';
            if (!o.skuGroup) o.skuGroup = o.skuName || '';
            o.vr = normVmiClosure(o.vr);
            return o;
          });
          setClosures(transformClosures(arr));
        }
      })
      .catch(e => { setError(String(e)); setClosures(transformClosures([])); });
  }, []);

  // Apply the AppBar brand-hide pills (Micro Bar / Sungaze / PICC) to closures
  // BEFORE any downstream count or filter runs — so the KPI, rep summary,
  // rep dropdown, and table all reflect whichever pills are on.
  const closuresVisible = useMemo(() => {
    if (!closures) return null;
    const patterns = [];
    if (hide && hide.mb)   patterns.push('micro bar');
    if (hide && hide.sg)   patterns.push('sungaze');
    if (hide && hide.picc) patterns.push('picc');
    if (!patterns.length) return closures;
    return closures.filter(c => {
      const n1 = (c.skuName || '').toLowerCase();
      const n2 = (c.skuGroup || '').toLowerCase();
      for (const p of patterns) { if (n1.includes(p) || n2.includes(p)) return false; }
      return true;
    });
  }, [closures, hide]);

  // Resolve the active date range to [from, to] inclusive. The lower bound is
  // clamped to DATA_START so the longer chips (90d, QTD, YTD, All) silently
  // shrink to 'everything we have' until our coverage actually reaches that far.
  // rangeInfo.clamped is true when the requested range was wider than the data
  // (used to surface a 'data starts 5/3' hint in the UI).
  // Earliest day we actually have closure data for. Dynamic — uses the min
  // ts in the loaded closures, fenced to the conceptual baseline (5/3). The
  // 5/3 rebuild dated all pre-baseline events to a 5/13 sentinel, so this
  // resolves to 5/13 today and grows backward only if older data lands.
  const dataStart = useMemo(() => {
    if (!closures || !closures.length) return DATA_START;
    let m = '9999-12-31';
    for (const c of closures) {
      if (c.ts && c.ts > MIN_CLOSURE_DATE && c.ts < m) m = c.ts;
    }
    return (m < DATA_START) ? m : (m === '9999-12-31' ? DATA_START : m);
  }, [closures]);

  const {dateFrom, dateTo, rangeInfo} = useMemo(() => {
    // Date-range boundaries computed in America/Los_Angeles so a week
    // closes at midnight Pacific, not midnight UTC.
    const PT_TZ = 'America/Los_Angeles';
    const _dowNamesPT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const ptYmd = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: PT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const ptDow = (d) => _dowNamesPT.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: PT_TZ, weekday: 'short' }).format(d));
    const ptDateFromYmd = (y, m, d) => {
      let g = new Date(Date.UTC(y, m - 1, d, 19, 0, 0));
      const p = ptYmd(g).split('-').map(Number);
      if (p[0] !== y || p[1] !== m || p[2] !== d) {
        const diff = (Date.UTC(y, m - 1, d) - Date.UTC(p[0], p[1] - 1, p[2])) / 86400000;
        g = new Date(g.getTime() + diff * 86400000);
      }
      return g;
    };
    const today = new Date();
    const toIso = ptYmd(today);
    const [ptY, ptM, ptD] = toIso.split('-').map(Number);
    const days = (n) => ptYmd(new Date(today.getTime() - n * 86400000));
    let requestedFrom = dataStart;
    let to = toIso;
    let label = range;
    // Week-bounds helper: Monday->Sunday in UTC so week math doesn't drift
    // across DST. Returns [mondayISO, sundayISO].
    const weekBounds = (refDate) => {
      const dow = ptDow(refDate);
      const offsetToMon = (dow === 0) ? -6 : (1 - dow);
      const [ry, rm, rd] = ptYmd(refDate).split('-').map(Number);
      const mon = ptDateFromYmd(ry, rm, rd);
      mon.setUTCDate(mon.getUTCDate() + offsetToMon);
      const sun = new Date(mon.getTime() + 6 * 86400000);
      return [ptYmd(mon), ptYmd(sun)];
    };
    if      (range === 'all')      requestedFrom = '0000-01-01';
    else if (range === 'thisweek') { const [m,_su] = weekBounds(today); requestedFrom = m; /* to stays today */ }
    else if (range === 'lastweek') { const [m,_su] = weekBounds(today);
                                     const [my, mm, md] = m.split('-').map(Number);
                                     const prevMon = ptDateFromYmd(my, mm, md);
                                     prevMon.setUTCDate(prevMon.getUTCDate() - 7);
                                     const prevSun = new Date(prevMon.getTime() + 6 * 86400000);
                                     requestedFrom = ptYmd(prevMon);
                                     to = ptYmd(prevSun); }
    else if (range === '7d')       requestedFrom = days(7);
    else if (range === '30d')      requestedFrom = days(30);
    else if (range === '90d')    requestedFrom = days(90);
    else if (range === 'mtd')    requestedFrom = String(ptY) + '-' + String(ptM).padStart(2,'0') + '-01';
    else if (range === 'qtd')    { const q = Math.floor((ptM - 1) / 3) * 3 + 1; requestedFrom = String(ptY) + '-' + String(q).padStart(2,'0') + '-01'; }
    else if (range === 'ytd')    requestedFrom = String(ptY) + '-01-01';
    else if (range === 'custom') { requestedFrom = customFrom || dataStart; to = customTo || toIso; }
    // Clamp every chip's lower bound to where data actually begins. Today the
    // 30d chip (5/6) clamps to 5/13 since pre-5/13 events were folded into a
    // sentinel during the 5/3 rebuild. As real days accrue, 30d will catch up
    // first, then 90d, etc.
    const effectiveFrom = (requestedFrom < dataStart) ? dataStart : requestedFrom;
    const clamped = (effectiveFrom !== requestedFrom);
    return {dateFrom: effectiveFrom, dateTo: to, rangeInfo: {requestedFrom, clamped, label}};
  }, [range, customFrom, customTo, dataStart]);

  // Build the rep dropdown from the LIVE analytics roster (all reps, even those
  // with no closures yet) PLUS any names that show up in historical closures
  // (covering reps who left but have past attribution).
  const repOptions = useMemo(() => {
    const s = new Set();
    const skipUnassigned = (k) => (repType === 'vr' && k === 'Unassigned');
    if (a && a.clients) {
      for (const cl of a.clients) {
        if (cl.active === false) continue;
        const k = cl[repType] || 'Unassigned';
        if (!k || skipUnassigned(k)) continue;
        s.add(k);
      }
    }
    if (closuresVisible) {
      for (const c of closuresVisible) {
        const k = c[repType] || 'Unassigned';
        if (!k || skipUnassigned(k)) continue;
        s.add(k);
      }
    }
    return ['All', ...[...s].sort()];
  }, [closures, repType, a]);

  // Lookup: rep name -> number of stores assigned today (for the dropdown counts)
  const repStoreCounts = useMemo(() => {
    const out = {};
    if (a && a.clients) {
      for (const cl of a.clients) {
        if (cl.active === false) continue;
        const k = cl[repType] || 'Unassigned';
        out[k] = (out[k] || 0) + 1;
      }
    }
    return out;
  }, [a, repType]);

  React.useEffect(() => { setRepFilter('All'); }, [repType]);

  const filtered = useMemo(() => {
    if (!closuresVisible) return [];
    let arr = closuresVisible.filter(c => c.ts > MIN_CLOSURE_DATE && c.ts >= dateFrom && c.ts <= dateTo);
    if (repFilter !== 'All') arr = arr.filter(c => (c[repType] || 'Unassigned') === repFilter);
    if (typeFilter !== 'All') arr = arr.filter(c => (c.type || 'top-sku') === typeFilter);
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
  }, [closuresVisible, dateFrom, dateTo, repFilter, repType, typeFilter, search, sort]);

  // Per-rep summary (within current date range)
  const repSummary = useMemo(() => {
    if (!closuresVisible) return [];
    const inRange = closuresVisible.filter(c => c.ts > MIN_CLOSURE_DATE && c.ts >= dateFrom && c.ts <= dateTo);
    const map = new Map();
    for (const c of inRange) {
      const k = c[repType] || 'Unassigned';
      if (!map.has(k)) map.set(k, {name: k, count: 0, rev: 0, units: 0, stores: new Set(), skus: new Set()});
      const r = map.get(k);
      r.count += 1; r.rev += c.rev || 0; r.units += c.units || 0;
      r.stores.add(c.clientName); r.skus.add(c.skuName);
    }
    return [...map.values()].map(r => ({...r, stores: r.stores.size, skus: r.skus.size}))
      .sort((x, y) => y.rev - x.rev);
  }, [closuresVisible, dateFrom, dateTo, repType]);

  // Aggregate totals — split count by closure type so the rep can see how
  // many wins were brand-new SKU groups vs expansions within an existing one.
  const totals = useMemo(() => {
    const rev = filtered.reduce((s, c) => s + (c.rev || 0), 0);
    const units = filtered.reduce((s, c) => s + (c.units || 0), 0);
    const stores = new Set(filtered.map(c => c.clientName)).size;
    // SKU groups: distinct parent group names (group rows use skuName; product rows
    // use skuGroup). This is the real ~82 SKU-group universe, not 1,000+ product names.
    const groups = new Set(filtered.map(c => c.skuGroup).filter(Boolean)).size;
    // Products: distinct individual products won (only meaningful on type=product rows).
    const products = new Set(filtered.filter(c => (c.type || "top-sku") === "cat-new").map(c => c.skuName || "")).size;
    let topSkuCount = 0, catNewCount = 0;
    for (const c of filtered) {
      if ((c.type || "top-sku") === "cat-new") catNewCount += 1; else topSkuCount += 1;
    }
    return {count: filtered.length, rev, units, stores, groups, products, topSkuCount, catNewCount};
  }, [filtered]);

  const click = (k) => setSort(s => ({key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc'}));
  const Th = ({k, label, align='left', hint}) => (
    <th className={`sortable ${align==='right'?'text-right':'text-left'}`} title={hint} onClick={() => click(k)}>
      <span className="inline-flex items-center gap-1">{label}<span className="text-[8px] text-slate-300">{sort.key===k?(sort.dir==='asc'?'▲':'▼'):'▴▾'}</span></span>
    </th>
  );

  const exportCsv = () => {
    const rows = [['Date','Store','Type','SKU / Product','Parent SKU Group','Category','Revenue','Units','Sales Rep','VMI Rep'].join(',')];
    for (const c of filtered) {
      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      };
      const t = c.type || 'top-sku';
      const grp = c.skuGroup || (t === 'top-sku' ? c.skuName : '');
      rows.push([c.ts, c.clientName, t, c.skuName, grp, c.category, c.rev, c.units, c.sr, c.vr].map(esc).join(','));
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

  const empty = (closuresVisible || []).length === 0;

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Void Closures <span className="italic text-emerald-700">— new SKU placements</span></h2>
            <div className="text-[10px] font-mono text-slate-500 small-caps mt-0.5">
              {empty
                ? `no closures recorded yet — ${fmtN(repOptions.length - 1)} ${repType==='sr'?'sales':'VMI'} reps in roster · daily refresh will populate this list`
                : `${fmtN((closuresVisible || []).length)} total closures recorded${(closures && closuresVisible && closuresVisible.length !== closures.length) ? ' (' + fmtN(closures.length - closuresVisible.length) + ' hidden by brand filter)' : ''} · ${fmtN(filtered.length)} in current view · ${fmtN(repOptions.length - 1)} ${repType==='sr'?'sales':'VMI'} reps in roster${trackerStart ? ' · tracker started ' + trackerStart : ''}`}
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
              {[['thisweek','This Week'],['lastweek','Last Week'],['30d','30d'],['90d','90d'],['mtd','MTD'],['qtd','QTD'],['ytd','YTD'],['all','All'],['custom','Custom']].map(([k,l]) => (
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
            {rangeInfo.clamped && (
              <span className="text-[10px] font-mono text-amber-700 ml-2" title={"The selected range is wider than the data we have. Showing everything since " + dataStart + " — the same data you'd see on the All chip until tracking catches up."}>data only since {dataStart}</span>
            )}
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

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Type</span>
            <div className="flex bg-slate-100 rounded-md p-0.5 text-[10px] font-semibold">
              {[['All','All'],['top-sku','Top SKU'],['cat-new','New Category']].map(([k,l]) => (
                <button key={k} onClick={() => setTypeFilter(k)}
                        className={`px-2 py-0.5 rounded ${typeFilter===k?'bg-slate-900 text-white shadow-sm':'text-slate-600 hover:text-slate-900'}`}>{l}</button>
              ))}
            </div>
            <span className="text-[10px] font-mono text-slate-400">top-sku = priority SKU first ordered at this store · cat-new = retail-category line first opened at this store</span>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Closures</div>
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.count)}</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5"><span className="text-emerald-700">{fmtN(totals.topSkuCount)} top-sku</span> · <span className="text-amber-700">{fmtN(totals.catNewCount)} cat-new</span></div>
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
          <div className="font-mono tabular-nums text-[18px] font-semibold text-slate-900 mt-0.5">{fmtN(totals.groups)}</div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5">{fmtN(totals.products)} unique products</div>
        </div>
      </div>

      {empty ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <h3 className="font-display text-[16px] font-semibold text-slate-700 mb-2">No closures recorded yet</h3>
          <p className="text-[12px] text-slate-500 max-w-md mx-auto leading-relaxed">
            Closures appear here once the daily refresh detects new placements.
            The GitHub Actions cron runs <span className="font-mono">scripts/refresh_closures.py</span> at 14:00 UTC — it diffs today's API snapshot against the frozen 5/31 baseline and rebuilds <span className="font-mono">data/closures.json</span>.
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
                <span className="ml-auto font-mono text-slate-700">{filtered.length > 1500 ? 'showing first 1,500 of ' + fmtN(filtered.length) + ' — export CSV for full set' : fmtN(filtered.length) + ' rows'}</span>
              </h3>
            </div>
            <div className="overflow-auto" style={{maxHeight: '70vh'}}>
              <table className="dt">
                <thead>
                  <tr>
                    <Th k="ts" label="Date" />
                    <Th k="clientName" label="Store" />
                    <Th k="type" label="Type" />
                    <Th k="skuName" label="SKU / Product" />
                    <Th k="category" label="Category" />
                    <Th k="rev" label="Revenue" align="right" />
                    <Th k="units" label="Units" align="right" />
                    <Th k="sr" label="Sales Rep" />
                    <Th k="vr" label="VMI Rep" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 1500).map((c, i) => {
                    const t = c.type || 'top-sku';
                    const isProd = t === 'cat-new';
                    return (
                      <tr key={i}>
                        <td className="font-mono tabular-nums text-[10px] text-slate-600">{c.ts}</td>
                        <td className="truncate max-w-[200px]" title={c.clientName}>{c.clientName}</td>
                        <td>
                          <span className="pill" style={{
                            background: isProd ? 'rgba(245,158,11,.10)' : 'rgba(5,150,105,.10)',
                            color: isProd ? '#92400e' : '#065f46',
                            borderColor: isProd ? '#fde68a' : '#a7f3d0'}}
                            title={isProd ? 'Retail-category line first opened at this store' : 'Priority SKU first ordered at this store'}>
                            {isProd ? 'New Category' : 'Top SKU'}
                          </span>
                        </td>
                        <td className="max-w-[240px]">
                          <div className="truncate" title={c.skuName}>{c.skuName}</div>
                          {isProd && c.skuGroup ? (
                            <div className="text-[10px] text-slate-500 font-mono truncate" title={'parent: ' + c.skuGroup}>↳ {c.skuGroup}</div>
                          ) : null}
                        </td>
                        <td><span className="pill" style={{background: 'rgba(11,18,32,.04)', color: '#374151', borderColor: '#e5e7eb'}}>{c.category}</span></td>
                        <td className="text-right tabular-nums font-mono text-emerald-700 font-semibold">{fmt$(c.rev)}</td>
                        <td className="text-right tabular-nums font-mono text-slate-700">{fmtN(c.units)}</td>
                        <td className="truncate max-w-[140px] text-slate-700">{c.sr}</td>
                        <td className="truncate max-w-[140px] text-slate-700">{c.vr}</td>
                      </tr>
                    );
                  })}
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
