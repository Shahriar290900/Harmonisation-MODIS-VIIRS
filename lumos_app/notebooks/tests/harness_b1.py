"""Scratch review harness: exec Notebook B cells up to B1 (lines 1-846) on the fixture, then
(1) reproduce B1 predictions from weights.json alone in plain numpy,
(2) brute-force check 3x3 neighbourhood, cell id/centre inverse, climatology train-only, feature list.
Adapted from review/scratch/harness_b1.py (marker-based exec instead of line numbers; exported-weights path from env).
Usage: LUMOS_INPUT=... LUMOS_WORK=<dir with a previous export> LUMOS_QUICK=1 LUMOS_AUTO_RESUME=0 python3 harness_b1.py
"""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _exec_upto import exec_upto
ns = exec_upto("B2 XGBoost")          # marker-based (was: first 846 lines)
P, FEATURES, CELLS = ns["P"], ns["FEATURES"], ns["CELLS"]

# ---- (1) B1 from JSON only ----
w = ns["MODELS"]["B1_poisson"]["weights"]
wj = json.loads(json.dumps(w))           # round-trip through JSON text, as the app sees it
rows = ns["PRED_ROWS"][::997][:5000]
X = np.stack([P[f][rows] for f in wj["feature_names"]], 1).astype(np.float64)
Z = X.copy()
for j, t in enumerate(wj["transform"]):
    if t == "log1p": Z[:, j] = np.log1p(np.clip(Z[:, j], 0, None))
Z = (Z - np.array(wj["mean"])) / np.array(wj["scale"])
rate = np.exp(Z @ np.array(wj["coef"]) + wj["intercept"])
ref = ns["MODELS"]["B1_poisson"]["pred"][rows]
rel = np.abs(rate - ref) / np.maximum(np.abs(ref), 1e-6)
print("B1 JSON-only reproduction: n=%d max_rel_diff=%.3g" % (len(rows), rel.max()))
exported = json.load(open(os.environ.get("LUMOS_EXPORTED_B1", os.path.join(os.environ["LUMOS_WORK"], "lumos_app_bundle/models/B1_poisson/weights.json"))))
print("exported weights == rerun weights (coef max diff):", np.max(np.abs(np.array(exported["coef"]) - np.array(wj["coef"]))))

# ---- (2a) cell id / centre ----
lon = np.array([-0.0001, 0.0001, 151.2, 90.4, -179.99, 179.99]); lat = np.array([-0.0001, 0.0001, -33.87, 23.8, -89.9, 89.9])
ix, iy, key = ns["lonlat_to_cell"](lon, lat)
print("ix,iy for tiny negatives/positives:", list(zip(ix.tolist(), iy.tolist())))
ix2, iy2 = ns["key_to_ixiy"](key); assert (ix2 == ix).all() and (iy2 == iy).all()
clon, clat = ns["cell_centre"](ix, iy)
ixc, iyc, _ = ns["lonlat_to_cell"](clon, clat); assert (ixc == ix).all() and (iyc == iy).all(), "centre not inside its own cell"
print("cell id round-trip + centre-in-cell OK")

# ---- (2b) 3x3 brute force on AUS (negative iy) ----
NM = ns["NM"]
aq = P["aqua_count"].reshape(-1, NM); a3 = P["aqua_count_3x3"].reshape(-1, NM)
au = CELLS[CELLS.country == "Australia"]
pos = {(int(a), int(b)): int(g) for a, b, g in zip(au.ix, au.iy, au.gcell)}
rng = np.random.default_rng(0); errs = 0; checked = 0
mcols = np.where(np.isfinite(aq[au.gcell.iloc[0]]))[0]
for g in rng.choice(au.gcell.to_numpy(), 300, replace=False):
    c = CELLS.loc[g]; tot = np.zeros(len(mcols))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            h = pos.get((int(c.ix) + dx, int(c.iy) + dy))
            if h is not None: tot += aq[h, mcols]
    errs += int(np.abs(tot - a3[g, mcols]).max() > 1e-4); checked += 1
print(f"3x3 brute force AUS (min iy={au.iy.min()}): {errs}/{checked} cells mismatched")

# ---- (2c) climatology train-only ----
YEAR_OF_M, MONTH_OF_M = ns["YEAR_OF_M"], ns["MONTH_OF_M"]
cl = P["aqua_clim"].reshape(-1, NM)
g = int(au.gcell.iloc[5]); mo = 11
tm = np.where(np.isin(YEAR_OF_M, ns["TRAIN_YEARS"]) & (MONTH_OF_M == mo))[0]
print("clim train-only matches:", np.isclose(np.nanmean(aq[g, tm]), cl[g, tm[0]]), " forbidden viirs in FEATURES:", [f for f in FEATURES if "viirs" in f or "snpp" in f])
# ---- Jan-2012 partial VIIRS month ----
v = P["viirs_snpp_count"].reshape(-1, NM)
m12 = [int(np.where((YEAR_OF_M == 2012) & (MONTH_OF_M == k))[0][0]) for k in (1, 2)]
print("Jan/Feb 2012 viirs finite:", np.isfinite(v[:, m12]).all(0).tolist())
print("SPLIT code for 2012 rows:", np.unique(ns["SPLIT"][P["year"] == 2012]).tolist())
print("Jan 2012 status per country (0 missing/1 partial/2 complete):", {c: int(ns["STATUS"][c]["snpp"][m12[0]]) for c in ns["COUNTRIES"]})
print("SPLIT code for 2003 / 2012 rows:", np.unique(ns["SPLIT"][P["year"] == 2003]).tolist(), np.unique(ns["SPLIT"][P["year"] == 2012]).tolist())
print("B1 feature list:", wj["feature_names"][-3:], "transforms:", wj["transform"][-3:])
