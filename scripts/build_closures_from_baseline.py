#!/usr/bin/env python3
"""
build_closures_from_baseline.py - Generate closures.json by diffing the
5/3 baseline (data/dataset.json) against the current API snapshot
(data/api-snapshot.json).

A "void" = a (store, SKU group) pair with no orders YTD as of 5/3.
A "closure" = a void that has revenue > 0 in the current snapshot
              (i.e., the store has placed at least one order for that
               SKU group between 5/4 and the snapshot date).

The 5/3 baseline lives in dataset.json which has its meta.endDate locked
at 2026-05-03. The current state lives in api-snapshot.json which the
daily workflow refreshes.

Output: data/closures.json, one entry per closure, dated as the snapshot
generation date (so all backfilled closures from 5/4 - snapshot_date
show up clustered on that date, which is the day we DETECTED them as
closed - the actual order day is unknowable without daily granularity).

Designed to run once to backfill; the daily refresh_closures.py then
appends new closures going forward using the same 5/3 baseline.
"""

from __future__ import annotations
import json, sys, re, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / 'data' / 'dataset.json'
SNAPSHOT_PATH = ROOT / 'data' / 'api-snapshot.json'
CLOSURES_PATH = ROOT / 'data' / 'closures.json'

# Mirror the trade-sample filter from apiAdapter.jsx so closures don't
# count freebie placements.
TS_RE = re.compile(r'(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)', re.I)
def is_trade_sample(name: str) -> bool:
    return bool(TS_RE.search(name or ''))

PERMANENT_BLOCK = {
    'dabstract live resin disposable pens - 1g',
    'panda pen disposables 1g',
}
def is_blocked(name: str) -> bool:
    return (name or '').lower().strip() in PERMANENT_BLOCK

def should_drop(name: str) -> bool:
    return is_trade_sample(name) or is_blocked(name)


def baseline_active_pairs(ds: dict) -> set[tuple[str, str]]:
    """Return {(client_name, sku_name)} for pairs with rev > 0 in the
    5/3 baseline dataset (i.e., NOT voids as of 5/3)."""
    clients = {c['i']: c.get('n', '') for c in ds.get('clients', [])}
    skus    = {s['i']: s.get('n', '') for s in ds.get('skus', [])}
    out = set()
    for m in ds.get('matrix', []):
        if (m.get('r', 0) or 0) <= 0:
            continue
        cn = clients.get(m.get('c'))
        sn = skus.get(m.get('s'))
        if cn and sn:
            out.add((cn, sn))
    return out


_HOUSE_RE = re.compile(r'\s*-\s*house\s*$', re.I)
def norm_rep(name: str) -> str:
    return _HOUSE_RE.sub('', name or '').strip()


def snapshot_current(api: dict) -> tuple[dict, dict, dict]:
    """Returns (sales_map, clients_meta, perf_categories).
    sales_map: {(client_name, sku_name): {'rev_cents', 'units'}}.
    clients_meta: {client_name: {'sr', 'vr'}}.
    perf_categories: {sku_name: high-level category}.
    """
    clients_rows = api['dimensions']['clients']['rows']
    perf_rows    = api['dimensions']['performance_categories']['rows']
    reps_rows    = api['dimensions']['reps']['rows']
    ccs          = api['facts']['category_client_sales']

    def rep_name(idx):
        if idx is None or idx < 0 or idx >= len(reps_rows):
            return ''
        return reps_rows[idx][1] or ''

    clients_meta = {}
    for row in clients_rows:
        clients_meta[row[1]] = {
            'sr': norm_rep(rep_name(row[2])) or 'Unassigned',
            'vr': norm_rep(rep_name(row[3])) or 'Unassigned',
        }

    keep_perf = [not should_drop(r[1]) for r in perf_rows]

    sales_map: dict[tuple[str, str], dict] = {}
    for i in range(len(ccs['row'])):
        col = ccs['col'][i]
        if not keep_perf[col]:
            continue
        client_name = clients_rows[ccs['row'][i]][1]
        sku_name    = perf_rows[col][1]
        rev         = ccs['revenue_cents'][i]
        u           = ccs['units'][i]
        key = (client_name, sku_name)
        agg = sales_map.get(key)
        if agg is None:
            sales_map[key] = {'rev_cents': rev, 'units': u}
        else:
            agg['rev_cents'] += rev
            agg['units']     += u

    perf_categories = {row[1]: infer_top_category(row[1]) for row in perf_rows}

    return sales_map, clients_meta, perf_categories


