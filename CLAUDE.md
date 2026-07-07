# Bamboo SKU Intelligence — Project Context

This file is the durable handoff for any future Claude session working on the
Bamboo SKU Intelligence dashboard and the Bamboo Closures League. Treat
everything below as authoritative project state unless the user explicitly
overrides it. This repo copy is canonical; it supersedes the CLAUDE.md Google
Doc in Drive (last updated 2026-06-08).

Owner: Rob (robertmckinley@gmail.com / robertmckinley-alt on GitHub)
Last meaningful update: 2026-07-07

---

## 1. The two apps

| App | Repo | Live URL | Purpose |
| --- | --- | --- | --- |
| Bamboo SKU Intelligence (parent) | robertmckinley-alt/bamboo-sku-intelligence | https://bamboo-sku-intelligence.vercel.app/ | Main dashboard — SKU Engine, Retailers, Distribution Matrix, Categories, Top SKUs, Reps, Closures, Buckets, How to Use. |
| Bamboo Closures League | robertmckinley-alt/closuresleague | https://closuresleague.vercel.app/ | Gamified leaderboard view of the closures ledger. Reads data/closures.json mirrored from the parent every 5 minutes. |

Both deploy on Vercel on push to main. Both are single-page React apps built
with babel-standalone (no build step) — JSX files load directly via
`<script type="text/babel">`.

**Cache busting**: index.html carries `window.__BAMBOO_BUILD` plus `?v=` stamps
on every `<script>` tag. **Bump the stamp whenever a .jsx file changes** —
returning browsers otherwise keep running cached JSX.

**Vercel middleware password gate**: parent gates the site behind a password +
signed cookie (168h TTL). Password lives in Vercel env vars, never in the repo.

## 2. Auth for pushing

- **From Rob's Windows machine** (primary as of 2026-07): local clone at
  `C:\Users\mrjoe\Downloads\bamboo-sku-intelligence`; plain
  `git push origin main` works via stored HTTPS credentials. Pushing to main
  deploys the live site — confirm with Rob before pushing.
- **From the old Cowork sandbox** (historical): SSH deploy key at
  `~/.ssh/id_ed25519` with socat proxy plumbing; the league repo needed a
  one-time PAT (treat that PAT as compromised). See the 2026-06-08 Drive doc
  if that environment ever comes back.

## 3. The Closures spec — v2026-06-08-d

**This is the rule the user cares most about.** Don't change it without
explicit confirmation. Documented in data/tracker_meta.json.

### Definition
"New business in an existing store." Each closure is either a priority SKU
first ordered at a store ("top-sku") or a retail-category line first opened at
a store ("cat-new").

### Baseline
data/baseline_5_31_snapshot.json (6.1 MB, frozen) — the 5/31 EOD API snapshot.
Builds two reference sets:
- SKU_BASELINE = (clientName, skuName) pairs with rev > 0 in 1/1–5/31
- CAT_BASELINE = (clientName, retail_category) pairs with rev > 0 in 1/1–5/31

### Priority categories + top-SKUs
data/top_skus_per_priority_category.json:
- priority_categories: top 20 non-Dabstract retail_categories by YTD revenue
- top_skus_per_category: top 10 SKUs each (or ALL if ≤10). 193 SKUs flagged.
- Refresh by hand when rankings shift; the cron picks it up next run.

Dabstract retail-categories are excluded by name from the priority set — they
never get SKU-level tracking (they rotate SKUs weekly; SKU-level would
over-count).

### Closure detection (per (store, SKU) in latest API snapshot)
1. Skip if (store, SKU) in SKU_BASELINE (re-order, not new)
2. Skip if last_ordered_at_utc < 2026-06-01 (pre-ledger)
3. If retail_category in PRIORITY and SKU in its top-10 → emit "top-sku"
4. Else roll up to (store, retail_category) bucket
5. Per bucket: skip if (store, cat) in CAT_BASELINE (cat-expansion — never
   reported); skip if that (store, cat) already fired a top-sku (no double
   count); else emit "cat-new" (revenue = sum of new non-top SKUs in bucket)

### Output: data/closures.json
Compact {cols, rows}. Cols:
['ts','clientName','skuName','category','rev','units','sr','vr','type','skuGroup','closureKind']
type/closureKind are "top-sku" or "cat-new". No cat-expansion in the file.

