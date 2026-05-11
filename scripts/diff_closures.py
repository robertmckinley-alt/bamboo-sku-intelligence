#!/usr/bin/env python3
"""
diff_closures.py — Detect new SKU-group placements between two dataset snapshots.

Usage:
    python scripts/diff_closures.py <prev.json> <curr.json> <closures.json>

A "closure" is a (client, sku_group) pair that had ZERO revenue in <prev.json>
(or wasn't present in the matrix at all) and has POSITIVE revenue in <curr.json>.

Each closure records: detection date (today, UTC), client id + name, SKU group id +
name + category, revenue + units on detection day, sales rep, VMI rep.

The script APPENDS new closures to <closures.json> (which must contain a JSON array,
even if empty). Closures are de-duplicated against any (date, client, sku) keys
already present so re-runs on the same day are idempotent.

Designed to run as a daily Vercel cron after the API-driven dataset.json regen.
"""

from __future__ import annotations
import json, sys, datetime, pathlib


def matrix_index(d: dict) -> dict:
    """Return {(client_id, sku_id): {'r': rev, 'u': units}} for a dataset."""
    out = {}
    for m in d.get('matrix', []):
        out[(m['c'], m['s'])] = {'r': m.get('r', 0), 'u': m.get('u', 0)}
    return out


def diff(prev: dict, curr: dict, today: str) -> list[dict]:
    prev_ix = matrix_index(prev)
    curr_ix = matrix_index(curr)

    clients_by_id = {c['i']: c for c in curr.get('clients', [])}
    skus_by_id    = {s['i']: s for s in curr.get('skus',    [])}

    closures = []
    for (cid, sid), cell in curr_ix.items():
        if cell['r'] <= 0:
            continue
        prev_cell = prev_ix.get((cid, sid))
        was_zero = (prev_cell is None) or (prev_cell['r'] <= 0)
        if not was_zero:
            continue
        cl = clients_by_id.get(cid)
        sk = skus_by_id.get(sid)
        if not cl or not sk:
            continue
        closures.append({
            'ts':         today,
            'client':     cid,
            'clientName': cl.get('n', ''),
            'sku':        sid,
            'skuName':    sk.get('n', ''),
            'category':   sk.get('c', ''),
            'rev':        round(cell['r'], 2),
            'units':      int(cell['u']),
            'sr':         cl.get('sr', '') or 'Unassigned',
            'vr':         cl.get('vr', '') or 'Unassigned',
        })
    return closures


def main():
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    prev_path, curr_path, closures_path = sys.argv[1:]
    today = datetime.datetime.utcnow().date().isoformat()

    prev = json.loads(pathlib.Path(prev_path).read_text())
    curr = json.loads(pathlib.Path(curr_path).read_text())

    new = diff(prev, curr, today)

    existing = json.loads(pathlib.Path(closures_path).read_text() or '[]')

    # De-dupe by (ts, client, sku) — re-running for the same day shouldn't bloat
    seen = {(e['ts'], e['client'], e['sku']) for e in existing}
    fresh = [c for c in new if (c['ts'], c['client'], c['sku']) not in seen]

    combined = existing + fresh
    pathlib.Path(closures_path).write_text(
        json.dumps(combined, separators=(',', ':')) + '\n'
    )

    print(f"diff_closures: {len(fresh)} new closures appended "
          f"({len(new)} detected, {len(new)-len(fresh)} already recorded) "
          f"-> total {len(combined)}")


if __name__ == '__main__':
    main()