def infer_top_category(name: str) -> str:
    n = (name or '').lower()
    if 'bong buddies' in n: return 'Flower'
    if 'hot shot' in n or 'hot shotz' in n: return 'Beverage'
    if 'panda pen' in n: return 'Vapes'
    if 'juice box' in n: return 'Vapes'
    if 'cake icing' in n or 'cake batter' in n or 'opal sugar' in n: return 'Concentrates'
    if 'flower' in n: return 'Flower'
    if any(k in n for k in ('preroll','pre-roll','joint','firecracker','sparkler')): return 'Prerolls'
    if any(k in n for k in ('vape','cart','disposable','pod','aio')): return 'Vapes'
    if any(k in n for k in ('gummiez','gummies','gummy','edible','chocolate','candies','candy','caramel','drop')): return 'Edibles'
    if any(k in n for k in ('concentrate','dab','rosin','wax','shatter','badder','budder','crumble','sauce','sugar','diamond','icing','gems n','hash','banger')): return 'Concentrates'
    if any(k in n for k in ('topical','balm','cream')): return 'Topicals'
    if 'tincture' in n: return 'Tinctures'
    if any(k in n for k in ('beverage','drink','soda','seltzer')): return 'Beverage'
    if any(k in n for k in ('accessor','apparel','merch','sticker')): return 'Accessories'
    return 'Other'


def main() -> int:
    baseline = json.loads(BASELINE_PATH.read_text())
    snapshot = json.loads(SNAPSHOT_PATH.read_text())

    baseline_end = baseline.get('meta', {}).get('endDate', '(unknown)')
    snap_date    = (snapshot.get('generated_at') or '')[:10] or '(unknown)'
    print(f"5/3 baseline: period 1/1 -> {baseline_end} ({len(baseline.get('matrix', [])):,} pairs)")
    print(f"current snapshot: {snap_date}")

    active_53 = baseline_active_pairs(baseline)
    print(f"active pairs as of {baseline_end}: {len(active_53):,}")

    sales_now, clients_meta, perf_cats = snapshot_current(snapshot)
    print(f"active pairs in current snapshot: {sum(1 for v in sales_now.values() if v['rev_cents'] > 0):,}")

    closures = []
    today = datetime.datetime.utcnow().date().isoformat()
    for (client_name, sku_name), cell in sales_now.items():
        if cell['rev_cents'] <= 0:
            continue
        if (client_name, sku_name) in active_53:
            continue  # was already active on the baseline date
        # New: was a void as of 5/3, now has revenue.
        cli = clients_meta.get(client_name, {})
        closures.append({
            'ts':         snap_date if snap_date != '(unknown)' else today,
            'clientName': client_name,
            'skuName':    sku_name,
            'category':   perf_cats.get(sku_name, 'Other'),
            'rev':        round(cell['rev_cents'] / 100, 2),
            'units':      int(cell['units']),
            'sr':         cli.get('sr', 'Unassigned'),
            'vr':         cli.get('vr', 'Unassigned'),
        })

    print(f"closed voids: {len(closures):,}")
    if closures:
        per_rep = {}
        for c in closures:
            per_rep[c['sr']] = per_rep.get(c['sr'], 0) + 1
        print("\nClosed voids by sales rep (top 10):")
        for rep, n in sorted(per_rep.items(), key=lambda x: -x[1])[:10]:
            print(f"    {rep:30}  {n}")
        per_cat = {}
        for c in closures:
            per_cat[c['category']] = per_cat.get(c['category'], 0) + 1
        print("\nBy category:")
        for cat, n in sorted(per_cat.items(), key=lambda x: -x[1]):
            print(f"    {cat:20}  {n}")

    CLOSURES_PATH.write_text(json.dumps(closures, separators=(',', ':')) + '\n')
    print(f"\nwrote {CLOSURES_PATH.relative_to(ROOT)} ({CLOSURES_PATH.stat().st_size:,} bytes)")
    return 0


if __name__ == '__main__':
    sys.exit(main())
