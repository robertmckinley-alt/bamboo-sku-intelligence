#!/usr/bin/env python3
"""
build_penetration_goals.py
==========================
Builds data/penetration_goals.json — a global mapping of {sku_group_id: goal}.

Source of truth: the "Categories with distribution goal" Google Sheet.
Goals here are the *decimal* form of penetration goal (0.0 - 1.0).

Naming reconciliation:
  • Goal-sheet rows end with a count e.g. "Core Flower 293" — that trailing
    number is the SKU count inside the group, NOT part of the group name.
    We strip it before matching.
  • The sheet uses curly apostrophes (Dabstract Gems n' Juice) — the dataset
    uses straight apostrophes. Normalize both.
  • The sheet may have asterisks around "LIMITED TIME" — strip.
  • Explicit alias: the sheet calls them "Panda Pens" but the dataset's
    group is "Panda Pen 510" (the 510-thread cart line).

Re-run this script whenever the goal sheet changes:
    python3 scripts/build_penetration_goals.py
"""
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

# --- Edit this list when the goal sheet changes ---------------------
# Pulled from "Categories with distribution goal" sheet.
GOALS = [
    ("Core Flower 293", 0.90),
    ("Panda Pens 45", 0.95),
    ("Platinum Flower 135", 0.90),
    ("Dabstract AIO 117", 0.90),
    ("Dabstract Live Resin 1g C-Cell Cartridges 131", 0.90),
    ("Snickle Fritz Cartridges 21", 0.85),
    ("1g Core Prerolls 91", 0.95),
    ("Panda Pen AIO 45", 0.85),
    ("Live Resin Gummiez 14", 0.80),
    ("Firecracker 1g Infused Joints 24", 0.95),
    ("Snickle Fritz Cartridges - 3pk 9", 0.75),
    ("Snickle Fritz Flower 104", 0.65),
    ("1g Platinum Prerolls 33", 0.95),
    ("Bong Buddies - Core 88", 0.80),
    ("28g Preroll Pack 62", 0.60),
    ("Dabstract Cake Icing 71", 0.80),
    ("Sparklers 2pk 0.5g Infused 20", 0.80),
    ("Bong Buddies - 14g 61", 0.50),
    ("Bangers 10pk 0.5g Prerolls 45", 0.76),
    ("Bong Buddies - Platinum 33", 0.80),
    ("Gummy Fruit Drops 5", 0.80),
    ("Panda Candies 8", 0.90),
    ("Dabstract Sugar 53", 0.80),
    ("Live Resin Chocolates 4", 0.60),
    ("Snickle Fritz Sugar 61", 0.75),
    ("Panda Cake Batter 35", 0.80),
    ("Panda High Terpene Sugar 52", 0.80),
    ("Hot Shotz - Energy 4", 0.60),
    ("Dabstract Infused Prerolls 32", 0.60),
    ("Bangers 5pk 1g Prerolls 23", 0.90),
    ("Hot Shotz - THC 3", 0.60),
    ("3pk Firecracker Cones Joint Tins 12", 0.50),
    ("CBN/THC 1:1 Gummiez 1", 0.85),
    ("Snickle Fritz AIO 8", 0.60),
    ("Panda Candies - SOUR 4", 0.80),
    ("Snickle Fritz Icing 31", 0.70),
    ("Panda Pens - 3pk 5", 0.80),
    ("Gummy Fruit Drops - SOUR 3", 0.50),
    ("Gummy Fruit Drops - Solventless - Ratio 3", 0.70),
    ("Juice Box - Strain Specific 19", 0.50),
    ("Dabstract Gems n’ Juice 24", 0.80),
    ("Gummy Fruit Drops 1:1 CBD 4", 0.50),
    ("Snickle Fritz 28g Bong Buddies LIMITED TIME 11", 0.20),
    ("Panda Pens CBD 1:1 3", 0.50),
    ("Kandy Shoppe 7g Bong Buddies 10", 0.10),
    ("Dabstract Opal Sugar 23", 0.70),
    ("Bangers 2pk 0.5g Prerolls 22", 0.10),
    ("Panda Rosin 16", 0.50),
    ("Gummy Fruit Drops - Solventless 3", 0.70),
    ("Hot Shotz - 1:1 THC/CBD 1", 0.60),
    ("Hot Shotz - CBN 1", 0.60),
    ("Bubble Hash Bangers 1g 11", 0.50),
    ("10g Mega Rolls 33", 0.50),
    ("Hot Shotz - CBG 1", 0.60),
    ("Live Resin Soft Caramels 4", 0.20),
    ("3.5g Huxton Multi Pack 3", 0.20),
    ("Kandy Shoppe Flower 15", 0.10),
    ("Cake House Flower 21", 0.10),
    ("ELUZION Flower 18", 0.10),
    ("Panda Balm 1", 0.40),
    ("Panda Candies 1:1 CBD 2", 0.50),
    ("Topical Creams 1", 0.40),
]

# Normalized-name aliases: goal-sheet name (after norm) -> dataset name (after norm)
ALIASES = {
    "panda pens": "panda pen",  # sheet:"Panda Pens" -> dataset:"Panda Pen 510"
}


def norm(s: str) -> str:
    """Normalize a SKU group name for matching."""
    s = unicodedata.normalize("NFKD", s)
    s = s.replace("’", "'").replace("‘", "'")  # curly -> straight
    s = s.replace("*", "")
    s = re.sub(r"\s+\d+\s*$", "", s).strip()  # strip trailing count
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def main():
    ds_path = os.path.join(DATA, "dataset.json")
    with open(ds_path) as f:
        ds = json.load(f)

    sku_by_norm = {norm(s["n"]): s for s in ds["skus"]}

    out = {}
    unmatched = []
    for name, val in GOALS:
        k = norm(name)
        k = ALIASES.get(k, k)
        if k in sku_by_norm:
            out[str(sku_by_norm[k]["i"])] = float(val)
        else:
            unmatched.append(name)

    if unmatched:
        print("WARN: unmatched goal-sheet rows:")
        for u in unmatched:
            print("  -", u)

    out_path = os.path.join(DATA, "penetration_goals.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2, sort_keys=True)

    print(f"Wrote {out_path}: {len(out)} / {len(GOALS)} SKU groups mapped")
    return 0 if not unmatched else 1


if __name__ == "__main__":
    sys.exit(main())
