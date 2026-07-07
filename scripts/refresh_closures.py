#!/usr/bin/env python3
"""refresh_closures.py — daily closure rebuild under the 2026-06-08 spec.

Definition of a closure (no exceptions):
  * Baseline = 5/31 EOD snapshot (data/baseline_5_31_snapshot.json). Builds
    SKU_BASELINE = {(clientName, skuName)} and CAT_BASELINE =
    {(clientName, retail_category)}.
  * For each (store, SKU) in today's API client_product_sales fact:
      - skip if (store, SKU) in SKU_BASELINE             (re-order, not new)
      - skip if last_ordered_at_utc < 2026-06-01         (pre-ledger)
      - if retail_category in PRIORITY (top-20 non-Dab cats) AND SKU is in
        the top-10 for that category -> emit TOP-SKU closure (one per pair)
      - else -> roll up to (store, retail_category) bucket; one closure per
        bucket, revenue = sum of all new non-top SKUs landing there.
  * Bucket closures are emitted as "cat-new" only when (store, cat) is NOT in
    CAT_BASELINE and no top-sku closure already fired for that (store, cat).
    Cat-expansion (store already had the line) is skipped entirely — it never
    appears in the output (spec v2026-06-08-d). Top-SKU closures get "top-sku".

Test stores are excluded; trade-sample / discontinued SKUs filtered via the
should_drop helper. VMI rep is gated to Josh Novak / Koen / Curtis.

Output: data/closures.json is REBUILT from scratch every run. There is no
append / dedup pile because the rule is deterministic given the snapshot.
"""
from __future__ import annotations
import json, re, sys, datetime, pathlib, urllib.request
from collections import defaultdict

# NO ?from= query param — the API honors it by dropping stores without recent
# activity, which broke dashboard counts once before (see CLAUDE.md §7,
# reverted in bb29086). Closure detection filters to 6/1+ itself via
# last_ordered_at_utc, so the unconstrained pull is numbers-identical here.
API_URL = "https://api-intelligence.getbamboo.com/api/reports"

ROOT = pathlib.Path(__file__).resolve().parent.parent
SNAPSHOT_PATH        = ROOT / "data" / "api-snapshot.json"
BASELINE_PATH        = ROOT / "data" / "baseline_5_31_snapshot.json"
TOP_SKUS_PATH        = ROOT / "data" / "top_skus_per_priority_category.json"
CLOSURES_PATH        = ROOT / "data" / "closures.json"
OVERRIDES_PATH       = ROOT / "data" / "closure-overrides.json"

COMPACT_COLS = ["ts","clientName","skuName","category","rev","units","sr","vr","type","skuGroup","closureKind"]

DAB_RE = re.compile(r"\bdabstract\b", re.I)
_TEST_CLIENT_RE = re.compile(r"\btest\b", re.I)
def is_test_client(name): return bool(_TEST_CLIENT_RE.search(name or ""))

_DROP_PATTERNS = [
    re.compile(r"\bTS\b", re.I), re.compile(r"\btrade sample", re.I),
    re.compile(r"discontinued", re.I), re.compile(r"do not order", re.I),
    re.compile(r"do not stock", re.I),
]
def should_drop(name):
    if not name: return False
    return any(p.search(name) for p in _DROP_PATTERNS)

_HOUSE_RE = re.compile(r"\s*-\s*house\s*$", re.I)
def clean_rep(n): return _HOUSE_RE.sub("", n or "").strip() or "Unassigned"

VMI_PATTERNS = [re.compile(p, re.I) for p in [r"^josh\s+novak\b", r"^koen\b", r"^curtis\b"]]
def gate_vmi(name):
    t = (name or "").strip()
    return t if any(p.search(t) for p in VMI_PATTERNS) else "Unassigned"

_CAT_HINTS = [
    # PICC is all prerolls (infused + non-infused) and Vape Carry Case is an
    # accessory — both must match BEFORE the generic keyword rows below
    # (PICC names contain "hash"/"flower"; the case contains "vape").
    # Mirrors inferTopCategory() in apiAdapter.jsx (Johnny, 7/1).
    ("Prerolls", ["picc"]),
    ("Accessories", ["carry case"]),
    ("Vapes", ["aio","510","cartridge","liquid gold","panda pen","micro bar","juice box","capsule"]),
    ("Prerolls", ["preroll","bangers","mega roll","firecracker","sparkler","huxton","infused joint","banger"]),
    ("Flower", ["flower","bong buddies","kandy shoppe","eluzion","cake house","snickle fritz flower"]),
    ("Concentrates", ["cake icing","sugar","live resin","rosin","cake batter","opal","gems n"]),
    ("Edibles", ["gummi","fruit drops","cbn","candies","chocolates","gummiez","gummy"]),
    ("Beverage", ["hot shotz","sungaze","drink","soda"]),
    ("Topicals", ["balm","body butter","cream","topical"]),
    ("Accessories", ["battery","apparel","shirt","sticker","accessor","merch","pocket panda"]),
]
def infer_top(cat):
    n = (cat or "").lower()
    for label, hints in _CAT_HINTS:
        if any(h in n for h in hints): return label
    return "Other"

