// apiAdapter.jsx — transforms the Bamboo Intelligence API into the dataset
// shape that BambooCore.buildAnalytics expects. Drop-in replacement for
// the static data/dataset.json fetch.
//
// Exposes window.BambooApiAdapter = { fetchReport, adapt, loadLiveDataset, API_URL }

(function () {
  const API_URL = 'https://api-intelligence.getbamboo.com/api/reports';
  const c2d = (cents) => Math.round(cents) / 100;

  function inferTopCategory(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('flower')) return 'Flower';
    if (n.includes('preroll') || n.includes('pre-roll')) return 'Prerolls';
    if (n.includes('vape') || n.includes('cart') || n.includes('disposable') || n.includes('pod')) return 'Vapor';
    if (n.includes('edible') || n.includes('gummy') || n.includes('chocolate') || n.includes('beverage')) return 'Edibles';
    if (n.includes('concentrate') || n.includes('dab') || n.includes('rosin') || n.includes('wax')
        || n.includes('shatter') || n.includes('badder') || n.includes('sugar') || n.includes('diamond')) return 'Concentrates';
    if (n.includes('topical')) return 'Topicals';
    if (n.includes('tincture')) return 'Tinctures';
    if (n.includes('accessor') || n.includes('apparel') || n.includes('merch')) return 'Accessories';
    return 'Other';
  }

  async function fetchReport() {
    const r = await fetch(API_URL, { credentials: 'omit' });
    if (!r.ok) throw new Error('Bamboo API ' + r.status);
    return r.json();
  }

  function adapt(api) {
    const reps      = api.dimensions.reps.rows;
    const clientsD  = api.dimensions.clients.rows;
    const productsD = api.dimensions.products.rows;
    const brandsD   = api.dimensions.brands.rows;
    const perfCats  = api.dimensions.performance_categories.rows;

    const startDate = api.range.from;
    const endDate   = api.range.to;
    const periodDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    const months = +(periodDays / 30.4).toFixed(4);
    const meta = {
      period: startDate + ' to ' + endDate,
      startDate, endDate, periodDays, months,
      totalRevenue:    c2d(api.summaries.totals.revenue_cents),
      totalUnits:      api.summaries.totals.units,
      totalClients:    clientsD.length,
      totalSkus:       perfCats.length,
      totalProducts:   productsD.length,
      totalMatrixRows: 0,
      generatedAt:     api.generated_at,
      source:          'live',
    };

    const crs = api.facts.client_rep_sales;
    const perClient = new Map();
    for (let i = 0; i < crs.row.length; i++) {
      const ci = crs.row[i];
      const acc = perClient.get(ci) || { o: 0, u: 0, rev: 0 };
      acc.o   += crs.total_orders[i];
      acc.u   += crs.units[i];
      acc.rev += crs.revenue_cents[i];
      perClient.set(ci, acc);
    }

    const ccs = api.facts.category_client_sales;
    const skusPerClient = new Map();
    for (let i = 0; i < ccs.row.length; i++) {
      const ci = ccs.row[i];
      let s = skusPerClient.get(ci);
      if (!s) { s = new Set(); skusPerClient.set(ci, s); }
      s.add(ccs.col[i]);
    }

    const today = new Date(api.generated_at);
    const clients = clientsD.map((row, i) => {
      const [id, name, fr, vr, pg, dl, vs, ls, lic, isRev] = row;
      const agg = perClient.get(i) || { o: 0, u: 0, rev: 0 };
      const lastOrder = ls ? new Date(ls.replace(' ', 'T')) : null;
      const start = vs ? new Date(vs) : null;
      return {
        i, n: name,
        sr: reps[fr] ? reps[fr][1] : '',
        vr: (vr != null && reps[vr]) ? reps[vr][1] : '',
        pg:  pg  || '',
        dl:  dl  || '',
        lic: lic || '',
        ls:  ls  ? ls.slice(0, 10) : '',
        vs:  vs  || '',
        o:   agg.o,
        u:   agg.u,
        rev: c2d(agg.rev),
        sku: skusPerClient.get(i) ? skusPerClient.get(i).size : 0,
        aov: agg.o ? c2d(agg.rev) / agg.o : 0,
        tenureDays:     start     ? Math.max(0, Math.round((today - start)     / 86400000)) : 0,
        daysSinceOrder: lastOrder ? Math.max(0, Math.round((today - lastOrder) / 86400000)) : 9999,
        _isRevenue: !!isRev,
      };
    });

    const skuAgg = new Map();
    for (let i = 0; i < ccs.col.length; i++) {
      const k = ccs.col[i];
      const a = skuAgg.get(k) || { rev: 0, u: 0, stores: new Set() };
      a.rev += ccs.revenue_cents[i];
      a.u   += ccs.units[i];
      a.stores.add(ccs.row[i]);
      skuAgg.set(k, a);
    }
    const skus = perfCats.map(([id, name], i) => {
      const a = skuAgg.get(i) || { rev: 0, u: 0, stores: new Set() };
      return {
        i, n: name,
        c: inferTopCategory(name),
        rev: c2d(a.rev),
        u: a.u,
        st: a.stores.size,
      };
    });

    const ps = api.facts.product_sales;
    const products = productsD.map(([id, name, bi, ci], i) => {
      const rev = c2d(ps.revenue_cents[i] || 0);
      const u   = ps.units[i] || 0;
      return {
        i, n: name,
        b: brandsD[bi] ? brandsD[bi][1] : '',
        c: perfCats[ci] ? perfCats[ci][1] : '',
        rev, u,
        vel: months > 0 ? rev / months : 0,
        sg: 0, rkC: 0, rkG: 0,
      };
    });
    const byCat = new Map();
    products.forEach(p => {
      const k = p.c || 'Other';
      const arr = byCat.get(k) || []; arr.push(p); byCat.set(k, arr);
    });
    byCat.forEach(arr => arr.sort((a, b) => b.rev - a.rev).forEach((p, idx) => p.rkC = idx + 1));
    [...products].sort((a, b) => b.rev - a.rev).forEach((p, idx) => p.rkG = idx + 1);

    const matrix = new Array(ccs.row.length);
    for (let i = 0; i < ccs.row.length; i++) {
      matrix[i] = {
        c: ccs.row[i],
        r: ccs.col[i],
        s: c2d(ccs.revenue_cents[i]),
        u: ccs.units[i],
      };
    }
    meta.totalMatrixRows = matrix.length;

    return { meta, skus, clients, products, matrix };
  }

  async function loadLiveDataset() {
    const api = await fetchReport();
    return adapt(api);
  }

  window.BambooApiAdapter = { fetchReport, adapt, loadLiveDataset, API_URL };
})();
