/* eslint-disable */
const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- formatters ----------
const fmt$ = (v) => v == null || isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString('en-US');
const fmt$d = (v) => v == null || isNaN(v) ? '—' : '$' + (Math.round(v*100)/100).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtN = (v) => v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('en-US');
const fmtPct = (v, d=1) => v == null || isNaN(v) ? '—' : (v*100).toFixed(d) + '%';
const fmtNum = (v, d=1) => v == null || isNaN(v) ? '—' : v.toFixed(d);

// ---------- URL state ----------
function useUrlState(key, defaultValue) {
  const [val, setVal] = useState(() => {
    try {
      const sp = new URLSearchParams(location.hash.slice(1));
      const raw = sp.get(key);
      if (raw != null) return JSON.parse(decodeURIComponent(raw));
      const ls = localStorage.getItem('bamboo_'+key);
      if (ls != null) return JSON.parse(ls);
    } catch(e) {}
    return defaultValue;
  });
  useEffect(() => {
    try {
      const sp = new URLSearchParams(location.hash.slice(1));
      sp.set(key, encodeURIComponent(JSON.stringify(val)));
      history.replaceState(null, '', '#' + sp.toString());
      localStorage.setItem('bamboo_'+key, JSON.stringify(val));
    } catch(e) {}
  }, [key, val]);
  return [val, setVal];
}

// ---------- core compute ----------
const DEFAULT_SKU_WEIGHTS = { revenue: 0.25, units: 0.15, velocity: 0.20, distribution: 0.15, reorder: 0.10, opportunity: 0.15 };
const DEFAULT_STORE_WEIGHTS = { missingTop: 0.35, categoryGap: 0.20, spendPotential: 0.30, frequency: 0.15 };

function normalize(arr, getter) {
  const vals = arr.map(getter);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  return arr.map((x, i) => (vals[i] - min) / range);
}