def fetch_api():
    print(f"Fetching {API_URL} ...")
    req = urllib.request.Request(API_URL, headers={"User-Agent": "bamboo-closures-cron/2.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
    print(f"  got {len(body):,} bytes")
    return json.loads(body)

def index(api, cli_meta_out):
    cd=api["dimensions"]["clients"]["rows"]; pd=api["dimensions"]["products"]["rows"]
    rd=api["dimensions"]["retail_categories"]["rows"]; reps=api["dimensions"]["reps"]["rows"]
    cps=(api.get("facts") or {}).get("client_product_sales") or {}
    rows=cps.get("row") or []; cols=cps.get("col") or []
    revc=cps.get("revenue_cents") or []; uts=cps.get("units") or []
    los=cps.get("last_ordered_at_utc") or []
    rep_name = lambda i: reps[i][1] if (isinstance(i,int) and 0<=i<len(reps)) else ""
    for r in cd:
        sr = clean_rep(rep_name(r[2]) if len(r)>2 else "")
        vr = clean_rep(rep_name(r[3]) if len(r)>3 else "")
        cli_meta_out[r[1]] = {"sr":sr,"vr":vr}
    out=[]
    for i in range(len(rows)):
        ci=rows[i]; pi=cols[i]; rev=revc[i]
        if rev<=0: continue
        if ci is None or ci>=len(cd) or pi is None or pi>=len(pd): continue
        client=cd[ci][1]
        if is_test_client(client): continue
        product=pd[pi][1]
        if should_drop(product): continue
        gi=pd[pi][3] if len(pd[pi])>3 else None
        cat=rd[gi][1] if (gi is not None and 0<=gi<len(rd)) else ""
        if not cat or should_drop(cat): continue
        out.append((client,product,cat,rev,uts[i] if i<len(uts) else 0,los[i] if i<len(los) else None))
    return out

def compute_closures(baseline_api, curr_api, top_map):
    cli_meta={}
    BASE = index(baseline_api, cli_meta)
    CURR = index(curr_api, cli_meta)
    SKU_BASE=set(); CAT_BASE=set()
    for (c,p,cat,r,u,l) in BASE:
        SKU_BASE.add((c,p)); CAT_BASE.add((c,cat))
    PRIO = set(top_map["priority_categories"])
    TOP_FLAT = set(p for skus in top_map["top_skus_per_category"].values() for p in skus)
    closures=[]; cat_bucket=defaultdict(lambda:{"rev":0,"units":0,"last":None,"skus":[],"sr":"Unassigned","vr":"Unassigned"})
    for (c,p,cat,r,u,l) in CURR:
        if (c,p) in SKU_BASE: continue
        if not l or l[:10] < "2026-06-01": continue
        m = cli_meta.get(c, {"sr":"Unassigned","vr":"Unassigned"})
        if cat in PRIO and p in TOP_FLAT:
            closures.append({"ts":l[:10],"clientName":c,"skuName":p,"category":infer_top(cat),
                             "rev":round(r/100,2),"units":int(u),
                             "sr":m["sr"],"vr":gate_vmi(m["vr"]),
                             "type":"top-sku","skuGroup":cat,"closureKind":"top-sku"})
        else:
            k=(c,cat); d=cat_bucket[k]
            d["rev"]+=r; d["units"]+=u; d["skus"].append(p)
            d["sr"]=m["sr"]; d["vr"]=m["vr"]
            if d["last"] is None or l<d["last"]: d["last"]=l
    # Build set of (store, cat) that already fired a top-sku closure so we
    # don't double-count the "store opened this category" business event.
    top_sku_keys = set()
    for c in closures:
        if c.get("type") == "top-sku":
            top_sku_keys.add((c["clientName"], c["skuGroup"]))
    for (c,cat),d in cat_bucket.items():
        # cat-expansion (store already had this line) is reorder noise — skip.
        if (c,cat) in CAT_BASE:
            continue
        # If the same (store, cat) already fired a top-sku closure, the
        # "new line opened at store" signal is already captured — skip the
        # cat-new too to avoid double-counting the same event.
        if (c,cat) in top_sku_keys:
            continue
        name = d["skus"][0] if len(d["skus"])==1 else f'{len(d["skus"])} new SKU(s) in {cat}'
        closures.append({"ts":d["last"][:10],"clientName":c,"skuName":name,"category":infer_top(cat),
                         "rev":round(d["rev"]/100,2),"units":int(d["units"]),
                         "sr":d["sr"],"vr":gate_vmi(d["vr"]),
                         "type":"cat-new","skuGroup":cat,"closureKind":"cat-new"})
    return closures

def main():
    if not BASELINE_PATH.exists():
        print(f"FATAL: baseline missing at {BASELINE_PATH}"); return 1
    if not TOP_SKUS_PATH.exists():
        print(f"FATAL: top-SKUs map missing at {TOP_SKUS_PATH}"); return 1
    baseline = json.loads(BASELINE_PATH.read_text())
    top_map  = json.loads(TOP_SKUS_PATH.read_text())
    curr = fetch_api()
    closures = compute_closures(baseline, curr, top_map)
    overrides = set()
    if OVERRIDES_PATH.exists():
        try:
            for o in json.loads(OVERRIDES_PATH.read_text()):
                overrides.add((str(o.get("clientName") or "").lower(), str(o.get("skuName") or "").lower()))
        except Exception as e:
            print(f"  warning loading overrides: {e}")
    if overrides:
        before = len(closures)
        closures = [c for c in closures if (c["clientName"].lower(), c["skuName"].lower()) not in overrides]
        if before != len(closures):
            print(f"  suppressed {before-len(closures)} closures via overrides")
    rows = [[c[k] for k in COMPACT_COLS] for c in closures]
    rows.sort(key=lambda r:(r[0], r[1], r[8], r[2]))
    SNAPSHOT_PATH.write_text(json.dumps(curr, separators=(",",":")))
    CLOSURES_PATH.write_text(json.dumps({"cols":COMPACT_COLS,"rows":rows}, separators=(",",":")))
    print(f"wrote {len(rows):,} closures · ${sum(r[4] for r in rows):,.0f}")
    print(f"  snapshot saved to {SNAPSHOT_PATH.relative_to(ROOT)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
