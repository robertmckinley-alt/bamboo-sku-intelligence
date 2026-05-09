/* eslint-disable */
const { fmt$, fmtN, fmtPct, fmtNum } = window.BambooCore;

// ============== Call Sheet Export ==============

function buildCallSheetData(a, clientIds) {
  const rows = [];
  for (const cid of clientIds) {
    const cl = a.clients[cid];
    if (!cl) continue;
    const carrying = (a.byClient.get(cid) || [])
      .filter(([s,r,u]) => r > 0)
      .map(([s,r,u]) => ({sku: a.skuById.get(s), r, u}))
      .filter(x => x.sku)
      .sort((x,y) => y.r - x.r);
    const topCarrying = carrying.slice(0, 5);
    const missing = (cl.missingDetails || []).slice(0, 8);
    rows.push({client: cl, topCarrying, missing});
  }
  return rows;
}

function exportCallSheetCSV(a, clientIds) {
  const data = buildCallSheetData(a, clientIds);
  const csv = [];
  csv.push(['Retailer','Sales Rep','VMI Rep','License','Pricing','Last Order','Tag','Opp Score','Revenue','Units','Orders','AOV','SKUs Carried','Missing Top 30','Est Missed Rev','TYPE','SKU','Top Products','Rank','Revenue $','Units','Suggested Units','Talking Point'].join(','));
  for (const row of data) {
    const cl = row.client;
    const base = [cl.n, cl.sr||'', cl.vr||'', cl.lic||'', cl.pg||'', cl.ls||'', cl.storeTag, cl.oppScore.toFixed(0), cl.rev, cl.u, cl.o, cl.aov, `${cl.skusCarried}/${cl.skusAll}`, cl.missingTopCount, cl.missedRev.toFixed(0)];
    if (row.topCarrying.length === 0 && row.missing.length === 0) {
      csv.push([...base, 'NO DATA','','','','','','','No active sales in period.'].map(csvEscape).join(','));
    }
    for (const c of row.topCarrying) {
      csv.push([...base, 'TOP_CARRYING', c.sku.n, '', c.sku.rank, c.r.toFixed(2), c.u, '', `Performing well — keep stocked.`].map(csvEscape).join(','));
    }
    for (const m of row.missing) {
      const sku = a.skuById.get(m.sid);
      const tops = (a.products || [])
        .filter(p => p.sg === m.sid)
        .sort((x, y) => y.rev - x.rev)
        .slice(0, 3)
        .map(p => p.b ? `${p.n} (${p.b})` : p.n)
        .join(' | ');
      csv.push([...base, 'MISSING_PITCH', m.name, tops, m.rank, m.est.toFixed(0), '', m.suggestedUnits, `Top ${m.rank} globally; not yet placed. Est $${Math.round(m.est)} headroom.`].map(csvEscape).join(','));
    }
  }
  const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8'});
  downloadBlob(blob, `call-sheet-${clientIds.length}stores-${a.meta.endDate}.csv`);
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportCallSheetPrintable(a, clientIds) {
  const data = buildCallSheetData(a, clientIds);
  const w = window.open('', '_blank');
  if (!w) { alert('Pop-up blocked. Allow pop-ups to print.'); return; }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Call Sheet — ${clientIds.length} stores</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, -apple-system, system-ui, sans-serif; color: #1c1917; margin: 0; padding: 0; font-size: 11pt; }
    .sheet { page-break-after: always; padding: 0; }
    .sheet:last-child { page-break-after: auto; }
    h1 { font-size: 18pt; margin: 0 0 4pt 0; }
    h2 { font-size: 11pt; margin: 12pt 0 4pt; text-transform: uppercase; letter-spacing: .05em; color: #57534e; border-bottom: 1px solid #d6d3d1; padding-bottom: 2pt; }
    .meta { font-size: 9pt; color: #57534e; margin-bottom: 8pt; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; margin-bottom: 8pt; }
    .stat { background: #f5f5f4; padding: 4pt 6pt; border-radius: 3pt; }
    .stat-label { font-size: 7pt; text-transform: uppercase; letter-spacing: .05em; color: #78716c; }
    .stat-val { font-family: ui-monospace, Menlo, monospace; font-size: 11pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; font-family: ui-monospace, Menlo, monospace; }
    th, td { text-align: left; padding: 3pt 5pt; border-bottom: 1px solid #e7e5e4; }
    th { font-size: 7pt; text-transform: uppercase; color: #78716c; letter-spacing: .04em; }
    .num { text-align: right; }
    .tag { display: inline-block; padding: 1pt 5pt; border-radius: 3pt; font-size: 8pt; font-weight: 600; }
    .tag-call { background: #047857; color: white; }
    .tag-cross { background: #f59e0b; color: black; }
    .tag-cat { background: #075985; color: white; }
    .tag-low { background: #d6d3d1; color: #1c1917; }
    .tag-risk { background: #b91c1c; color: white; }
    .talking { background: #fffbeb; padding: 6pt 8pt; border-left: 3pt solid #f59e0b; margin-top: 6pt; font-size: 9.5pt; }
    .footer { font-size: 8pt; color: #78716c; margin-top: 8pt; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <div class="no-print" style="position:fixed; top:0; left:0; right:0; padding:8pt; background:#fef3c7; border-bottom:1px solid #f59e0b; display:flex; justify-content:space-between; align-items:center;">
    <span style="font-size:10pt;">Bamboo Call Sheet · ${clientIds.length} store${clientIds.length>1?'s':''} · ${a.meta.endDate}</span>
    <button onclick="window.print()" style="padding:4pt 12pt; background:#1c1917; color:white; border:0; border-radius:3pt; cursor:pointer; font-size:10pt;">🖨 Print / Save PDF</button>
  </div>
  <div style="height:30pt;" class="no-print"></div>
  ${data.map(row => sheetHtml(row, a)).join('')}
  </body></html>`;
  w.document.write(html);
  w.document.close();
}

function sheetHtml(row, a) {
  const cl = row.client;
  const tagClass = {
    'HIGH VALUE — CALL NOW': 'tag-call',
    'CROSS-SELL': 'tag-cross',
    'CATEGORY EXPANSION': 'tag-cat',
    'LOW PRIORITY': 'tag-low',
    'AT RISK': 'tag-risk',
  }[cl.storeTag] || 'tag-low';
  const tps = buildTalkingPoints(cl, row, a);
  return `<div class="sheet">
    <h1>${escHtml(cl.n)}</h1>
    <div class="meta">
      <span class="tag ${tagClass}">${cl.storeTag}</span>
      &nbsp;Sales Rep: <b>${escHtml(cl.sr||'—')}</b>
      &nbsp;·&nbsp;VMI: ${escHtml(cl.vr||'—')}
      &nbsp;·&nbsp;License ${escHtml(cl.lic||'—')}
      &nbsp;·&nbsp;Pricing: ${escHtml(cl.pg||'—')}
      &nbsp;·&nbsp;Last order: ${escHtml(cl.ls||'—')}
    </div>
    <div class="grid">
      <div class="stat"><div class="stat-label">Revenue (YTD)</div><div class="stat-val">${fmt$(cl.rev)}</div></div>
      <div class="stat"><div class="stat-label">Units</div><div class="stat-val">${fmtN(cl.u)}</div></div>
      <div class="stat"><div class="stat-label">Orders / AOV</div><div class="stat-val">${cl.o} · ${fmt$(cl.aov)}</div></div>
      <div class="stat"><div class="stat-label">Opportunity Score</div><div class="stat-val">${cl.oppScore.toFixed(0)} / 100</div></div>
      <div class="stat"><div class="stat-label">SKU Penetration</div><div class="stat-val">${cl.skusCarried}/${cl.skusAll} · ${fmtPct(cl.skuPenetration,0)}</div></div>
      <div class="stat"><div class="stat-label">Order Frequency</div><div class="stat-val">${cl.orderFreq.toFixed(1)}/mo</div></div>
      <div class="stat"><div class="stat-label">Missing Top 30</div><div class="stat-val" style="color:#b91c1c;">${cl.missingTopCount}</div></div>
      <div class="stat"><div class="stat-label">Estimated Missed $</div><div class="stat-val" style="color:#047857;">${fmt$(cl.missedRev)}</div></div>
    </div>

    <h2>Top SKUs to Pitch</h2>
    <table>
      <thead><tr><th>#</th><th>SKU Group</th><th>Top Individual Products</th><th>Category</th><th class="num">Global Rank</th><th class="num">Est. Revenue</th><th class="num">Suggested Qty</th></tr></thead>
      <tbody>
        ${row.missing.map((m, i) => {
          const sku = a.skuById.get(m.sid);
          const topProducts = (a.products || [])
            .filter(p => p.sg === m.sid)
            .sort((x, y) => y.rev - x.rev)
            .slice(0, 3)
            .map(p => p.b ? `${p.n} <span style="color:#a8a29e">(${escHtml(p.b)})</span>` : escHtml(p.n))
            .join('<br/>');
          return `<tr><td>${i+1}</td><td>${escHtml(m.name)}</td><td style="font-size:8.5pt; color:#44403c;">${topProducts || '<span style="color:#a8a29e">—</span>'}</td><td>${escHtml(sku?.c||'')}</td><td class="num">#${m.rank}</td><td class="num">${fmt$(m.est)}</td><td class="num">${m.suggestedUnits}</td></tr>`;
        }).join('') || `<tr><td colspan="7" style="color:#78716c;">No high-rank gaps — store is well-distributed.</td></tr>`}
      </tbody>
    </table>

    <h2>Currently Carrying — Top 5</h2>
    <table>
      <thead><tr><th>SKU</th><th class="num">Revenue</th><th class="num">Units</th></tr></thead>
      <tbody>
        ${row.topCarrying.map(c => `<tr><td>#${c.sku.rank} ${escHtml(c.sku.n)}</td><td class="num">${fmt$(c.r)}</td><td class="num">${fmtN(c.u)}</td></tr>`).join('') || `<tr><td colspan="3" style="color:#78716c;">No active SKUs in period.</td></tr>`}
      </tbody>
    </table>

    <div class="talking">
      <div style="font-size:8pt; text-transform:uppercase; letter-spacing:.05em; color:#78716c; margin-bottom:3pt;">Talking Points</div>
      <ul style="margin:0; padding-left:14pt;">${tps.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>
    </div>
    <div class="footer">Generated ${a.meta.endDate} · Period ${a.meta.startDate} → ${a.meta.endDate} · Bamboo SKU Intelligence</div>
  </div>`;
}

function buildTalkingPoints(cl, row, a) {
  const tps = [];
  const days = window.BambooCore.parseLastOrder(cl.ls, a.meta.endDate);
  if (cl.storeTag === 'HIGH VALUE — CALL NOW') tps.push(`Top-tier account — score ${cl.oppScore.toFixed(0)}, missed revenue at ${fmt$(cl.missedRev)} this period.`);
  if (cl.storeTag === 'AT RISK') tps.push(`Last order was ${days} days ago — re-engage proactively.`);
  if (row.missing[0]) {
    const m = row.missing[0];
    tps.push(`Lead with ${m.name} (global rank #${m.rank}) — suggested order ${m.suggestedUnits} units, ~${fmt$(m.est)} captured.`);
  }
  if (cl.categoryGaps.length > 0) {
    tps.push(`Category gaps: ${cl.categoryGaps.slice(0,3).join(', ')}${cl.categoryGaps.length>3?` + ${cl.categoryGaps.length-3} more`:''} — bundle one starter SKU per category.`);
  }
  if (cl.skuPenetration < 0.15) tps.push(`SKU penetration only ${fmtPct(cl.skuPenetration,0)} — significant headroom in catalog breadth.`);
  if (cl.aov < a.meta.totalRevenue / a.clients.reduce((a,c)=>a+c.o,0) * 0.6) {
    tps.push(`AOV (${fmt$(cl.aov)}) is below network average — pitch larger pack sizes / bundles to lift basket.`);
  }
  if (row.topCarrying[0]) tps.push(`Best mover: ${row.topCarrying[0].sku.n} at ${fmt$(row.topCarrying[0].r)} — confirm reorder cadence.`);
  if (tps.length === 0) tps.push('Steady account — confirm fill rates and surface any new releases.');
  return tps;
}

function escHtml(s) {
  return String(s||'').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

window.BambooExport = { exportCallSheetCSV, exportCallSheetPrintable };
