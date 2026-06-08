#!/usr/bin/env python3
"""
refresh_closures.py — Fetch the Bamboo Intelligence API, detect new placements
vs the previous snapshot, and append them to data/closures.json.

A closure is recorded at TWO granularities:

  type = "group"   — (client, performance-category) flipped 0->positive.
                     Brand-new SKU group for this store.
  type = "product" — (client, individual product) flipped 0->positive when the
                     parent group was ALREADY positive for that store.
                     Expansion within an existing group. Brand-new groups are
                     NOT also emitted as product closures so every business
                     event is counted exactly once.

Product-level diffing requires facts.client_product_sales (in the API since
mid-cycle). When either snapshot lacks it the cron degrades to group-only.

Files (relative to repo root):
  Reads  data/api-snapshot.json     previous day's raw API
  Writes data/api-snapshot.json     today's raw API for tomorrow's diff
  Reads  data/closures.json         running history, compact {cols,rows}
  Writes data/closures.json         appended; de-duped on (date, client, type, sku)

Trade-sample SKUs and test clients are filtered out.
"""

from __future__ import annotations
import json, os, re, sys, datetime, pathlib, urllib.request

API_URL = 'https://api-intelligence.getbamboo.com/api/reports'

ROOT           = pathlib.Path(__file__).resolve().parent.parent
SNAPSHOT_PATH  = ROOT / 'data' / 'api-snapshot.json'
CLOSURES_PATH  = ROOT / 'data' / 'closures.json'
OVERRIDES_PATH = ROOT / 'data' / 'closure-overrides.json'

# Compact format columns. Added: type, skuGroup.
COMPACT_COLS = ['ts','clientName','skuName','category','rev','units','sr','vr','type','skuGroup']

_NORM_SUFFIX_RE = re.compile(r'\s*-\s*(VMI|1WT|NBA)\s*$', re.I)
def norm_client(n: str) -> str:
    s = n or ''
    for _ in range(3):
        s = _NORM_SUFFIX_RE.sub('', s)
    return s.strip()

def load_closures(path: pathlib.Path) -> list:
    if not path.exists():
        return []
    try:
        d = json.loads(path.read_text() or '[]')
    except Exception:
        return []
    if isinstance(d, dict) and 'cols' in d and 'rows' in d:
        cols = d['cols']
        out = []
        for row in d['rows']:
            obj = {k: (row[i] if i < len(row) else None) for i, k in enumerate(cols)}
            # Legacy rows were group-level; backfill type + skuGroup defaults.
            if obj.get('type') is None: obj['type'] = 'group'
            if not obj.get('skuGroup'): obj['skuGroup'] = obj.get('skuName') or ''
            out.append(obj)
        return out
    return d or []

def save_closures(path: pathlib.Path, items: list) -> None:
    rows = [[c.get(k) for k in COMPACT_COLS] for c in items]
    out = {'cols': COMPACT_COLS, 'rows': rows}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, separators=(',', ':')) + '\n')

def load_overrides(path: pathlib.Path) -> set:
    if not path.exists():
        return set()
    try:
        d = json.loads(path.read_text() or '{}')
    except Exception:
        return set()
    out = set()
    for o in d.get('suppress', []):
        out.add((norm_client(o.get('client', '')), (o.get('sku', '') or '').lower().strip()))
    return out

TS_RE = re.compile(r'(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)', re.I)
def is_trade_sample(name: str) -> bool: return bool(TS_RE.search(name or ''))

PERMANENT_BLOCK = {
    'dabstract live resin disposable pens - 1g',
    'panda pen disposables 1g',
}
def is_blocked(name: str) -> bool: return (name or '').lower().strip() in PERMANENT_BLOCK
def should_drop(name: str) -> bool: return is_trade_sample(name) or is_blocked(name)

_TEST_CLIENT_RE = re.compile(r'\btest\b', re.I)
def is_test_client(name: str) -> bool: return bool(_TEST_CLIENT_RE.search(name or ''))

