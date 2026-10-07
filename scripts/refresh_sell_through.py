#!/usr/bin/env python3
"""Build the 12-week allocation sell-through dataset used by the dashboard.

The Bamboo endpoint returns completed Sunday-Saturday allocation periods. This
job runs on Monday, normalizes the response, removes samples/non-merchandise,
and writes an auditable product-level history plus conservative action signals.
"""

from __future__ import annotations

import json
import math
import re
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path


API_URL = "https://api-intelligence.getbamboo.com/api/reports/allocation-sell-through?limit=12"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "allocation_sell_through.json"

TRADE_SAMPLE_RE = re.compile(r"trade\s*sample|(^|[^A-Za-z0-9])TS([^A-Za-z0-9]|$)", re.I)


def number(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def percentile(values, pct):
    ordered = sorted(number(value) for value in values)
    if not ordered:
        return 0.0
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * pct
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def is_trade_sample(product):
    haystack = " | ".join(
        str(product.get(key) or "")
        for key in ("product_name", "category_name")
    )
    return bool(TRADE_SAMPLE_RE.search(haystack))


def is_non_merchandise(product):
    brand = str(product.get("brand_name") or "").lower()
    category = str(product.get("category_name") or "").lower()
    return brand.startswith("non marijuana products") or "accessories & merch" in category


def weighted_sell_through(rows):
    allocated = sum(row["allocated_units"] for row in rows)
    sold = sum(row["sold_units"] for row in rows)
    return sold / allocated if allocated else 0.0


def classify(rows, weeks_available, median_allocated, soldout_weeks, near_sellout_weeks, recent_rows=None):
    recent = rows[-4:] if recent_rows is None else recent_rows
    recent_sellout = sum(row["is_sellout"] for row in recent)
    recent_near = sum(row["is_near_sellout"] for row in recent)
    recent_st = weighted_sell_through(recent)
    overall_st = weighted_sell_through(rows)
    sellout_rate = soldout_weeks / weeks_available if weeks_available else 0.0

    if weeks_available < 4 or median_allocated < 25:
        return "Limited history", 0, "Hold", "Not enough comparable volume for a change."
    if soldout_weeks >= 3 and sellout_rate >= 0.5 and overall_st >= 0.85 and recent_st >= 0.85:
        return "Chronic sellout", 30, "Test +2-5% after volume", "Repeated exact sellouts indicate censored demand."
    if soldout_weeks >= 3 and overall_st >= 0.75 and recent_st >= 0.75:
        return "Recurring sellout", 20, "Test +2-5% after volume", "The product sold through its full allocation in at least three weeks."
    if soldout_weeks >= 3:
        return "Volatile allocation", 0, "Hold", "Exact sellouts occurred, but larger allocations sold through inconsistently."
    if near_sellout_weeks >= math.ceil(weeks_available / 2) and overall_st >= 0.9:
        return "Consistent fast mover", 10, "Hold; test only if constrained", "At least half of available weeks reached 90% sell-through."
    if len(recent) >= 2 and recent_sellout >= 1 and recent_near >= 2 and recent_st >= 0.75:
        return "Emerging shortage", 10, "Hold", "Two recent weeks reached 90%, including one exact sellout."
    if len(recent) >= 3 and recent_st < 0.5:
        return "Slow mover", -10, "Do not raise", "Recent weighted sell-through is below 50%."
    if 0.7 <= recent_st < 0.9:
        return "Balanced", 0, "Hold", "Recent sell-through is within the 70%-90% operating band."
    return "Watch", 0, "Hold", "No repeat shortage or sustained slow-mover signal."


def build_dataset(api):
    allocations = sorted(api.get("allocations", []), key=lambda row: row.get("period_from", ""))
    week_index = {}
    histories = defaultdict(list)
    excluded = {"zero_or_unlimited": 0, "trade_samples": 0, "non_merchandise": 0}

    for allocation in allocations:
        week = {
            "id": allocation.get("inventory_allocation_id"),
            "name": allocation.get("name"),
            "period_from": allocation.get("period_from"),
            "period_to": allocation.get("period_to"),
            "updated_at": allocation.get("updated_at"),
            "allocated_units": int(number(allocation.get("allocated_units"))),
            "sold_units": int(number(allocation.get("sold_units"))),
            "unsold_units": int(number(allocation.get("unsold_units"))),
            "sell_through": round(number(allocation.get("sell_through")), 4),
            "sold_revenue": round(number(allocation.get("sold_revenue")), 2),
            "product_count": int(number(allocation.get("product_count"))),
            "exact_sellouts": 0,
            "near_sellouts": 0,
        }
        week_index[week["id"]] = week

        for product in allocation.get("products", []):
            allocated = int(number(product.get("allocated_units")))
            if allocated <= 0 or product.get("unlimited"):
                excluded["zero_or_unlimited"] += 1
                continue
            if is_trade_sample(product):
                excluded["trade_samples"] += 1
                continue
            if is_non_merchandise(product):
                excluded["non_merchandise"] += 1
                continue

            sold = int(number(product.get("sold_units")))
            unsold = int(number(product.get("unsold_units")))
            sell_through = number(product.get("sell_through"), sold / allocated if allocated else 0)
            row = {
                "week_id": week["id"],
                "period_from": week["period_from"],
                "period_to": week["period_to"],
                "allocated_units": allocated,
                "sold_units": sold,
                "unsold_units": unsold,
                "sell_through": round(sell_through, 4),
                "sold_revenue": round(number(product.get("sold_revenue")), 2),
                "order_count": int(number(product.get("order_count"))),
                "is_sellout": bool(unsold == 0 and sold > 0),
                "is_near_sellout": bool(sell_through >= 0.9),
            }
            histories[product.get("product_id")].append(
                {
                    **row,
                    "product_name": product.get("product_name") or "Unknown product",
                    "brand_name": product.get("brand_name") or "Unknown brand",
                    "category_name": product.get("category_name") or "Uncategorized",
                    "package_type": product.get("package_type") or "",
                    "net_weight": number(product.get("net_weight")),
                    "uom": product.get("uom") or "",
                }
            )
            if row["is_sellout"]:
                week["exact_sellouts"] += 1
            if row["is_near_sellout"]:
                week["near_sellouts"] += 1

    products = []
    recent_week_ids = {week.get("inventory_allocation_id") for week in allocations[-4:]}
    prior_week_ids = {week.get("inventory_allocation_id") for week in allocations[-8:-4]}
    for product_id, source_rows in histories.items():
        source_rows.sort(key=lambda row: row["period_from"])
        first = source_rows[-1]
        weeks_available = len(source_rows)
        soldout_weeks = sum(row["is_sellout"] for row in source_rows)
        near_sellout_weeks = sum(row["is_near_sellout"] for row in source_rows)
        total_allocated = sum(row["allocated_units"] for row in source_rows)
        total_sold = sum(row["sold_units"] for row in source_rows)
        total_unsold = sum(row["unsold_units"] for row in source_rows)
        total_revenue = sum(row["sold_revenue"] for row in source_rows)
        total_orders = sum(row["order_count"] for row in source_rows)
        allocations_for_median = [row["allocated_units"] for row in source_rows]
        sold_for_stats = [row["sold_units"] for row in source_rows]
        median_allocated = statistics.median(allocations_for_median)
        recent_rows = [row for row in source_rows if row["week_id"] in recent_week_ids]
        prior_rows = [row for row in source_rows if row["week_id"] in prior_week_ids]
        recent_allocated = statistics.median(row["allocated_units"] for row in recent_rows) if recent_rows else median_allocated
        recent_avg_sold = statistics.mean(row["sold_units"] for row in recent_rows) if recent_rows else 0
        prior_avg_sold = statistics.mean(row["sold_units"] for row in prior_rows) if prior_rows else None
        trend_pct = None
        if prior_avg_sold and prior_avg_sold > 0:
            trend_pct = (recent_avg_sold - prior_avg_sold) / prior_avg_sold

        signal, adjustment, price_signal, rationale = classify(
            source_rows, weeks_available, median_allocated, soldout_weeks, near_sellout_weeks, recent_rows
        )
        recommended_allocation = max(0, math.ceil(recent_allocated * (1 + adjustment / 100)))

        compact_history = [
            [
                row["week_id"],
                row["allocated_units"],
                row["sold_units"],
                row["unsold_units"],
                row["sell_through"],
                row["sold_revenue"],
                row["order_count"],
            ]
            for row in source_rows
        ]

        products.append(
            {
                "product_id": product_id,
                "product_name": first["product_name"],
                "brand_name": first["brand_name"],
                "category_name": first["category_name"],
                "package_type": first["package_type"],
                "net_weight": first["net_weight"],
                "uom": first["uom"],
                "weeks_available": weeks_available,
                "soldout_weeks": soldout_weeks,
                "near_sellout_weeks": near_sellout_weeks,
                "sellout_rate": round(soldout_weeks / weeks_available, 4),
                "weighted_sell_through": round(total_sold / total_allocated, 4) if total_allocated else 0,
                "recent_4_week_sell_through": round(weighted_sell_through(recent_rows), 4),
                "total_allocated_units": total_allocated,
                "total_sold_units": total_sold,
                "total_unsold_units": total_unsold,
                "total_sold_revenue": round(total_revenue, 2),
                "total_order_count": total_orders,
                "median_weekly_allocated": round(median_allocated, 1),
                "median_weekly_sold": round(statistics.median(sold_for_stats), 1),
                "p75_weekly_sold": round(percentile(sold_for_stats, 0.75), 1),
                "average_weekly_sold": round(statistics.mean(sold_for_stats), 1),
                "realized_revenue_per_unit": round(total_revenue / total_sold, 2) if total_sold else 0,
                "recent_units_trend_pct": round(trend_pct, 4) if trend_pct is not None else None,
                "signal": signal,
                "volume_adjustment_pct": adjustment,
                "recommended_weekly_allocation": recommended_allocation,
                "price_signal": price_signal,
                "rationale": rationale,
                "history": compact_history,
            }
        )

    signal_order = {
        "Chronic sellout": 0,
        "Recurring sellout": 1,
        "Consistent fast mover": 2,
        "Emerging shortage": 3,
        "Balanced": 4,
        "Volatile allocation": 5,
        "Watch": 6,
        "Slow mover": 7,
        "Limited history": 8,
    }
    products.sort(
        key=lambda row: (
            signal_order.get(row["signal"], 99),
            -row["soldout_weeks"],
            -row["near_sellout_weeks"],
            -row["total_sold_units"],
        )
    )

    recurring_count = sum(row["soldout_weeks"] >= 3 for row in products)
    chronic_count = sum(row["signal"] == "Chronic sellout" for row in products)
    fast_count = sum(row["signal"] in {"Consistent fast mover", "Emerging shortage"} for row in products)
    slow_count = sum(row["signal"] == "Slow mover" for row in products)

    return {
        "schema_version": "2026-10-07-a",
        "source": {
            "url": API_URL,
            "generated_at": api.get("generated_at"),
            "state_code": api.get("state_code"),
            "timezone": allocations[-1].get("timezone") if allocations else "America/Los_Angeles",
            "sold_order_statuses": api.get("sold_order_statuses", []),
            "data_status": "Historical completed weekly allocations",
            "period_note": "Source periods run Sunday through Saturday. The refresh runs Monday after the prior period closes.",
        },
        "criteria": {
            "exact_sellout": "Allocated units > 0, sold units > 0, and unsold units = 0.",
            "near_sellout": "Sell-through >= 90%.",
            "recurring_sellout": "Exact sellout in at least 3 available weeks.",
            "minimum_history_weeks": 4,
            "minimum_median_weekly_allocation": 25,
            "excluded": "Unlimited/zero allocations, trade samples, and non-marijuana merchandise.",
        },
        "history_columns": [
            "week_id",
            "allocated_units",
            "sold_units",
            "unsold_units",
            "sell_through",
            "sold_revenue",
            "order_count",
        ],
        "summary": {
            "week_count": len(allocations),
            "period_from": allocations[0].get("period_from") if allocations else None,
            "period_to": allocations[-1].get("period_to") if allocations else None,
            "product_count": len(products),
            "recurring_sellout_count": recurring_count,
            "chronic_sellout_count": chronic_count,
            "fast_mover_count": fast_count,
            "slow_mover_count": slow_count,
            "excluded_rows": excluded,
        },
        "weeks": list(week_index.values()),
        "products": products,
    }


def fetch_api():
    request = urllib.request.Request(API_URL, headers={"User-Agent": "bamboo-sku-intelligence/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def main():
    dataset = build_dataset(fetch_api())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(dataset, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    summary = dataset["summary"]
    print(
        f"Wrote {OUTPUT}: {summary['week_count']} weeks, {summary['product_count']} products, "
        f"{summary['recurring_sellout_count']} recurring sellouts"
    )


if __name__ == "__main__":
    main()
