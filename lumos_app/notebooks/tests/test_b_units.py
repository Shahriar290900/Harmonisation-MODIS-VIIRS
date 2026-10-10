#!/usr/bin/env python3
"""Unit tests for Notebook B watchdog/robustness helpers (no full training run).

* depth-limited search: bundle found at depth ≤ limit, NOT found deeper; early stop.
* LLM discovery: size cap min(30 GB, 0.5 × free RAM) → oversized (sparse) checkpoint skipped and reported; small one chosen.
* XGBoost wall-clock callback stops boosting at the deadline and keeps a usable best_iteration.
* offline pip: resolver failure → `--no-deps` fallback (tiny local wheel with an unresolvable dependency).
Usage: LUMOS_INPUT=<fixture out> LUMOS_WORK=<scratch> python test_b_units.py
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LUMOS_AUTO_RESUME", "0")
os.environ.setdefault("LUMOS_QUICK", "1")
from _exec_upto import exec_upto, SRC  # noqa: E402

FAILS = []
def check(c, m):
    print(("  PASS " if c else "  FAIL ") + m, flush=True)
    if not c: FAILS.append(m)

ns = exec_upto("INGEST (contract")
tmp = Path(tempfile.mkdtemp(prefix="lumosB_units_"))

print("== depth-limited bundle search ==")
shallow = tmp / "in1" / "a" / "b" / "lumos_bundle" / "manifests"; shallow.mkdir(parents=True); (shallow / "sources.json").write_text("[]")
deep = tmp / "in2" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9" / "lumos_bundle" / "manifests"; deep.mkdir(parents=True); (deep / "sources.json").write_text("[]")
check(ns["locate_bundle"](tmp / "in1") == shallow.parent, "bundle at depth 3 found")
try:
    ns["locate_bundle"](tmp / "in2"); check(False, "bundle at depth 11 must not be found")
except FileNotFoundError:
    check(True, "bundle deeper than the limit is not searched (FileNotFoundError)")
many = tmp / "in3"
for i in range(50): (many / f"d{i}").mkdir(parents=True); (many / f"d{i}" / "config.json").write_text("{}")
hits = list(ns["walk_limited"](many, lambda d, fs: [d] if "config.json" in fs else [], stop_after=5))
check(len(hits) == 5, "walk_limited stops early after stop_after hits")

print("== LLM discovery with size cap ==")
text = open(SRC, encoding="utf-8").read()
i, j = text.index("def _weights_size("), text.index("def make_llm_generate(")
exec(compile(text[i:j], SRC, "exec"), ns)
root = tmp / "models"
for name, size in [("Qwen2.5-7B-Instruct", 40 * 10**9), ("qwen2.5-0.5b-instruct", 10**6)]:
    d = root / name; d.mkdir(parents=True)
    (d / "config.json").write_text(json.dumps({"architectures": ["Qwen2ForCausalLM"], "model_type": "qwen2"}))
    (d / "tokenizer.json").write_text("{}")
    with open(d / "model.safetensors", "wb") as f: f.truncate(size)     # sparse file: no real disk use
found, rep = ns["find_local_llm"](root)
check(found and found.endswith("qwen2.5-0.5b-instruct"), f"small instruct model chosen: {found}")
check(rep["size_cap_gb"] <= 30 and any("7B" in x["dir"] for x in rep["too_large"]), f"40 GB checkpoint rejected by cap {rep['size_cap_gb']} GB: {rep['too_large']}")
cap, _ = ns["llm_size_cap"]()
check(cap <= min(30e9, 0.5 * ns["free_ram_gb"]() * 1e9) + 1, f"cap = min(30 GB, 0.5×free RAM) = {cap / 1e9:.2f} GB")

print("== XGBoost wall-clock callback ==")
import numpy as np, xgboost as xgb
i, j = text.index("            class WallClock("), text.index("            def make_dm(")
src = "\n".join(l[12:] for l in text[i:j].split("\n"))
ns["xgb"] = xgb
exec(compile(src, SRC, "exec"), ns)
rng = np.random.default_rng(0); X = rng.random((20000, 10)); y = rng.poisson(np.exp(X[:, 0]))
d = xgb.DMatrix(X, label=y)
cb = ns["WallClock"](time.time() + 1.0)
t0 = time.time()
bst = xgb.train({"objective": "count:poisson", "tree_method": "hist", "max_depth": 8, "eta": 0.01}, d, num_boost_round=100000,
                evals=[(d, "val")], early_stopping_rounds=100000, verbose_eval=False, callbacks=[cb])
check(cb.stopped_early and time.time() - t0 < 5 and bst.num_boosted_rounds() < 100000,
      f"stopped after {time.time() - t0:.1f}s at {bst.num_boosted_rounds()} rounds; best_iteration={bst.best_iteration}")

print("== offline pip --no-deps fallback ==")
wh = tmp / "bundle" / "wheelhouse"; wh.mkdir(parents=True)
whl = wh / "lumos_fake_pkg-0.1-py3-none-any.whl"
with zipfile.ZipFile(whl, "w") as z:
    z.writestr("lumos_fake_pkg/__init__.py", "X = 1\n")
    z.writestr("lumos_fake_pkg-0.1.dist-info/METADATA", "Metadata-Version: 2.1\nName: lumos-fake-pkg\nVersion: 0.1\nRequires-Dist: lumos-nonexistent-dep>=1\n")
    z.writestr("lumos_fake_pkg-0.1.dist-info/WHEEL", "Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\nTag: py3-none-any\n")
    z.writestr("lumos_fake_pkg-0.1.dist-info/RECORD", "")
ns["BUNDLE"] = tmp / "bundle"
res = ns["try_offline_install"](("lumos-fake-pkg",))
check(str(res.get("lumos-fake-pkg", "")).startswith("installed --no-deps"), f"resolver failure → --no-deps fallback: {res.get('lumos-fake-pkg')}")
subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "lumos-fake-pkg"], capture_output=True)

print("== three-region config (v1.2 addendum, CONTRACT §8-9) ==")
check(ns["AOI_COUNTRIES"] == ["Bangladesh", "Australia", "United_States"], f"AOI_COUNTRIES (FIRMS slugs): {ns['AOI_COUNTRIES']}")
check(ns["COUNTRY_ISO3"]["United_States"] == "USA" and ns["COUNTRY_ISO3"]["Bangladesh"] == "BGD" and ns["COUNTRY_ISO3"]["Australia"] == "AUS",
      "COUNTRY_ISO3: Bangladesh→BGD, Australia→AUS, United_States→USA")
check(ns["AOI_ADMIN1"] == {"Australia": ["AU-NSW"], "United_States": ["US-CA"]}, f"AOI_ADMIN1 (NE iso_3166_2): {ns['AOI_ADMIN1']}")
check(ns["EXPECTED_ADMIN1"]["United_States"] == ["US-CA"] and ns["ADMIN1_DISPLAY"]["US-CA"] == "California", "EXPECTED_ADMIN1 / ADMIN1_DISPLAY: US-CA = California")
check(set(ns["FEATURE_EXPORT_AOIS"]) == {"BGD", "AUS-NSW", "USA-CA"}, f"FEATURE_EXPORT_AOIS = {ns['FEATURE_EXPORT_AOIS']}")
check(set(ns["CELLS_EXPORT_SKIP_AOIS"]) == {"AUS", "USA"}, f"CELLS_EXPORT_SKIP_AOIS = {ns['CELLS_EXPORT_SKIP_AOIS']}")
check(ns["country_display"]("United_States") == "United States" and ns["country_display"]("Bangladesh") == "Bangladesh", "country_display: United_States → 'United States'")
check(ns["ADMIN1_DISPLAY_KIND"].get("Bangladesh") == "Division" and ns["ADMIN1_DISPLAY_KIND"].get("United_States", "State") == "State", "display_kind: BGD Division, elsewhere State")
check(set(ns["EXPECTED_ADMIN1"]) <= set(ns["COUNTRY_ISO3"]) and set(ns["AOI_ADMIN1"]) <= set(ns["AOI_COUNTRIES"]), "admin-1 tables keyed on configured FIRMS slugs only")
# the registry table in CONTRACT.md §9 is the authority: every row must agree with the config constants
reg_txt = (Path(__file__).resolve().parents[2] / "CONTRACT.md").read_text(encoding="utf-8")
rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in reg_txt.split("## 9. Region registry", 1)[1].splitlines() if l.startswith("| ") and not l.startswith("| aoi_id") and not l.startswith("|---")]
iso3 = ns["COUNTRY_ISO3"]; slug = {ns["country_display"](k): k for k in ns["AOI_COUNTRIES"]}
bad = []
for aoi, name, country, kind, parent, cells_x, feats_x, dkind in rows:
    if (cells_x == "yes") != (aoi not in ns["CELLS_EXPORT_SKIP_AOIS"]): bad.append((aoi, "cells_exported"))
    if (feats_x == "yes") != (aoi in ns["FEATURE_EXPORT_AOIS"]): bad.append((aoi, "features_exported"))
    if country not in slug: bad.append((aoi, "country")); continue
    if kind == "country" and aoi != iso3[slug[country]]: bad.append((aoi, "iso3"))
    if kind == "admin1" and dkind != ns["ADMIN1_DISPLAY_KIND"].get(slug[country], "State"): bad.append((aoi, "display_kind"))
check(len(rows) == 12 and not bad, f"CONTRACT §9 region registry ({len(rows)} rows) agrees with the notebook constants {bad}")

print("== Natural Earth name mapping: FIRMS 'United_States' vs NE 'United States of America' ==")
import shapely
from shapely.geometry import shape, Point, box, mapping
from shapely.ops import unary_union
ns.update(shape=shape, unary_union=unary_union, shapely=shapely, re=__import__("re"))
exec(compile("\n".join(text[text.index("def country_display("):text.index("def panel_memory_plan(")].split("\n")), SRC, "exec"), ns)
exec(compile(text[text.index("ISO2_RE = re.compile"):text.index("AOI_NOTES = []")], SRC, "exec"), ns)    # admin1_code + dissolve_features
us0 = {"ADMIN": "United States of America", "NAME": "United States of America", "ADM0_A3": "USA", "ISO_A3": "USA"}
check(ns["ne_country_match"](us0, "USA", "United_States"), "NE admin-0 'United States of America' (ADM0_A3 USA) matches slug United_States")
check(ns["ne_country_match"]({"ADMIN": "United States of America", "ADM0_A3": "-99"}, "USA", "United_States"), "explicit NE name table matches even if ISO3 is unusable")
check(ns["ne_country_match"]({"admin": "United States of America", "adm0_a3": "USA"}, "USA", "United_States"), "NE admin-1 props (lowercase admin/adm0_a3) match")
check(not ns["ne_country_match"]({"ADMIN": "Australia", "ADM0_A3": "AUS"}, "USA", "United_States") and not ns["ne_country_match"](us0, "AUS", "Australia")
      and not ns["ne_country_match"]({"ADMIN": "Bangladesh", "ADM0_A3": "BGD"}, "USA", "United_States"), "no cross-matches between BGD / AUS / USA")
check(not ns["ne_country_match"]({"admin": "United States Minor Outlying Islands", "adm0_a3": "UMI"}, "USA", "United_States"), "similar NE names (UMI) are not matched")
# real (fixture) NE files: admin-1 features of USA found, US-CA picked by iso_3166_2, other states ignored
FIXTURE = Path(os.environ["LUMOS_INPUT"]) / "lumos_bundle" / "context"
adm0 = json.load(open(FIXTURE / "ne_110m_admin_0_countries.geojson")); adm1 = json.load(open(FIXTURE / "ne_10m_admin_1_states_provinces.geojson"))
hits0 = [f["properties"]["ADM0_A3"] for f in adm0["features"] if ns["ne_country_match"](f["properties"], "USA", "United_States")]
check(hits0 == ["USA"], f"fixture admin-0: exactly one USA feature {hits0}")
us1 = [f for f in adm1["features"] if ns["ne_country_match"]({k: v for k, v in f["properties"].items() if k in ("adm0_a3", "admin")}, "USA", "United_States")]
check(len(us1) >= 1 and all(f["properties"]["iso_3166_2"].startswith("US-") for f in us1), f"fixture admin-1: {len(us1)} US features")
codes = [ns["admin1_code"](f["properties"], None) for f in us1]
check("US-CA" in codes and [c for c in codes if c == "US-CA"] == ["US-CA"], f"admin1_code → iso_3166_2 {sorted(codes)}")
ca = ns["dissolve_features"]([f for f, c in zip(us1, codes) if c == "US-CA"])
shapely.prepare(ca)
pts = {"Los Angeles": (-118.24, 34.05, True), "Sacramento": (-121.49, 38.58, True), "Lake Tahoe CA side": (-120.1, 39.1, True),
       "Reno NV": (-119.8, 39.53, False), "Phoenix AZ": (-112.07, 33.45, False), "Pacific off Monterey": (-124.0, 36.6, False), "Portland OR": (-122.7, 45.5, False)}
okp = {k: bool(shapely.contains_xy(ca, x, y)) == want for k, (x, y, want) in pts.items()}
check(all(okp.values()), f"US-CA polygon contains California points and excludes NV/AZ/OR/ocean points: {okp}")
parts = len(ca.geoms) if hasattr(ca, "geoms") else 1
check(parts > 1, f"US-CA is a MultiPolygon with {parts} parts (mainland + islands)")
# a split feature set (mainland + island with the same code) must be dissolved to one geometry covering both
mainland = {"geometry": mapping(box(-124.0, 33.0, -117.0, 41.0))}; island = {"geometry": mapping(box(-119.9, 33.9, -119.5, 34.1))}
d = ns["dissolve_features"]([mainland, island])
check(shapely.contains_xy(d, -119.7, 34.0) and shapely.contains_xy(d, -120.0, 37.0) and not shapely.contains_xy(d, -126.0, 37.0), "dissolve_features: mainland + island features → one geometry covering both")
check(ns["dissolve_features"]([mainland]).equals(box(-124.0, 33.0, -117.0, 41.0)), "dissolve_features: single feature is used as is")

print("== equal-area grid and key packing stay valid for Alaska / Hawaii / territories / antimeridian ==")
exec(compile(text[text.index("def lonlat_to_cell("):text.index("def parse_times(")], SRC, "exec"), ns)
import numpy as np
places = {"Attu (Aleutians, +lon)": (172.9, 52.9), "Adak": (-176.6, 51.9), "Utqiagvik (71N)": (-156.8, 71.3), "Fairbanks": (-147.7, 64.8), "Honolulu": (-157.85, 21.3),
          "Hilo": (-155.1, 19.7), "Guam": (144.8, 13.45), "American Samoa": (-170.7, -14.3), "San Juan PR": (-66.1, 18.45), "Key West": (-81.8, 24.55),
          "Maine": (-67.0, 44.8), "Los Angeles": (-118.24, 34.05), "date line +180": (180.0, 0.0), "date line -180": (-180.0, 0.0), "N pole": (0.0, 90.0), "S pole": (0.0, -90.0),
          "lon -179.99 / lat -89.99": (-179.99, -89.99)}
lon = np.array([v[0] for v in places.values()]); lat = np.array([v[1] for v in places.values()])
ix, iy, key = ns["lonlat_to_cell"](lon, lat)
check(bool(ns["grid_key_in_range"](ix, iy).all()), f"every US place (and the whole-globe corners) packs into the key range: ix {ix.min()}..{ix.max()}, iy {iy.min()}..{iy.max()}")
gl = np.stack(np.meshgrid(np.linspace(-180, 180, 721), np.linspace(-90, 90, 361)), -1).reshape(-1, 2)
gx, gy, _ = ns["lonlat_to_cell"](gl[:, 0], gl[:, 1])
check(bool(ns["grid_key_in_range"](gx, gy).all()), "a 0.5° global lattice packs into the key range (the USA file can never overflow it)")
check(not bool(ns["grid_key_in_range"](np.array([0]), np.array([ns["KEY_MUL"] - ns["IY_OFF"]]))[0]), "grid_key_in_range rejects an out-of-range iy (guard works)")
ix2, iy2 = ns["key_to_ixiy"](key)
check(bool((ix2 == ix).all() and (iy2 == iy).all()), "key ↔ (ix, iy) round-trip for all places")
clon, clat = ns["cell_centre"](ix, iy); ixc, iyc, _ = ns["lonlat_to_cell"](clon, clat)
check(bool((ixc == ix).all() and (iyc == iy).all()), "cell centre lies inside its own cell for all places")
# exact equal area: spherical rectangle between the cell edges is 5 km × 5 km = 25 km² at every latitude, incl. 71°N and 60°S
R, M = ns["R_EARTH"], ns["CELL_M"]
def edge_area_m2(i, j):       # spherical lon/lat rectangle with the cell's edges recovered through degrees/arcsin (not the projection formula itself)
    lon0, lon1 = np.degrees(i * M / R), np.degrees((i + 1) * M / R)
    lat0, lat1 = np.degrees(np.arcsin(j * M / R)), np.degrees(np.arcsin((j + 1) * M / R))
    return R * R * np.radians(lon1 - lon0) * (np.sin(np.radians(lat1)) - np.sin(np.radians(lat0)))
inner = [(i, j) for i, j in zip(ix, iy) if abs(j * M / R) <= 1 and abs((j + 1) * M / R) <= 1]    # polar caps are partial cells: excluded
check(len(inner) > 10 and all(abs(edge_area_m2(i, j) / 25e6 - 1) < 1e-9 for i, j in inner), f"equal-area: {len(inner)} cells (Alaska 71°N, Hawaii, Samoa -14°S, Maine, ...) each 25 km² (rel. error < 1e-9)")
# antimeridian: cells either side of ±180° are 8000 columns apart in key space, so the 3×3 neighbourhood does not wrap (documented limitation, Aleutians only)
check(abs(int(ix[list(places).index("date line +180")]) - int(ix[list(places).index("date line -180")])) > 8000, "±180° cells are not key-neighbours (3×3 sum does not wrap the antimeridian)")
# high latitude cells are tall and thin on the ground but exactly 25 km²: Utqiagvik cell E-W width < 2 km
ew_km = M * np.cos(np.radians(71.3)) / 1000
check(ew_km < 2.0, f"71°N cell is {ew_km:.2f} km wide E-W × {25 / ew_km:.1f} km N-S (distorted shape, same 25 km²)")

print("== panel memory plan ==")
plan = ns["panel_memory_plan"]({"Bangladesh": 20000, "Australia": 250000, "United_States": 300000}, 300, 13, 3)
check(plan["n_cells"] == 570000 and plan["cell_months"] == 570000 * 300 and plan["bytes_per_cell_month"] == 13 * 4 + 4 + 4 + 2 + 2 + 1 + 12 + 12 + 4,
      f"plan arithmetic: {plan}")
check(abs(plan["panel_gb"] - 570000 * 300 * plan["bytes_per_cell_month"] / 1e9) < 0.01 and plan["peak_country_build_gb"] > 0, "panel_gb / peak_country_build_gb computed")
plan2 = ns["panel_memory_plan"]({"Bangladesh": 20000, "Australia": 250000, "United_States": 600000}, 300, 13, 3)
check(plan2["panel_gb"] > plan["panel_gb"] and plan2["peak_country_build_gb"] > plan["peak_country_build_gb"], "memory scales with the number of detection cells (sparse), not with area")
check(ns["panel_memory_plan"]({}, 300, 13, 1)["panel_gb"] == 0, "empty input is safe")

print(f"\n{'ALL UNIT TESTS PASSED' if not FAILS else 'FAILED: ' + str(FAILS)}")
sys.exit(1 if FAILS else 0)