def fetch_api() -> dict:
    print(f"Fetching {API_URL} ...")
    req = urllib.request.Request(API_URL, headers={'User-Agent': 'bamboo-closures-cron/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    print(f"  got {len(body):,} bytes")
    return json.loads(body)


def name_keyed_sales(api: dict) -> dict:
    """{(norm_client, perf_cat_name): {rev_cents, units, display}} — SKU-group level."""
    clients = api['dimensions']['clients']['rows']
    perf    = api['dimensions']['performance_categories']['rows']
    ccs     = api['facts']['category_client_sales']
    keep_perf = [not should_drop(row[1]) for row in perf]
    out = {}
    for i in range(len(ccs['row'])):
        col = ccs['col'][i]
        if not keep_perf[col]:
            continue
        client_name = clients[ccs['row'][i]][1]
        if is_test_client(client_name):
            continue
        sku_name = perf[col][1]
        rev = ccs['revenue_cents'][i]
        u   = ccs['units'][i]
        key = (norm_client(client_name), sku_name)
        agg = out.get(key)
        if agg is None:
            out[key] = {'rev_cents': rev, 'units': u, 'display': client_name}
        else:
            agg['rev_cents'] += rev
            agg['units']     += u
    return out


def name_keyed_product_sales(api: dict):
    """{(norm_client, product_idx): {...}} — product level. None if fact absent."""
    cps = (api.get('facts') or {}).get('client_product_sales')
    if not cps or not isinstance(cps.get('row'), list):
        return None
    clients     = api['dimensions']['clients']['rows']
    products    = api['dimensions']['products']['rows']
    retail_cats = api['dimensions']['retail_categories']['rows']
    out = {}
    for i in range(len(cps['row'])):
        client_name = clients[cps['row'][i]][1]
        if is_test_client(client_name):
            continue
        col = cps['col'][i]
        if col is None or col < 0 or col >= len(products):
            continue
        prod_row = products[col]
        prod_name = prod_row[1]
        if should_drop(prod_name):
            continue
        grp_idx = prod_row[3] if len(prod_row) > 3 else None
        group_name = ''
        if grp_idx is not None and 0 <= grp_idx < len(retail_cats):
            group_name = retail_cats[grp_idx][1] or ''
        if should_drop(group_name):
            continue
        rev = cps['revenue_cents'][i]
        u   = cps['units'][i] if cps.get('units') else 0
        key = (norm_client(client_name), col)
        agg = out.get(key)
        if agg is None:
            out[key] = {
                'rev_cents': rev, 'units': u, 'display': client_name,
                'product_name': prod_name, 'group_name': group_name,
                'cat': infer_top_category(group_name) if group_name else 'Other',
            }
        else:
            agg['rev_cents'] += rev
            agg['units']     += u
    return out


_HOUSE_RE = re.compile(r'\s*-\s*house\s*$', re.I)
def norm_rep(name: str) -> str: return _HOUSE_RE.sub('', name or '').strip()

def client_lookup(api: dict) -> dict:
    reps    = api['dimensions']['reps']['rows']
    clients = api['dimensions']['clients']['rows']
    def rep_name(idx):
        if idx is None or idx < 0 or idx >= len(reps): return ''
        return reps[idx][1] or ''
    out = {}
    for row in clients:
        out[row[1]] = {
            'sr': norm_rep(rep_name(row[2])) or 'Unassigned',
            'vr': norm_rep(rep_name(row[3])) or 'Unassigned',
        }
    return out

def perf_category_lookup(api: dict) -> dict:
    out = {}
    for row in api['dimensions']['performance_categories']['rows']:
        name = row[1] or ''
        out[name] = {'cat': infer_top_category(name)}
    return out

def infer_top_category(name: str) -> str:
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


def diff(prev_api, curr_api, today, existing_set_group=None, existing_set_product=None, baseline_set=None):
    """Detect new placements after the 5/3 baseline.

    A closure is emitted when (store, group) was NOT in the 1/1-5/3 baseline
    (loaded from data/baseline_5_3.json — a list of [norm_client_lower,
    group_name_lower] pairs that had revenue 1/1-5/3). For each such new
    (store, group), we emit a group closure plus a product closure for every
    active product in that group at that store, dated to last_ordered_at_utc.

    Re-emission is prevented by dedup against existing closures.json
    (existing_set_group, existing_set_product) — once a placement has been
    recorded once, it stays recorded.
    """
    clients = client_lookup(curr_api)
    closures = []

    clients_d  = curr_api['dimensions']['clients']['rows']
    products_d = curr_api['dimensions']['products']['rows']
    retail_d   = curr_api['dimensions']['retail_categories']['rows']
    cps        = (curr_api.get('facts') or {}).get('client_product_sales')
    if not cps or not isinstance(cps.get('row'), list):
        print("  client_product_sales fact missing — cannot detect closures")
        return closures
    los = cps.get('last_ordered_at_utc') or []
    if not los or len(los) != len(cps['row']):
        print("  last_ordered_at_utc missing or mis-sized — cannot detect closures")
        return closures

    MIN_DATE = '2026-05-03'

    existing_set_group   = existing_set_group   or set()
    existing_set_product = existing_set_product or set()
    baseline_set         = baseline_set         or set()

    group_dates = {}
    group_meta  = {}
    seen_g = set(); seen_p = set()

    for i in range(len(cps['row'])):
        rev = cps['revenue_cents'][i]
        if rev <= 0: continue
        ts = los[i]
        if not ts: continue
        day = ts[:10]
        if day < MIN_DATE: continue
        if day > today: day = today
        cidx = cps['row'][i]; pidx = cps['col'][i]
        if cidx is None or cidx >= len(clients_d): continue
        cli = clients_d[cidx]; client_name = cli[1]
        if is_test_client(client_name): continue
        if pidx is None or pidx >= len(products_d): continue
        prow = products_d[pidx]
        pname = prow[1]
        if should_drop(pname): continue
        grp_idx = prow[3] if len(prow) > 3 else None
        gname = retail_d[grp_idx][1] if (grp_idx is not None and 0<=grp_idx<len(retail_d)) else ''
        if not gname or should_drop(gname): continue

        norm = norm_client(client_name).lower()
        glower = gname.lower()
        # Skip if store already had this group pre-5/3
        if (norm, glower) in baseline_set: continue

        cli_rep = clients.get(client_name, {})
        sr = cli_rep.get('sr', 'Unassigned')
        vr = cli_rep.get('vr', 'Unassigned')
        cat = infer_top_category(gname) if gname else 'Other'
        units = (cps.get('units') or [0]*len(cps['row']))[i]

        # Product closure
        pk = (norm, pname.lower())
        if pk not in existing_set_product and pk not in seen_p:
            seen_p.add(pk)
            closures.append({
                'ts': day, 'clientName': client_name, 'skuName': pname,
                'category': cat,
                'rev': round(rev/100, 2), 'units': int(units),
                'sr': sr, 'vr': vr,
                'type': 'product', 'skuGroup': gname,
            })

        # Group closure (one per store, group, deduped against existing + this run)
        gk = (norm, glower)
        if gk not in existing_set_group and gk not in seen_g:
            seen_g.add(gk)
            group_dates[gk] = day
            group_meta[gk] = {'client': client_name, 'sr': sr, 'vr': vr, 'cat': cat, 'group_display': gname}
        elif gk in seen_g:
            # bump the date forward to max
            if day > group_dates.get(gk, day): group_dates[gk] = day

    for gk, day in group_dates.items():
        m = group_meta[gk]
        closures.append({
            'ts': day, 'clientName': m['client'], 'skuName': m['group_display'],
            'category': m['cat'],
            'rev': 0.0, 'units': 0,
            'sr': m['sr'], 'vr': m['vr'],
            'type': 'group', 'skuGroup': m['group_display'],
        })
    return closures


def main():
    today = datetime.datetime.utcnow().date().isoformat()
    curr_api = fetch_api()

    prev_api = None
    if SNAPSHOT_PATH.exists():
        try:
            prev_api = json.loads(SNAPSHOT_PATH.read_text())
            prev_gen = prev_api.get('generated_at') or '(unknown)'
            print(f"  previous snapshot dated {prev_gen}")
        except Exception as e:
            print(f"  warning: could not parse previous snapshot: {e}")
            prev_api = None
    else:
        print("  no previous snapshot — bootstrapping baseline (0 closures expected on first run)")

    BASELINE_PATH = ROOT / 'data' / 'baseline_5_3.json'
    baseline_set = set()
    if BASELINE_PATH.exists():
        try:
            for pair in json.loads(BASELINE_PATH.read_text()):
                baseline_set.add(tuple(pair))
            print(f"  loaded 5/3 baseline: {len(baseline_set):,} (store, group) pairs")
        except Exception as e:
            print(f"  WARN: could not load baseline_5_3.json: {e}")
    else:
        print("  WARN: data/baseline_5_3.json missing — closures will not be baseline-filtered")
    existing_for_dedup = load_closures(CLOSURES_PATH)
    existing_set_group = set()
    existing_set_product = set()
    # Support both compact {cols, rows} form and array-of-dicts form.
    if isinstance(existing_for_dedup, list):
        for r in existing_for_dedup:
            if isinstance(r, list):
                # compact row layout — assume COMPACT_COLS order
                rd = dict(zip(COMPACT_COLS, r))
            else:
                rd = r
            cn = norm_client(rd.get('clientName') or '').lower()
            tp = (rd.get('type') or 'group')
            sk = (rd.get('skuName') or '').lower()
            grp = (rd.get('skuGroup') or sk).lower()
            if tp == 'product':
                existing_set_product.add((cn, sk))
            else:
                existing_set_group.add((cn, grp))
    print(f"  existing dedup sets: {len(existing_set_group)} groups · {len(existing_set_product)} products")
    new = diff(prev_api, curr_api, today, existing_set_group, existing_set_product, baseline_set)
    by_type = {'group': 0, 'product': 0}
    for c in new: by_type[c['type']] = by_type.get(c['type'], 0) + 1
    print(f"  detected {len(new)} closures ({by_type.get('group',0)} group + {by_type.get('product',0)} product)")

    # Bootstrap-dump guard. Group-only days topped ~60; with product detail the
    # ceiling is higher; 1500 still blocks a stale-snapshot blowout.
    MAX_DAILY_CLOSURES = 1500
    if len(new) > MAX_DAILY_CLOSURES:
        print(f"  WARNING: {len(new)} closures is far above a normal day "
              f"(cap {MAX_DAILY_CLOSURES}) — previous snapshot was likely stale. "
              f"Skipping append; refreshing snapshot only.")
        SNAPSHOT_PATH.write_text(json.dumps(curr_api, separators=(',', ':')))
        return 0

    existing = load_closures(CLOSURES_PATH)

    overrides = load_overrides(OVERRIDES_PATH)
    if overrides:
        before = len(new)
        new = [c for c in new
               if (norm_client(c['clientName']), (c['skuName'] or '').lower().strip()) not in overrides
               and (norm_client(c['clientName']), (c.get('skuGroup') or '').lower().strip()) not in overrides]
        if before != len(new):
            print(f"  suppressed {before - len(new)} closure(s) via closure-overrides.json")

    # De-dup on (ts, client, type, sku). Same product on same day = same event.
    seen = {(e.get('ts'), e.get('clientName'), e.get('type') or 'group', e.get('skuName')) for e in existing}
    fresh = [c for c in new if (c['ts'], c['clientName'], c['type'], c['skuName']) not in seen]
    print(f"  {len(fresh)} fresh (after de-dup) -> total {len(existing) + len(fresh)}")

    combined = existing + fresh
    save_closures(CLOSURES_PATH, combined)

    SNAPSHOT_PATH.write_text(json.dumps(curr_api, separators=(',', ':')))
    print(f"  wrote snapshot to {SNAPSHOT_PATH.relative_to(ROOT)} ({SNAPSHOT_PATH.stat().st_size:,} bytes)")
    print(f"  wrote closures to {CLOSURES_PATH.relative_to(ROOT)} ({CLOSURES_PATH.stat().st_size:,} bytes)")

    if fresh:
        per_rep = {}
        for c in fresh:
            per_rep[c['sr']] = per_rep.get(c['sr'], 0) + 1
        print("\nNew closures by sales rep:")
        for rep, n in sorted(per_rep.items(), key=lambda x: -x[1])[:10]:
            print(f"    {rep:30}  {n}")

    return 0

if __name__ == '__main__':
    sys.exit(main())
