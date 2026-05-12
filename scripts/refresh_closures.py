#!/usr/bin/env python3
"""
refresh_closures.py — Fetch the Bamboo Intelligence API, detect new SKU-group
placements vs the previous snapshot, and append them to data/closures.json.

Designed to run from .github/workflows/daily-closures.yml on a cron.

Inputs/outputs (paths relative to repo root):
  - Reads  data/api-snapshot.json   (previous day's raw API response; optional first run)
  - Writes data/api-snapshot.json   (today's raw API response — for tomorrow's diff)
  - Reads  data/closures.json       (running closure history, JSON array)
  - Writes data/closures.json       (with new closures appended; de-duped by date+client+sku)

A "closure" is a (client, performance-category) pair whose revenue was zero (or
absent) in the previous snapshot and is positive in today's. Attribution comes
from clients.rows[i][2] (sales rep idx) and [3] (VMI rep idx), which look up
into reps.rows.

Trade-sample categories (matching the same regex as apiAdapter.jsx) are
filtered out so closures only count revenue-bearing placements.
"""

from __future__ import annotations
import json, os, re, sys, datetime, pathlib, urllib.request

API_URL = 'https://api-intelligence.getbamboo.com/api/reports'

ROOT          = pathlib.Path(__file__).resolve().parent.parent
SNAPSHOT_PATH = ROOT / 'data' / 'api-snapshot.json'
CLOSURES_PATH = ROOT / 'data' / 'closures.json'

# Mirror the trade-sample filter from apiAdapter.jsx
TS_RE = re.compile(r'(trade\s*sample)|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)', re.I)
def is_trade_sample(name: str) -> bool:
    return bool(TS_RE.search(name or ''))


def fetch_api() -> dict:
    print(f"Fetching {API_URL} ...")
    req = urllib.request.Request(API_URL, headers={'User-Agent': 'bamboo-closures-cron/1.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    print(f"  got {len(body):,} bytes")
    return json.loads(body)


def name_keyed_sales(api: dict) -> dict[tuple[str, str], dict]:
    """Returns {(client_name, perf_cat_name): {'rev_cents': int, 'units': int}},
    filtering out trade-sample categories."""
    clients = api['dimensions']['clients']['rows']
    perf    = api['dimensions']['performance_categories']['rows']
    ccs     = api['facts']['category_client_sales']

    keep_perf = [not is_trade_sample(row[1]) for row in perf]

    out: dict[tuple[str, str], dict] = {}
    for i in range(len(ccs['row'])):
        col = ccs['col'][i]
        if not keep_perf[col]:
            continue
        client_name = clients[ccs['row'][i]][1]
        sku_name    = perf[col][1]
        rev         = ccs['revenue_cents'][i]
        u           = ccs['units'][i]
        key = (client_name, sku_name)
        agg = out.get(key)
        if agg is None:
            out[key] = {'rev_cents': rev, 'units': u}
        else:
            agg['rev_cents'] += rev
            agg['units']     += u
    return out


def client_lookup(api: dict) -> dict[str, dict]:
    """{client_name: {sr, vr, ...}}"""
    reps    = api['dimensions']['reps']['rows']
    clients = api['dimensions']['clients']['rows']
    def rep_name(idx):
        if idx is None or idx < 0 or idx >= len(reps): return ''
        return reps[idx][1] or ''
    out = {}
    for row in clients:
        # [id, name, fr, vr, pg, dl, vs, ls, lic, isRev]
        out[row[1]] = {
            'sr': rep_name(row[2]) or 'Unassigned',
            'vr': rep_name(row[3]) or 'Unassigned',
        }
    return out


def perf_category_lookup(api: dict) -> dict[str, dict]:
    """Map perf-category name -> a high-level category guess (mirrors
    inferTopCategory from apiAdapter.jsx, simplified)."""
    out = {}
    for row in api['dimensions']['performance_categories']['rows']:
        name = row[1] or ''
        out[name] = {'cat': infer_top_category(name)}
    return out


def infer_top_category(name: str) -> str:
    n = (name or '').lower()
    if 'flower'   in n: return 'Flower'
    if 'preroll'  in n or 'pre-roll' in n: return 'Prerolls'
    if any(k in n for k in ('vape','cart','disposable','pod')):  return 'Vapes'
    if any(k in n for k in ('edible','gummy','chocolate','beverage')): return 'Edibles'
    if any(k in n for k in ('concentrate','dab','rosin','wax','shatter','badder','sugar','diamond')): return 'Concentrates'
    if 'topical'  in n: return 'Topicals'
    if 'tincture' in n: return 'Tinctures'
    if any(k in n for k in ('accessor','apparel','merch')): return 'Accessories'
    return 'Other'


def diff(prev_api: dict | None, curr_api: dict, today: str) -> list[dict]:
    curr_sales = name_keyed_sales(curr_api)
    prev_sales = name_keyed_sales(prev_api) if prev_api else {}
    clients    = client_lookup(curr_api)
    perf       = perf_category_lookup(curr_api)

    closures = []
    for (client_name, sku_name), cell in curr_sales.items():
        if cell['rev_cents'] <= 0:
            continue
        prev_cell = prev_sales.get((client_name, sku_name))
        was_zero  = (prev_cell is None) or (prev_cell['rev_cents'] <= 0)
        if not was_zero:
            continue
        cli = clients.get(client_name, {})
        pc  = perf.get(sku_name, {'cat': 'Other'})
        closures.append({
            'ts':         today,
            'clientName': client_name,
            'skuName':    sku_name,
            'category':   pc['cat'],
            'rev':        round(cell['rev_cents'] / 100, 2),
            'units':      int(cell['units']),
            'sr':         cli.get('sr', 'Unassigned'),
            'vr':         cli.get('vr', 'Unassigned'),
        })
    return closures


def main() -> int:
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

    new = diff(prev_api, curr_api, today)
    print(f"  detected {len(new)} new (client × SKU group) placements vs previous snapshot")

    # Append to closures.json (idempotent against re-runs on the same day)
    existing = []
    if CLOSURES_PATH.exists():
        try:
            existing = json.loads(CLOSURES_PATH.read_text() or '[]')
        except Exception:
            existing = []

    seen = {(e['ts'], e['clientName'], e['skuName']) for e in existing}
    fresh = [c for c in new if (c['ts'], c['clientName'], c['skuName']) not in seen]
    print(f"  {len(fresh)} fresh (after de-dup) -> total {len(existing) + len(fresh)}")

    combined = existing + fresh
    CLOSURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLOSURES_PATH.write_text(json.dumps(combined, separators=(',', ':')) + '\n')

    # Write today's snapshot for tomorrow's diff
    SNAPSHOT_PATH.write_text(json.dumps(curr_api, separators=(',', ':')))
    print(f"  wrote snapshot to {SNAPSHOT_PATH.relative_to(ROOT)} ({SNAPSHOT_PATH.stat().st_size:,} bytes)")
    print(f"  wrote closures to {CLOSURES_PATH.relative_to(ROOT)} ({CLOSURES_PATH.stat().st_size:,} bytes)")

    # Summary for the GH Action log
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