The `category` column is a high-level bucket from `_CAT_HINTS` in the cron —
kept mirrored with `inferTopCategory()` in apiAdapter.jsx (PICC → Prerolls,
Vape Carry Case → Accessories as of 2026-07-07).

### Numbers as of 2026-07-07
4,413 closures total — 3,038 top-sku + 1,375 cat-new — ≈$645K revenue.

## 4. Daily cron — scripts/refresh_closures.py

Runs 14:00 UTC daily (GitHub Actions, .github/workflows/daily-closures.yml).
Each run: pulls the API (**NO ?from= query — see §7**; a pinned
?from=2026-05-28 regression survived in this script until 178f0e9 on
2026-07-07), writes data/api-snapshot.json locally, recomputes closures from
scratch, commits data/closures.json if changed. Idempotent.

**Note**: the workflow deliberately does NOT commit api-snapshot.json anymore
(6.5 MB/day repo bloat). The checked-in copy is stale — for current SKU-group
names, hit the live API, not that file (and not dataset.json, which is a
static fallback that's also stale).

## 5. League sync
League pulls the parent's data/closures.json every 5 min and re-renders it
verbatim (no revalidation). To force a sync, push the parent's closures.json
into the league with a sync: commit.

## 6. VMI rep gate

Roster is exactly three, matched case-insensitively at name start:
`/^josh\s+novak\b/i`, `/^koen\b/i`, `/^curtis\b/i`. Everyone else collapses to
'Unassigned'. Centralized in apiAdapter.jsx normVmi(); mirrored in
closures.jsx and the cron's gate_vmi.

VMI-mode dropdowns and per-rep cards suppress 'Unassigned' **everywhere** —
the last four stragglers (rail leaderboard, Top SKUs dropdown, SKU drawer
dropdown, missing-products drawer) were fixed 2026-07-07. Sales mode
(repType === 'sr') is unaffected.

## 7. The Bamboo API — quirks

URL: https://api-intelligence.getbamboo.com/api/reports

**DO NOT pin a ?from=YYYY-MM-DD query param.** The API honors it and restricts
the response to stores with activity since that date — silently dropping ~115
inactive stores from every count. Broke retailer counts (421 → 306) once;
reverted in bb29086 (adapter, 2026-06-08) and again in 178f0e9 (cron,
2026-07-07). The closures logic filters to 6/1+ itself via
last_ordered_at_utc, so the unconstrained pull is numbers-identical there.

facts.client_product_sales carries last_ordered_at_utc per (store, product);
the fact only exists from 2026-05-27 21:15 UTC onward.

## 8. Brand-hide pills

Parent URL params: ?hideMB=true, ?hideSG=true, ?hidePICC=true. Patterns:
`micro bar`, `sungaze`, `picc` (substring on SKU-group name, applied in
buildAnalytics before any downstream stat). League has its own equivalents.

Since 2026-07-07 the pills also correctly drop stores whose only business is
the hidden brand (cl.active is computed from the filtered matrix when a pill
is on — cl.rev is whole-order revenue and can't detect that).

**Known limitation (deliberate)**: per-retailer revenue figures still include
hidden-brand dollars because retailer revenue comes from whole-order
client_rep_sales, which can't be split by brand. KPI totals ARE filtered, so
the two can disagree slightly while a pill is active. Rob knows; don't
"fix" without asking.

## 9. Category (bucket) logic

`inferTopCategory()` in apiAdapter.jsx assigns each SKU group a high-level
category by keyword, with explicit multi-word overrides BEFORE the generic
keywords. Current explicit rules include: Bong Buddies → Flower, Hot Shotz →
Beverage, Panda Pen/Juice Box/Micro Bar → Vapes, Sungaze → Beverage,
Mega Rolls/Huxton/Bangers → Prerolls, Macro Bar/Panda Battery/Pocket Panda →
Accessories, **all PICC → Prerolls** and **Vape Carry Case → Accessories**
(Johnny, 7/1, shipped b0d737b).

The cron's `_CAT_HINTS` is a separate copy of this logic for closures.json's
category column — **keep the two in sync when adding rules**.
data/category_overrides.json is a third, name-keyed override map applied in
bcore.jsx (currently 3 legacy preroll entries, all redundant with adapter
rules).

## 10. Penetration goals

- File: data/penetration_goals.json — keyed by **normalized SKU-group NAME**
  (lowercase, trailing count stripped, apostrophes normalized, asterisks
  dropped — see normName() in bcore.jsx). NOT ID-keyed: the API assigns IDs
  dynamically.
- **Source of truth**: the "category goals" tab of the "Q3 2026 GOF Plan"
  workbook in Drive — Column I = Company goal %. Owner of the numbers:
  Johnny Wilson (jpw2@growopfarms.com).
- **Blue font rows in that sheet = no goal assigned** — leave them OUT of the
  json (UI shows "—/No goal set"). As of 2026-07-07 that's Micro Bar,
  Sungaze, and Panda Pen AIO CBD 1:1. (Heads-up: the Micro Bar AIO rows say
  "95" in Column I, not ".95" — typo to resolve if Johnny assigns them.)
- **PICC = 0.5 for all groups** (Johnny 2026-07-02 correction; the sheet still
  shows his 0.4 typo).
- scripts/build_penetration_goals.py mirrors the sheet in its GOALS list and
  emits name keys. dataset.json is stale, so its "not in dataset" warnings on
  PICC rows are expected.

## 11. Closures page UI

Chips: All | Top SKU (top-sku) | New Category (cat-new) — nothing else; any
Group/Product/Cat Expansion chip in code is stale. Date chips: This Week
(default, Mon–Sun UTC) | Last Week | 30d | 90d | MTD | QTD | YTD | All |
Custom, all clamped to DATA_START (2026-06-01) with an amber hint when
clamped. Table caps at 1,500 rendered rows; CSV exports everything.

## 12. The data/ files

| File | Updated by | Purpose |
| --- | --- | --- |
| baseline_5_31_snapshot.json | frozen | 5/31 EOD baseline for closure diffs |
| api-snapshot.json | cron (local only, NOT committed — stale in repo) | most recent live pull |
| closures.json | daily cron | the ledger, rebuilt each run |
| top_skus_per_priority_category.json | by hand | 20 priority cats + top-10s |
| tracker_meta.json | by hand | spec version (2026-06-08-d) |
| closure-overrides.json | by hand | (clientName, skuName) pairs to suppress |
| category_overrides.json | by hand | manual category remaps (legacy) |
| penetration_goals.json | by hand | name-keyed goals (see §10) |
| dataset.json | stale | static fallback if the live API fails |

## 13. Decisions log (so we don't relitigate)

- **Baseline = 5/31, ledger starts 6/1**: client_product_sales fact only
  exists from 5/27; 5/31 was the first snapshot with settled per-SKU history;
  6/1 gives a clean month-start ledger.
- **Dabstract bucketed at category level**: weekly SKU rotation would
  over-count SKU-level closures.
- **Cat-expansion dropped; cat-new suppressed when the same (store,cat) fired
  a top-sku**: avoids reorder noise and double-counting. Confirmed 2026-06-08.
- **2026-07-07 (b0d737b)**: PICC (all groups, infused + non-infused) →
  Prerolls; Vape Carry Case → Accessories; PICC goals added at 0.5 (Johnny's
  7/2 correction — his sheet's 0.4 was a typo); blue goal-sheet rows have no
  goal by design.
- **2026-07-07 (178f0e9)**: cleanup pass — cron ?from pin removed (regression,
  see §7); call-sheet export now honors the SKU selection passed from the SKU
  and Retailer drawers (focusSkuIds); hide pills now drop hidden-brand-only
  stores; VMI Unassigned suppression completed; closure-type tooltips aligned
  to spec wording; __BAMBOO_BUILD must be bumped with any JSX change.
- **Retailer revenue under hide pills includes hidden-brand $** — known,
  deliberate (see §8). Don't change without Rob.

## 14. If the user opens with something vague

- "closures aren't updating" → check the Actions run, then §4/§7.
- "dashboard is missing stores" → look for a ?from= regression (adapter AND
  cron).
- "change the team goal" → league repo, core.jsx WEEKLY_TEAM_GOAL ($100,000
  as of 2026-06-08).
- "goal/category updates from Johnny" → §9/§10; his numbers come from the
  Q3 plan workbook's "category goals" tab, Column I; blue = no goal.
- "VMI mode shows the wrong people" → §6 roster; ask before adding names.

If you update this file, bump "Last meaningful update" and add a §13 entry for
anything worth not relitigating.
