#!/usr/bin/env python3
"""
backfill_product_closures.py — one-shot backfill of product-level closures from
5/13 → today, derived from the live API's facts.client_product_sales.

For each (client, product) cell with rev > 0 and last_ordered_at_utc >= 5/13,
we attribute the purchase to that date. A row is emitted as a *product*
closure only when the parent group already has NO group closure on/after 5/13
in our closures history — i.e. the store carried that group before 5/13, so a
new product inside it is an expansion event we want to count.

Brand-new groups (already counted as 'group' type) are NOT also emitted at the
product level. Caps each store's daily product-closure haul at MAX_PER_DAY to
keep a single chaotic restock day from blowing up the chart.

Reads:  data/api-snapshot.json, data/closures.json
Writes: data/closures.json (existing rows preserved, new product rows appended)
"""
import json, pathlib, sys, datetime, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAP = ROOT / 'data' / 'api-snapshot.json'
CLZ  = ROOT / 'data' / 'closures.json'

CUTOFF      = datetime.date(2026, 5, 13)
MAX_PER_DAY = 25   # per (store, day) sanity cap

# Reuse the same filters as refresh_closures.py
TS_RE = re.compile(r'(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)', re.I)
def is_ts(n): return bool(TS_RE.search(n or ''))
PERMANENT_BLOCK = {'dabstract live resin disposable pens - 1g','panda pen disposables 1g'}
def is_blocked(n): return (n or '').lower().strip() in PERMANENT_BLOCK
def should_drop(n): return is_ts(n) or is_blocked(n)
_TEST_RE = re.compile(r'\btest\b', re.I)
def is_test_client(n): return bool(_TEST_RE.search(n or ''))
_NORM_SUFFIX_RE = re.compile(r'\s*-\s*(VMI|1WT|NBA)\s*$', re.I)
def norm_client(n):
    s = n or ''
    for _ in range(3): s = _NORM_SUFFIX_RE.sub('', s)
    return s.strip()
_HOUSE_RE = re.compile(r'\s*-\s*house\s*$', re.I)
def norm_rep(n): return _HOUSE_RE.sub('', n or '').strip()

def infer_cat(name):
    n = (name or '').lower()
    if 'bong buddies' in n: return 'Flower'
    if 'hot shot' in n or 'hot shotz' in n: return 'Beverage'
    if 'panda pen' in n: return 'Vapes'
    if 'juice box' in n: return 'Vapes'
    if 'cake icing' in n or 'cake batter' in n or 'opal sugar' in n: return 'Concentrates'
    if 'micro bar' in n: return 'Vapes'
    if 'sungaze' in n: return 'Beverage'
    if 'mega roll' in n: return 'Prerolls'
    if 'macro bar' in n or 'panda battery' in n: return 'Accessories'
    if 'pocket panda' in n: return 'Accessories'
    if 'huxton' in n: return 'Prerolls'
    if 'banger' in n: return 'Prerolls'
    if 'flower' in n: return 'Flower'
    if any(k in n for k in ('preroll','pre-roll','joint','firecracker','sparkler')): return 'Prerolls'
    if any(k in n for k in ('vape','cart','disposable','pod','aio')): return 'Vapes'
    if any(k in n for k in ('gummiez','gummies','gummy','edible','chocolate','candies','candy','caramel','drop')): return 'Edibles'
    if any(k in n for k in ('concentrate','dab','rosin','wax','shatter','badder','budder','crumble','sauce','sugar','diamond','icing','gems n','hash')): return 'Concentrates'
    if any(k in n for k in ('topical','balm','cream')): return 'Topicals'
    if 'tincture' in n: return 'Tinctures'
    if any(k in n for k in ('beverage','drink','soda','seltzer')): return 'Beverage'
    if any(k in n for k in ('accessor','apparel','merch','sticker','shirt','clothing')): return 'Accessories'
    return 'Other'

def parse_iso(s):
    try:
        return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).date()
    except Exception:
        return None

