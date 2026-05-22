// apiAdapter.jsx — transforms the Bamboo Intelligence API into the dataset
// shape that BambooCore.buildAnalytics expects. Drop-in replacement for
// the static data/dataset.json fetch.
//
// Exposes window.BambooApiAdapter = { fetchReport, adapt, loadLiveDataset, API_URL }

(function () {
  const API_URL = 'https://api-intelligence.getbamboo.com/api/reports';

  const c2d = (cents) => Math.round(cents) / 100;

  // Trade-sample filter: matches "trade sample" anywhere (case-insensitive)
  // OR a word-bounded "TS" token. Word boundary uses non-letter/digit chars
  // so "CARTS" / "Tasts" are NOT matched.
  const TS_RE = /(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)/i;
  const isTradeSample = (name) => TS_RE.test(name || '');

  // ----- PERMANENT BLOCK LIST -----
  // Specific SKU groups the user has chosen to exclude from the app entirely.
  // Names matched case-insensitively, exact. Add new entries here to extend.
  const PERMANENT_BLOCK = new Set([
    'dabstract live resin disposable pens - 1g',
    'panda pen disposables 1g',
  ]);
  const isBlocked = (name) => PERMANENT_BLOCK.has((name || '').toLowerCase().trim());
  const shouldDrop = (name) => isTradeSample(name) || isBlocked(name);

  function inferTopCategory(name) {
    const n = (name || '').toLowerCase();

    // ----- EXPLICIT MULTI-WORD OVERRIDES (must run BEFORE generic keywords) -----
    // Bong Buddies = packaged flower, not prerolls
    if (n.includes('bong buddies')) return 'Flower';
    // Hot Shotz = THC/CBD beverage shots
    if (n.includes('hot shot') || n.includes('hot shotz')) return 'Beverage';
    // Panda Pens / Panda Pen AIO / Panda Pens CBD 1:1 / Panda Pens - 3pk = 510 vape hardware
    if (n.includes('panda pen')) return 'Vapes';
    // Juice Box = vape cartridge product line
    if (n.includes('juice box')) return 'Vapes';
    // Cake Icing / Cake Batter = concentrates (despite the dessert names)
    if (n.includes('cake icing') || n.includes('cake batter') || n.includes('opal sugar')) return 'Concentrates';
    // Micro Bar = vape hardware line (AIO / 510 / Capsule Collection)
    if (n.includes('micro bar')) return 'Vapes';
    // Sungaze = THC/CBD beverage line (runs before the generic 'sugar' concentrate keyword)
    if (n.includes('sungaze')) return 'Beverage';
    // Mega Rolls = large infused joints
    if (n.includes('mega roll')) return 'Prerolls';
    // Macro Bar + Panda Battery = accessories / hardware
    if (n.includes('macro bar') || n.includes('panda battery')) return 'Accessories';
    // Pocket Panda = pocket vape accessory
    if (n.includes('pocket panda')) return 'Accessories';
    // Huxton = preroll brand (tins / multi packs)
    if (n.includes('huxton')) return 'Prerolls';

    // ----- GENERIC KEYWORD MATCHES -----
    if (n.includes('flower')) return 'Flower';
    if (n.includes('preroll') || n.includes('pre-roll') || n.includes('joint') ||
        n.includes('firecracker') || n.includes('sparkler')) return 'Prerolls';
    if (n.includes('vape') || n.includes('cart') || n.includes('disposable') ||
        n.includes('pod') || n.includes('aio')) return 'Vapes';
    if (n.includes('gummiez') || n.includes('gummies') || n.includes('gummy') ||
        n.includes('edible') || n.includes('chocolate') || n.includes('candies') ||
        n.includes('candy') || n.includes('caramel') || n.includes('drop')) return 'Edibles';
    if (n.includes('concentrate') || n.includes('dab') || n.includes('rosin') ||
        n.includes('wax') || n.includes('shatter') || n.includes('badder') ||
        n.includes('budder') || n.includes('crumble') || n.includes('sauce') ||
        n.includes('sugar') || n.includes('diamond') || n.includes('icing') ||
        n.includes('gems n') || n.includes('hash') || n.includes('banger')) return 'Concentrates';
    if (n.includes('topical') || n.includes('balm') || n.includes('cream')) return 'Topicals';
    if (n.includes('tincture')) return 'Tinctures';
    if (n.includes('beverage') || n.includes('drink') || n.includes('soda') || n.includes('seltzer')) return 'Beverage';
    if (n.includes('accessor') || n.includes('apparel') || n.includes('merch') || n.includes('sticker') || n.includes('shirt') || n.includes('clothing')) return 'Accessories';

    return 'Other';
  }

  async function fetchReport() {
    const r = await fetch(API_URL, { credentials: 'omit' });
    if (!r.ok) throw new Error('Bamboo API ' + r.status);
    return r.json();
  }

  function adapt(api) {
    const reps        = api.dimensions.reps.rows;
    const clientsD    = api.dimensions.clients.rows;
    const productsD   = api.dimensions.products.rows;
    const brandsD     = api.dimensions.brands.rows;
    const perfCats    = api.dimensions.performance_categories.rows;
    const retailCats  = api.dimensions.retail_categories ? api.dimensions.retail_categories.rows : [];

    // Keep flags per dimension (true = kept, false = trade sample → removed)
    const keepPerf   = perfCats.map(r => !shouldDrop(r[1]));
    const keepRetail = retailCats.map(r => !shouldDrop(r[1]));
    const keepProd   = productsD.map(p => !shouldDrop(p[1]) && (p[3] == null || keepRetail[p[3]] !== false));

    // ----- TS-ONLY CLIENT FILTER -----
    // A store whose entire category_client_sales footprint falls in
    // trade-sample (TS) performance categories has only ever received free
    // samples — it is not a real revenue account. Drop it from every report.
    // Self-updating: if such a store later logs a non-TS (real) purchase it
    // reappears automatically on the next API refresh.
    const _ccsRows    = api.facts.category_client_sales;
    const _cliHasAny  = new Set();   // client idx -> has any category sale
    const _cliHasKept = new Set();   // client idx -> has any non-TS category sale
    for (let i = 0; i < _ccsRows.row.length; i++) {
      _cliHasAny.add(_ccsRows.row[i]);
      if (keepPerf[_ccsRows.col[i]]) _cliHasKept.add(_ccsRows.row[i]);
    }
    const isTsOnlyClient = (ci) => _cliHasAny.has(ci) && !_cliHasKept.has(ci);

    // Re-index surviving perf categories (SKUs) + build name → new index lookup
    const skuRemap = new Map();
    const filteredPerfCats = [];
    const perfNameToNewIdx = new Map();
    perfCats.forEach((row, oldI) => {
      if (keepPerf[oldI]) {
        const newI = filteredPerfCats.length;
        skuRemap.set(oldI, newI);
        filteredPerfCats.push(row);
        // Last-wins for duplicate names — performance categories can have
        // duplicate display names; this still gives us a valid SKU group for
        // products bucketed under that retail-category name.
        perfNameToNewIdx.set(row[1], newI);
      }
    });

    const startDate = api.range.from;
    const endDate   = api.range.to;
    const periodDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    const months = +(periodDays / 30.4).toFixed(4);

    const meta = {
      period: startDate + ' to ' + endDate,
      startDate, endDate, periodDays, months,
      totalRevenue: 0,
      totalUnits: 0,
      totalClients: clientsD.length,
      totalSkus: filteredPerfCats.length,
      totalProducts: 0,
      totalMatrixRows: 0,
      generatedAt: api.generated_at,
      source: 'live',
    };

    // Client-rep sales aggregate (whole-order totals, not SKU-filtered)
    const crs = api.facts.client_rep_sales;
    const perClient = new Map();
    for (let i = 0; i < crs.row.length; i++) {
      const ci = crs.row[i];
      const acc = perClient.get(ci) || { o: 0, u: 0, rev: 0 };
      acc.o += crs.total_orders[i];
      acc.u += crs.units[i];
      acc.rev += crs.revenue_cents[i];
      perClient.set(ci, acc);
    }

    const ccs = api.facts.category_client_sales;
    const skusPerClient = new Map();
    for (let i = 0; i < ccs.row.length; i++) {
      if (!keepPerf[ccs.col[i]]) continue;
      const ci = ccs.row[i];
      let s = skusPerClient.get(ci);
      if (!s) { s = new Set(); skusPerClient.set(ci, s); }
      s.add(skuRemap.get(ccs.col[i]));
    }

    const today = new Date(api.generated_at);
    // Strip " - House" / " - house" suffix to fold house accounts into the main rep.
    const normRep = (rn) => (rn || '').replace(/\s*-\s*house\s*$/i, '').trim();

    // Build a contiguous re-index for surviving (non-TS-only) clients so the
    // matrix and every clients[] lookup stay consistent after the drop.
    const clientRemap = new Map();   // old client idx -> new client idx
    clientsD.forEach((row, oldI) => {
      if (!isTsOnlyClient(oldI)) clientRemap.set(oldI, clientRemap.size);
    });

    const clients = [];
    clientsD.forEach((row, oldI) => {
      if (isTsOnlyClient(oldI)) return;   // TS-only store — excluded from all reports
      const newI = clientRemap.get(oldI);
      const [id, name, fr, vr, pg, dl, vs, ls, lic, isRev] = row;
      const agg = perClient.get(oldI) || { o: 0, u: 0, rev: 0 };
      const lastOrder = ls ? new Date(ls.replace(' ', 'T')) : null;
      const start = vs ? new Date(vs) : null;
      clients.push({
        i: newI,
        n: name,
        sr: normRep(reps[fr] ? reps[fr][1] : ''),
        vr: normRep((vr != null && reps[vr]) ? reps[vr][1] : ''),
        pg: pg || '',
        dl: dl || '',
        lic: lic || '',
        ls: ls ? ls.slice(0, 10) : '',
        vs: vs || '',
        o: agg.o,
        u: agg.u,
        rev: c2d(agg.rev),
        sku: skusPerClient.get(oldI) ? skusPerClient.get(oldI).size : 0,
        aov: agg.o ? c2d(agg.rev) / agg.o : 0,
        tenureDays: start ? Math.max(0, Math.round((today - start) / 86400000)) : 0,
        daysSinceOrder: lastOrder ? Math.max(0, Math.round((today - lastOrder) / 86400000)) : 9999,
        _isRevenue: !!isRev,
      });
    });
    // totalClients reflects the post-filter store count used by every report.
    meta.totalClients = clients.length;

    // SKU revenue/units/stores aggregates (re-indexed)
    const skuAgg = new Map();
    for (let i = 0; i < ccs.col.length; i++) {
      if (!keepPerf[ccs.col[i]]) continue;
      const newK = skuRemap.get(ccs.col[i]);
      const a = skuAgg.get(newK) || { rev: 0, u: 0, stores: new Set() };
      a.rev += ccs.revenue_cents[i];
      a.u   += ccs.units[i];
      a.stores.add(ccs.row[i]);
      skuAgg.set(newK, a);
    }

    const skus = filteredPerfCats.map(([id, name], i) => {
      const a = skuAgg.get(i) || { rev: 0, u: 0, stores: new Set() };
      return {
        i,
        n: name,
        c: inferTopCategory(name),
        rev: c2d(a.rev),
        u: a.u,
        st: a.stores.size,
      };
    });

    // Products (filtered) — assign sg from retail-category name → perf-category new index
    const ps = api.facts.product_sales;
    const products = [];
    productsD.forEach((row, oldI) => {
      if (!keepProd[oldI]) return;
      const [id, name, bi, ci] = row;
      const retailName = retailCats[ci] ? retailCats[ci][1] : '';
      const sg = perfNameToNewIdx.has(retailName) ? perfNameToNewIdx.get(retailName) : 0;
      const rev = c2d(ps.revenue_cents[oldI] || 0);
      const u   = ps.units[oldI] || 0;
      products.push({
        i: products.length,
        n: name,
        b: brandsD[bi] ? brandsD[bi][1] : '',
        c: retailName || (perfCats[ci] ? perfCats[ci][1] : ''),
        rev, u,
        vel: months > 0 ? rev / months : 0,
        sg,
        rkC: 0, rkG: 0,
      });
    });

    const byCat = new Map();
    products.forEach(p => {
      const k = p.c || 'Other';
      const arr = byCat.get(k) || [];
      arr.push(p);
      byCat.set(k, arr);
    });
    byCat.forEach(arr => arr.sort((a, b) => b.rev - a.rev).forEach((p, idx) => p.rkC = idx + 1));
    [...products].sort((a, b) => b.rev - a.rev).forEach((p, idx) => p.rkG = idx + 1);
    meta.totalProducts = products.length;

    // Matrix (filtered + remapped)
    const matrix = [];
    let totalRev = 0, totalU = 0;
    for (let i = 0; i < ccs.row.length; i++) {
      if (!keepPerf[ccs.col[i]]) continue;
      const cNew = clientRemap.get(ccs.row[i]);
      if (cNew === undefined) continue;   // TS-only client — already excluded
      matrix.push({
        c: cNew,
        s: skuRemap.get(ccs.col[i]),
        r: c2d(ccs.revenue_cents[i]),
        u: ccs.units[i],
      });
      totalRev += ccs.revenue_cents[i];
      totalU   += ccs.units[i];
    }
    meta.totalRevenue    = c2d(totalRev);
    meta.totalUnits      = totalU;
    meta.totalMatrixRows = matrix.length;

    return { meta, skus, clients, products, matrix };
  }

  async function loadLiveDataset() {
    const api = await fetchReport();
    return adapt(api);
  }

  window.BambooApiAdapter = { fetchReport, adapt, loadLiveDataset, API_URL };
})();
