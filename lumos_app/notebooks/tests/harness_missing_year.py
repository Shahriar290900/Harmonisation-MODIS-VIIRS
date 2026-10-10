#!/usr/bin/env python3
"""Notebook B treats a year that Notebook A marked `missing` (real FIRMS: yearly country files for 2025 answer 404) as UNAVAILABLE, never zero.

Builds a variant of the synthetic fixture whose sources.json marks every 2025 MODIS / VIIRS-SNPP country file `missing` (HTTP 404), then
(1) executes B up to the splits and checks the panel: calendar still spans 2001-2025 (300 months), every 2025 month is `missing` with the
    manifest reason, all 2025 cell values are NaN (not 0), 2024 stays finite, Aqua 2002-07 is partial (Aqua started 2002-07-03), and a month
    that contains NRT rows (no `type`) becomes partial instead of complete;
(2) with --e2e runs the whole script in QUICK mode and checks the exported 2025 activity records (null values, extract_status missing, no estimate).
Usage: python harness_missing_year.py [--e2e]
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
FIX = HERE.parents[1] / "fixtures" / "out" / "lumos_bundle"
tmp = Path(tempfile.mkdtemp(prefix="lumosB_miss_"))
inp, work = tmp / "in" / "lumos_bundle", tmp / "work"
(inp / "manifests").mkdir(parents=True); work.mkdir()
for d in ("raw", "context", "wheelhouse"): os.symlink(FIX / d, inp / d)
for f in FIX.glob("*"):
    if f.is_file(): shutil.copy(f, inp / f.name)
for f in (FIX / "manifests").glob("*.json"): shutil.copy(f, inp / "manifests" / f.name)
src = json.load(open(FIX / "manifests" / "sources.json"))
n_mod = 0
for s in src:
    if s.get("sensor") in ("modis", "viirs-snpp") and int(s.get("year", 0)) == 2025:
        s.update(status="missing", http_status=404, rows=0, bytes=0, sha256=None, note="404 not found on server"); n_mod += 1
json.dump(src, open(inp / "manifests" / "sources.json", "w"), indent=1)
print(f"variant bundle: {tmp / 'in'} ({n_mod} source entries for 2025 marked missing/404)")

FAILS = []
def check(c, m):
    print(("  PASS " if c else "  FAIL ") + m, flush=True)
    if not c: FAILS.append(m)

if "--e2e" not in sys.argv:
    os.environ.update(LUMOS_INPUT=str(tmp / "in"), LUMOS_WORK=str(work), LUMOS_QUICK="1", LUMOS_AUTO_RESUME="0")
    import numpy as np
    from _exec_upto import exec_upto
    ns = exec_upto("MODEL UTILITIES")     # stops after the splits cell
    NM, YMIN, YMAX = ns["NM"], ns["YEAR_MIN"], ns["YEAR_MAX"]
    check((YMIN, YMAX, NM) == (2001, 2025, 300), f"calendar still spans 2001-2025 with 2025 missing: {(YMIN, YMAX, NM)}")
    ok = True
    for c in ns["COUNTRIES"]:
        for p in ("aqua", "terra", "snpp"):
            st = ns["STATUS"][c][p]
            ok &= bool((st[-12:] == 0).all()) and "missing" in " ".join(ns["STATUS_NOTES"][c][p][m] for m in range(NM - 12, NM))
    check(ok, "every 2025 month is `missing` for every country and platform, with the manifest status in the note")
    P = ns["P"]
    for k in ("aqua_count", "terra_count", "viirs_snpp_count", "static_aqua", "static_viirs"):
        a = P[k].reshape(-1, NM)
        check(bool(np.isnan(a[:, -12:]).all()) and bool(np.isfinite(a[:, -24:-12]).any()), f"{k}: 2025 all NaN (never 0), 2024 has values")
    check(ns["SPLIT_MANIFEST"]["rows"]["train"] > 0 and ns["SPLIT_MANIFEST"]["rows"]["val"] > 0 and ns["SPLIT_MANIFEST"]["rows"]["test"] > 0,
          f"split rows unaffected by the missing year: {ns['SPLIT_MANIFEST']['rows']}")
    m02 = (2002 - YMIN) * 12 + 6
    check(all(int(ns["STATUS"][c]["aqua"][m02]) == 1 for c in ns["COUNTRIES"]) and all(int(ns["STATUS"][c]["aqua"][m02 + 1]) == 2 for c in ns["COUNTRIES"]),
          "Aqua 2002-07 partial (record starts 2002-07-03), 2002-08 complete")
    # a month that carries NRT rows (no `type`) must not be complete
    s0 = next(s for s in ns["SOURCES"] if s["id"] == "modis_2020_Bangladesh")
    base_st, _ = ns["month_status"]("Bangladesh", "aqua")
    s0["_platform_nrt_months"] = {"aqua": [str(2020 * 12 + 2)]}
    st2, notes2 = ns["month_status"]("Bangladesh", "aqua")
    k = (2020 - YMIN) * 12 + 2
    check(int(base_st[k]) == 2 and int(st2[k]) == 1 and "near-real-time" in notes2[k], f"NRT rows make their month partial: {notes2[k][:90]}")
    st_t, _ = ns["month_status"]("Bangladesh", "terra")
    check(int(st_t[k]) == 2, "other platforms of the same file are not affected")
else:
    env = dict(os.environ, LUMOS_INPUT=str(tmp / "in"), LUMOS_WORK=str(work), LUMOS_QUICK="1", LUMOS_AUTO_RESUME="0")
    log = tmp / "e2e.log"
    rc = subprocess.run([sys.executable, str(HERE.parent / "lumos_B_train.py")], env=env, stdout=open(log, "w"), stderr=subprocess.STDOUT, timeout=3600).returncode
    check(rc == 0, f"QUICK run on the variant bundle exits 0 (log {log})")
    B = work / "lumos_app_bundle"
    man = json.load(open(B / "manifest.json"))
    check(man["years"][-1] == 2025, f"manifest years end at 2025: {man['years'][-3:]}")
    bad = []
    for aoi in man["aois"]:
        for r in json.load(open(B / "activity" / aoi / "2025.json")):
            if not (r["extract_status"] == "missing" and r["raw_modis_detections"] is None and r["raw_modis_terra_detections"] is None
                    and r["raw_viirs_reference_detections"] is None and r["estimated_viirs_reference_detections"] is None
                    and r["static_source_detections_modis"] is None and r["value_status"] in ("unsupported", "demo")
                    and r["provenance_ids"] == []):
                bad.append((aoi, r["period_start_utc"], r["extract_status"], r["raw_modis_detections"]))
    check(not bad, f"every 2025 activity record of every AOI is missing with null counts (never 0), no estimate: {bad[:2]}")
    r24 = json.load(open(B / "activity" / "BGD" / "2024.json"))
    check(any(r["raw_modis_detections"] for r in r24), "2024 still carries counts")
    cs = subprocess.run([sys.executable, str(HERE / "check_bundle.py"), str(B)], capture_output=True, text=True)
    check(cs.returncode == 0, "check_bundle.py (without --fixture) passes on the variant bundle: " + cs.stdout.strip().splitlines()[-1])
    if cs.returncode: print(cs.stdout[-3000:])

print(f"\n{'MISSING-YEAR CHECKS PASSED' if not FAILS else 'FAILED: ' + str(FAILS)}")
shutil.rmtree(tmp, ignore_errors=True) if not FAILS else print(f"kept {tmp} for inspection")
sys.exit(1 if FAILS else 0)