function buildAnalytics(data, skuWeights, storeWeights) {
  const { clients, skus, matrix, meta, products, penetrationGoals } = data;
  const months = meta.months;
  const totalStores = clients.length;

  // Global penetration goals — {sku_group_id (string) -> goal (0..1)}.
  // Loaded once in main.jsx from data/penetration_goals.json; we read it
  // here so distGoal lives on every SKU object alongside distPct. Anywhere
  // the app already shows distPct can now show distGoal for free.
  const goalLookup = penetrationGoals || {};
  const getGoal = (id) => {
    const v = goalLookup[String(id)];
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  };

  // Index matrix by sku and by client
  const byClient = new Map();
  const bySku = new Map();
  for (const m of matrix) {
    const c = m.c, s = m.s, r = m.r, u = m.u;
    if (!byClient.has(c)) byClient.set(c, []);
    byClient.get(c).push([s, r, u]);
    if (!bySku.has(s)) bySku.set(s, []);
    bySku.get(s).push([c, r, u]);
  }

  // SKU enrichment
  const skuEnriched = skus.map(s => {
    const rows = bySku.get(s.i) || [];
    const buyersWithRev = rows.filter(([c,r,u]) => r > 0);
    const stores = buyersWithRev.length;
    const orderRows = rows.filter(([c,r,u]) => r > 0).reduce((acc, [c,r,u]) => {
      const cl = clients[c];
      acc.totalOrders += cl.o || 0;
      return acc;
    }, {totalOrders: 0});
    const unitsPerStore = stores ? s.u / stores : 0;
    const revPerStore = stores ? s.rev / stores : 0;
    const distPct = stores / totalStores;
    const distGap = totalStores - stores;
    const velocity = stores ? (s.u / stores / months) : 0; // units per store per month
    // Reorder rate proxy: avg orders-per-buying-store. We don't have per-SKU order count; use buyer-store avg orders.
    const avgOrders = stores ? (buyersWithRev.reduce((a,[c]) => a + (clients[c].o||0), 0) / stores) : 0;
    const reorderProxy = stores ? Math.min(1, avgOrders / 12) : 0; // 12 = "weekly orders ≈ saturated"
    // Estimated opportunity: if we placed it in distGap stores at the avg revPerStore, what's the headroom?
    const oppEst = distGap * revPerStore * 0.5; // 50% capture assumption
    // Penetration goal (global, from the goal sheet). distGoalStores is the
    // absolute target count of stores; distGapToGoal is how many *more*
    // stores must be added to hit the goal (clamped at 0 — over-goal is shown
    // as a 0 gap, not a negative).
    const distGoal = getGoal(s.i);
    const distGoalStores = distGoal != null ? Math.ceil(distGoal * totalStores) : null;
    const distGapToGoal = distGoal != null ? Math.max(0, distGoalStores - stores) : null;
    const distVsGoal = distGoal != null ? (distPct - distGoal) : null;
    return {
      ...s,
      stores,
      unitsPerStore,
      revPerStore,
      distPct,
      distGap,
      distGoal,
      distGoalStores,
      distGapToGoal,
      distVsGoal,
      velocity,
      avgOrdersPerBuyer: avgOrders,
      reorderProxy,
      oppEst,
      buyerIdxs: buyersWithRev.map(r => r[0]),
    };
  });

  // Filter SKUs that are active: any revenue or units (includes promo/sample-only SKUs)
  const tradeable = skuEnriched.filter(s => s.rev > 0 || s.u > 0);

  // Normalize
  const nRev = normalize(tradeable, s => s.rev);
  const nUnits = normalize(tradeable, s => s.u);
  const nVel = normalize(tradeable, s => s.velocity);
  const nDist = tradeable.map(s => s.distPct);
  const nReord = tradeable.map(s => s.reorderProxy);
  const nOpp = normalize(tradeable, s => s.oppEst);

  const w = skuWeights;
  tradeable.forEach((s, i) => {
    const raw = w.revenue*nRev[i] + w.units*nUnits[i] + w.velocity*nVel[i] +
                w.distribution*nDist[i] + w.reorder*nReord[i] + w.opportunity*nOpp[i];
    s.scoreRaw = raw;
  });
  // Scale 0-100 (max-norm so top scorer = 100). Guard against NaN from zero-rev SKUs.
  tradeable.forEach(s => { if (!isFinite(s.scoreRaw)) s.scoreRaw = 0; });
  const maxRaw = Math.max(...tradeable.map(s => s.scoreRaw)) || 1;
  tradeable.forEach(s => { s.score = (s.scoreRaw / maxRaw) * 100; });

  // Sort and assign rank/percentile
  const byScore = [...tradeable].sort((a,b) => b.score - a.score);
  byScore.forEach((s, i) => {
    s.rank = i + 1;
    s.percentile = (1 - i / (byScore.length - 1 || 1));
  });

  // Tags
  for (const s of tradeable) {
    const highScore = s.score >= 60;
    const highVel = s.velocity >= byScore[Math.floor(byScore.length*0.25)]?.velocity;
    const highReord = s.reorderProxy >= 0.4;
    const highDist = s.distPct >= 0.6;
    const lowDist = s.distPct < 0.4;
    const highOpp = s.oppEst >= byScore[Math.floor(byScore.length*0.25)]?.oppEst;
    const lowScore = s.score < 25;
    const weakVel = s.velocity < byScore[Math.floor(byScore.length*0.75)]?.velocity;
    if (highScore && highVel && highReord) s.tag = 'SCALE';
    else if (lowDist && highOpp && s.rev > 0 && s.score >= 30) s.tag = 'PUSH';
    else if (lowScore) s.tag = 'CUT';
    else if (weakVel || s.reorderProxy < 0.15) s.tag = 'FIX';
    else s.tag = 'MONITOR';
  }

  // Trend proxy (we don't have weekly granularity from this data; use velocity vs distribution as a heuristic for "growing"). 
  // Set to neutral for honesty; flag SCALE up, CUT down.
  for (const s of tradeable) {
    s.trend = s.tag === 'SCALE' ? 'up' : s.tag === 'CUT' || s.tag === 'FIX' ? 'down' : 'flat';
  }

  // Map by id
  const skuById = new Map(tradeable.map(s => [s.i, s]));

  // ----- Client-level metrics -----
  const allCats = [...new Set(tradeable.map(s => s.c))];
  const clientsEnriched = clients.map(cl => {
    const rows = byClient.get(cl.i) || [];
    const skusCarried = rows.filter(([s,r,u]) => r > 0).length;
    const skusAll = tradeable.length;
    const skuPenetration = skusAll ? skusCarried / skusAll : 0;
    const cats = new Set();
    const catRev = {};
    for (const [s,r,u] of rows) {
      const sku = skuById.get(s);
      if (sku && r > 0) {
        cats.add(sku.c);
        catRev[sku.c] = (catRev[sku.c] || 0) + r;
      }
    }
    const avgOrderUnits = cl.o ? cl.u / cl.o : 0;
    const orderFreq = cl.o / months;
    return {
      ...cl,
      skusCarried, skusAll, skuPenetration,
      catCount: cats.size,
      catRev,
      avgOrderUnits,
      orderFreq,
      catsCarried: [...cats]
    };
  });

  // ----- Store opportunity calc -----
  // For each client, missing top SKUs (by global rank) — top 30 SKUs they don't carry
  const TOP_N = 30;
  const top30 = byScore.slice(0, TOP_N).map(s => s.i);
  const carriedSet = new Map(); // clientIdx -> Set of sku ids
  for (const cl of clientsEnriched) {
    carriedSet.set(cl.i, new Set((byClient.get(cl.i) || []).filter(([s,r,u]) => r > 0).map(([s]) => s)));
  }

  const benchmark = {
    revPerMonth: meta.totalRevenue / totalStores / months,
    ordersPerMonth: clientsEnriched.reduce((a,c) => a + c.o, 0) / totalStores / months,
  };

  for (const cl of clientsEnriched) {
    const carried = carriedSet.get(cl.i);
    // Missing top SKUs
    const missing = top30.filter(s => !carried.has(s));
    cl.missingTopCount = missing.length;
    cl.missingTopIds = missing;
    // Estimated missed revenue
    let missedRev = 0;
    const missingDetails = [];
    for (const sid of missing) {
      const sku = skuById.get(sid);
      if (!sku) continue;
      // Estimate per-store revenue this client would generate = global revPerStore * client size factor
      const sizeFactor = cl.rev / Math.max(1, meta.totalRevenue / totalStores);
      const est = sku.revPerStore * Math.min(2, Math.max(0.2, sizeFactor));
      missedRev += est;
      missingDetails.push({sid, name: sku.n, rank: sku.rank, est, suggestedUnits: Math.round(sku.unitsPerStore * Math.min(2, Math.max(0.2, sizeFactor)))});
    }
    cl.missedRev = missedRev;
    cl.missingDetails = missingDetails;
    // Category gaps
    const gaps = allCats.filter(c => !cl.catsCarried.includes(c));
    cl.categoryGaps = gaps;
    // Suggested order bundle: top 5 of missing
    cl.suggestedBundle = missingDetails.slice(0, 5);
  }

  // Normalize for store score
  const nMissing = normalize(clientsEnriched, c => c.missingTopCount);
  const nGap = normalize(clientsEnriched, c => c.categoryGaps.length);
  const nSpend = normalize(clientsEnriched, c => c.missedRev); // proxy for spend potential vs current
  const nFreq = normalize(clientsEnriched, c => Math.max(0, benchmark.ordersPerMonth*months - c.o)); // gap below benchmark

  const sw = storeWeights;
  clientsEnriched.forEach((c, i) => {
    const raw = sw.missingTop*nMissing[i] + sw.categoryGap*nGap[i] +
                sw.spendPotential*nSpend[i] + sw.frequency*nFreq[i];
    c.oppRaw = raw;
  });
  const maxStoreRaw = Math.max(...clientsEnriched.map(c => c.oppRaw)) || 1;
  clientsEnriched.forEach(c => { c.oppScore = (c.oppRaw / maxStoreRaw) * 100; });

  // Store tags
  const sortedByOpp = [...clientsEnriched].sort((a,b) => b.oppScore - a.oppScore);
  for (const cl of clientsEnriched) {
    const highOpp = cl.oppScore >= 70;
    const highRev = cl.rev >= meta.totalRevenue / totalStores * 1.5;
    const lowRev = cl.rev < meta.totalRevenue / totalStores * 0.3;
    const lowFreq = cl.orderFreq < benchmark.ordersPerMonth * 0.5;
    const declining = cl.ls && parseLastOrder(cl.ls, meta.endDate) > 30;
    if (declining) cl.storeTag = 'AT RISK';
    else if (highOpp && highRev) cl.storeTag = 'CALL NOW';
    else if (cl.missingTopCount >= 15 && cl.rev > 0) cl.storeTag = 'CROSS-SELL';
    else if (cl.categoryGaps.length >= 3) cl.storeTag = 'HIGH UPSIDE';
    else if (lowRev || lowFreq) cl.storeTag = 'LOW PRIORITY';
    else cl.storeTag = 'CROSS-SELL';
  }

  return {
    skus: tradeable,
    skuById,
    skusByScore: byScore,
    clients: clientsEnriched,
    byClient, bySku,
    cats: allCats,
    benchmark,
    meta,
    top30,
    matrixRaw: matrix,
    products: products || [],
  };
}

function parseLastOrder(dateStr, endDate) {
  if (!dateStr) return 999;
  let d;
  // ISO format YYYY-MM-DD
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) { d = new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3])); }
  else {
    const m = dateStr.match(/(\d+)\/(\d+)\/(\d+)/);
    if (!m) return 999;
    d = new Date(parseInt(m[3]), parseInt(m[1])-1, parseInt(m[2]));
  }
  const e = new Date(endDate);
  return Math.floor((e - d) / (1000*60*60*24));
}

window.BambooCore = { buildAnalytics, DEFAULT_SKU_WEIGHTS, DEFAULT_STORE_WEIGHTS, useUrlState, fmt$, fmt$d, fmtN, fmtPct, fmtNum, parseLastOrder };