def main():
    api = json.loads(SNAP.read_text())
    cps = api['facts'].get('client_product_sales')
    if not cps:
        print('FATAL: api-snapshot lacks client_product_sales'); return 1

    clients     = api['dimensions']['clients']['rows']
    products    = api['dimensions']['products']['rows']
    retail_cats = api['dimensions']['retail_categories']['rows']
    reps        = api['dimensions']['reps']['rows']

    def rep_name(idx):
        if idx is None or idx < 0 or idx >= len(reps): return ''
        return reps[idx][1] or ''
    client_meta = {}
    for row in clients:
        client_meta[row[1]] = {
            'sr': norm_rep(rep_name(row[2])) or 'Unassigned',
            'vr': norm_rep(rep_name(row[3])) or 'Unassigned',
        }

    # Existing closures — map (norm_client, group_name) -> bool present-as-group
    raw = json.loads(CLZ.read_text())
    cols = raw['cols']; rows = raw['rows']
    ci = {k:i for i,k in enumerate(cols)}
    has_group_closure = set()         # (norm_client, group_name) already counted as group win
    existing_dedup = set()            # (ts, client, type, sku) already in file
    for r in rows:
        client = r[ci['clientName']]
        sku    = r[ci['skuName']]
        typ    = r[ci.get('type', -1)] if 'type' in ci and ci['type'] < len(r) else None
        grp    = r[ci.get('skuGroup', -1)] if 'skuGroup' in ci and ci['skuGroup'] < len(r) else None
        if not typ: typ = 'group'
        if not grp: grp = sku
        has_group_closure.add((norm_client(client), grp))
        existing_dedup.add((r[ci['ts']], client, typ, sku))

    # Walk client_product_sales, propose product closures
    proposals = []
    seen = set()
    cps_rev   = cps['revenue_cents']
    cps_units = cps['units']
    cps_ts    = cps.get('last_ordered_at_utc') or []
    for i in range(len(cps['row'])):
        client_name = clients[cps['row'][i]][1]
        if is_test_client(client_name): continue
        col = cps['col'][i]
        if col is None or col < 0 or col >= len(products): continue
        prod = products[col]
        prod_name = prod[1]
        if should_drop(prod_name): continue
        grp_idx = prod[3] if len(prod) > 3 else None
        group_name = ''
        if grp_idx is not None and 0 <= grp_idx < len(retail_cats):
            group_name = retail_cats[grp_idx][1] or ''
        if not group_name or should_drop(group_name): continue

        rev = cps_rev[i]
        if rev <= 0: continue
        ts = cps_ts[i] if i < len(cps_ts) else None
        d = parse_iso(ts) if ts else None
        if d is None or d < CUTOFF: continue   # no record / before window
        # Skip if the parent group itself is a new (post 5/13) group for this client
        # — that group closure already counts the win; products inside aren't expansions.
        if (norm_client(client_name), group_name) in has_group_closure: continue

        # Aggregate to one entry per (client, product) — fact is already unique on col but be safe
        key = (norm_client(client_name), col)
        if key in seen: continue
        seen.add(key)

        cli = client_meta.get(client_name, {})
        proposals.append({
            'ts': d.isoformat(),
            'clientName': client_name,
            'skuName': prod_name,
            'category': infer_cat(group_name),
            'rev': round(rev/100, 2),
            'units': int(cps_units[i]) if i < len(cps_units) else 0,
            'sr': cli.get('sr','Unassigned'),
            'vr': cli.get('vr','Unassigned'),
            'type': 'product',
            'skuGroup': group_name,
        })

    # Per-store-per-day cap: keep top-N by revenue (avoid single restock day blowouts)
    bucket = {}
    for p in proposals:
        bucket.setdefault((p['clientName'], p['ts']), []).append(p)
    capped = []
    dropped = 0
    for (cl, dt), items in bucket.items():
        items.sort(key=lambda x: x['rev'], reverse=True)
        keep = items[:MAX_PER_DAY]
        dropped += len(items) - len(keep)
        capped.extend(keep)

    # Dedup against existing rows (so re-runs are safe)
    fresh = [p for p in capped
             if (p['ts'], p['clientName'], p['type'], p['skuName']) not in existing_dedup]

    # Append + write
    new_rows = list(rows)
    COLS = ['ts','clientName','skuName','category','rev','units','sr','vr','type','skuGroup']
    if cols != COLS:
        # Migrate existing rows to new column order (loader already backfills type/skuGroup)
        migrated = []
        for r in rows:
            obj = {k: (r[i] if i < len(r) else None) for i,k in enumerate(cols)}
            if not obj.get('type'): obj['type'] = 'group'
            if not obj.get('skuGroup'): obj['skuGroup'] = obj.get('skuName') or ''
            migrated.append([obj.get(k) for k in COLS])
        new_rows = migrated
    for p in fresh:
        new_rows.append([p.get(k) for k in COLS])

    out = {'cols': COLS, 'rows': new_rows}
    CLZ.write_text(json.dumps(out, separators=(',', ':')) + '\n')

    # Reporting
    by_day = {}
    for p in fresh: by_day[p['ts']] = by_day.get(p['ts'], 0) + 1
    print(f"proposals: {len(proposals)}")
    print(f"after per-store/day cap of {MAX_PER_DAY}: {len(capped)}  (dropped {dropped})")
    print(f"fresh after dedup: {len(fresh)}")
    print(f"closures.json: {len(rows)} -> {len(new_rows)} rows")
    print("by day (top 10):")
    for d in sorted(by_day, reverse=True)[:10]:
        print(f"  {d}  {by_day[d]}")
    return 0

if __name__ == '__main__':
    sys.exit(main())
