#!/usr/bin/env python3
"""Independent checks of an exported lumos_app_bundle (does NOT reuse Notebook B's own schema).

* Builds a JSON schema from the monthly-record example in CONTRACT.md §6 (field list + example value types/enums) and validates
  every activity record with jsonschema.
* Verifies checksums.sha256 and manifest.json file hashes.
* Re-derives the v1.1 validation gate from metrics.json (AOI-month MAE pooled over the NON-OVERLAPPING gated regions, v1.2) and the
  per-region release stage (selected model vs B0_identity / B0_month_ratio on each region's test MAE + that region's interval coverage).
* Checks interval_empirical_holdout_coverage semantics (region-level test coverage; null for whole-country AUS/USA and divisions), the
  regions.json flags against the files on disk, and that no exported file contains a developer-local absolute path (/Users/, /kaggle/, /home/).
* Recomputes the selected B0_month_ratio estimate from models/B0_month_ratio/weights.json + cells/*.json, and B1 from
  models/B1_poisson/weights.json + features/<aoi>/<year>.json (the app's JS path).
* Fixture-specific invariants (AUS 2016 VIIRS null, Jan 2012 partial, 2012 backcast, header-only 2025, Terra 2008 outage,
  ISO-keyed region ids with modern names, cell budget, recent layer flagged).

Usage: python check_bundle.py <lumos_app_bundle dir> [--contract CONTRACT.md] [--fixture]
Exit code 0 = all checks passed.
"""
import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import jsonschema
import numpy as np

FAILS, PASSES = [], []


def check(cond, msg):
    (PASSES if cond else FAILS).append(msg)
    print(("  PASS " if cond else "  FAIL ") + msg)
    return cond


def contract_schema(contract_path):
    text = Path(contract_path).read_text(encoding="utf-8")
    i = text.index("Monthly record (one per AOI-month):")
    block = text[i:].split("```json", 1)[1].split("```", 1)[0]
    example = json.loads(block)

    def sub(k, v):
        if k == "schema_version": return {"const": v}
        if k == "coverage_fraction": return {"type": "null"}          # contract: always null
        if isinstance(v, bool): return {"type": ["boolean", "null"]}
        if isinstance(v, int): return {"type": ["integer", "null"], "minimum": 0} if k != "rank" else {"type": ["integer", "null"]}
        if isinstance(v, float): return {"type": ["number", "null"]}
        if isinstance(v, str) and "|" in v: return {"enum": v.split("|")}
        if isinstance(v, str): return {"type": ["string", "null"]} if k == "model_id" else {"type": "string"}
        if isinstance(v, list): return {"type": "array", "items": {"type": "string"}}
        if isinstance(v, dict):
            return {"type": "object", "required": list(v), "additionalProperties": False, "properties": {kk: sub(kk, vv) for kk, vv in v.items()}}
        if v is None: return {"type": "null"}
        raise ValueError(k)
    schema = {"type": "object", "required": list(example), "additionalProperties": False,
              "properties": {k: sub(k, v) for k, v in example.items()}}
    # numbers that may legitimately be integers in JSON
    for k, p in schema["properties"].items():
        if p.get("type") == ["number", "null"]: p["type"] = ["number", "integer", "null"]
    schema["properties"]["anomaly"]["properties"]["zscore_log"]["type"] = ["number", "integer", "null"]
    return schema, list(example)


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle")
    ap.add_argument("--contract", default=str(Path(__file__).resolve().parents[2] / "CONTRACT.md"))
    ap.add_argument("--fixture", action="store_true")
    a = ap.parse_args()
    B = Path(a.bundle)
    man = json.load(open(B / "manifest.json"))
    met = json.load(open(B / "metrics.json"))
    regions = json.load(open(B / "regions.json"))

    print("== activity records vs schema derived from CONTRACT.md §6 ==")
    schema, fields = contract_schema(a.contract)
    v = jsonschema.Draft202012Validator(schema)
    n, errs, keyorder = 0, [], 0
    for f in sorted((B / "activity").rglob("*.json")):
        recs = json.load(open(f))
        check_len = len(recs) == 12
        if not check_len: errs.append(f"{f}: {len(recs)} records")
        for r in recs:
            n += 1
            e = [x.message for x in v.iter_errors(r)]
            if e: errs.append(f"{f.name} {r.get('period_start_utc')}: {e[:2]}")
            if list(r) != fields: keyorder += 1
    check(n > 0 and not errs, f"{n} activity records valid against the CONTRACT-derived schema ({len(errs)} errors) {errs[:2]}")
    check(keyorder == 0, "every record has exactly the contract keys in contract order")
    check({"static_source_detections_modis", "static_source_detections_viirs"} <= set(fields), "contract has both static keys")

    print("== checksums + manifest ==")
    lines = (B / "checksums.sha256").read_text().splitlines()
    listed = {}
    for l in lines:
        h, p = l.split("  ", 1); listed[p] = h
    bad = [p for p, h in listed.items() if sha(B / p) != h]
    allf = {str(p.relative_to(B)).replace("\\", "/") for p in B.rglob("*") if p.is_file()} - {"checksums.sha256"}
    check(not bad and set(listed) == allf, f"checksums.sha256: {len(listed)} files, {len(bad)} mismatches, coverage complete={set(listed) == allf}")
    mbad = [p for p, h in man["files"].items() if sha(B / p) != h]
    check(not mbad and set(man["files"]) == allf - {"manifest.json"}, f"manifest files: {len(man['files'])} hashes, {len(mbad)} mismatches")
    srcs = (B / "sources.json").read_text()
    check(not re.search(r"/api/area/csv/(?!\*\*\*|\{MAP_KEY\})[^/]+/", srcs), "sources.json carries no API key")

    print("== v1.1 gate re-derived from metrics.json ==")
    g = met["gate"]
    def vm(mid, sg="gate_units", level="aoi_month"):
        try: return met["models"][mid]["val"][level][sg]["mae"]
        except Exception: return None
    bc = {m: vm(m) for m in ("B1_poisson", "B0_month_ratio") if vm(m) is not None}
    base = min(bc, key=bc.get)
    check(g["baseline"] == base, f"baseline = better of B1/B0_month_ratio on val AOI-month MAE: {bc} → {base}")
    b_mae, b_act = vm(base), vm(base, "active", "cell_month")
    passing = []
    for mid in ["B0_identity", "B0_ratio", "B0_month_ratio", "B1_poisson", "B2_xgb", "D1_mlp"]:
        if mid == base or vm(mid) is None: continue
        ok = vm(mid) <= 0.9 * b_mae and (vm(mid, "active", "cell_month") <= 1.1 * b_act)
        if ok: passing.append((vm(mid), mid))
    exp_sel = min(passing)[1] if passing else base
    check(met["selected_model_id"] == exp_sel == man["selected_model_id"], f"selected = {exp_sel} (passing={passing})")
    check(bool(met.get("release_reason")) and (exp_sel not in ("B0_month_ratio", "B0_identity") or "cannot hold by construction" in met["release_reason"]),
          "release_reason explains the selection / release stage")
    check(all(m not in [x[1] for x in passing] for m in ("Q1_vqc", "Q2_qllm")), "Q1/Q2 are not selection candidates")

    print("== v1.2 per-region release stage re-derived from metrics.json ==")
    rel = met["release"]
    units = rel["gate_regions"]
    ids0 = {r["aoi_id"]: r for r in regions}
    check(set(units) <= set(ids0) and not any(ids0[u].get("parent") in units for u in units),
          f"gated regions are non-overlapping (no gated region nested in another): {units}")
    check(g.get("gate_regions") == units and "gate_units" in met["models"][met["selected_model_id"]]["val"]["aoi_month"],
          "validation gate pooled over the gated regions only (gate_units subgroup present)")
    sel0 = met["selected_model_id"]
    def tm(mid, u):
        try: return met["models"][mid]["test"]["aoi_month"][f"aoi:{u}"]["mae"]
        except Exception: return None
    stages = []
    for u in units:
        s_m, i_m, r_m = tm(sel0, u), tm("B0_identity", u), tm("B0_month_ratio", u)
        bi = sel0 != "B0_identity" and s_m is not None and i_m is not None and s_m < i_m
        br = sel0 != "B0_month_ratio" and s_m is not None and r_m is not None and s_m < r_m
        ci = (met["models"][sel0].get("interval") or {}).get("test_coverage_by_aoi", {}).get(u, {})
        cok = ci.get("coverage") is not None and abs(ci["coverage"] - 0.80) <= 0.10 + 1e-9
        exp = "validated_calibration" if (bi and br and cok) else "observed_comparison"
        got = rel["regions"][u]
        stages.append(exp)
        check(got["stage_if_real"] == exp and got["beats_B0_identity"] == bi and got["beats_B0_month_ratio"] == br and got["coverage_ok"] == cok,
              f"region {u}: release {got['stage']} (would be {got['stage_if_real']}) re-derived {exp}; beats identity={bi}, beats month_ratio={br}, coverage={ci.get('coverage')} n={ci.get('n')}")
    exp_overall = "ui_prototype" if met["synthetic"] else (min(stages, key=["ui_prototype", "observed_comparison", "validated_calibration"].index) if stages else "observed_comparison")
    check(met["release_stage"] == man["release_stage"] == rel["stage"] == exp_overall,
          f"overall release_stage = weakest region = {exp_overall} (metrics {met['release_stage']}, manifest {man['release_stage']})")
    check(set(man["release_regions"]) == set(units) and all(man["release_regions"][u]["stage"] == rel["regions"][u]["stage"] for u in units),
          "manifest.release_regions mirrors metrics release.regions")
    check(all(u in met["release_reason"] for u in units), "release_reason lists every gated region")
    check(all(r["supported_calibration"] == (r["aoi_id"] in units and rel["regions"][r["aoi_id"]]["stage"] == "validated_calibration") for r in regions),
          "regions.json supported_calibration is true only for a gated region whose own stage is validated_calibration")
    check(all(r.get("evaluation_unit") == (r["aoi_id"] in units) for r in regions), "regions.json evaluation_unit marks exactly the gated regions")
    check(set(rel["reported_separately"]) == {r["aoi_id"] for r in regions} - set(units), "whole-country AUS/USA and divisions are reported separately, not gated")
    print("== interval_empirical_holdout_coverage semantics (v1.2: region-level test coverage) ==")
    cov_by = (met["models"][sel0].get("interval") or {}).get("test_coverage_by_aoi", {})
    bad_cov = []
    for f in sorted((B / "activity").rglob("*.json")):
        for r in json.load(open(f)):
            c = r["interval_empirical_holdout_coverage"]
            if r["estimated_viirs_reference_detections"] is None:
                if c is not None: bad_cov.append((f.name, r["period_start_utc"], "coverage on a record without estimate"))
            elif r["aoi_id"] in units:
                if c is None or abs(c - round(cov_by[r["aoi_id"]]["coverage"], 4)) > 1e-9: bad_cov.append((r["aoi_id"], r["period_start_utc"], c))
            elif c is not None or "interval_empirical_holdout_coverage is null" not in r["reason"]:
                bad_cov.append((r["aoi_id"], r["period_start_utc"], c))
    check(not bad_cov, f"coverage field: gated regions carry their own region coverage, AUS/USA/divisions null with a documented reason ({len(bad_cov)} violations) {bad_cov[:2]}")

    print("== regions (ISO-keyed, modern names) ==")
    ids = {r["aoi_id"]: r for r in regions}
    check(all(re.fullmatch(r"[A-Z]{3}(-[A-Z0-9]{1,3})?", i) for i in ids), f"aoi ids ISO-based: {sorted(ids)}")
    check(all(r.get("iso_3166_2") and i == {"BD": "BGD", "AU": "AUS", "US": "USA"}[r["iso_3166_2"][:2]] + r["iso_3166_2"][2:] for i, r in ids.items() if r["kind"] == "admin1"),
          "admin1 aoi_id derived from iso_3166_2")
    check(all(isinstance(r.get("cells_exported"), bool) and isinstance(r.get("features_exported"), bool) for r in regions),
          "every region carries cells_exported / features_exported booleans")
    check(all(r["kind"] == "country" or r.get("parent") in ids for r in regions) and all(r.get("parent") is None for r in regions if r["kind"] == "country"),
          "registry: admin1 regions have a parent country aoi_id present in regions.json; countries have none")
    check(all((B / "cells" / i).is_dir() == r["cells_exported"] for i, r in ids.items()), "cells_exported flag matches cells/<aoi>/ on disk")
    check(all((B / "features" / i).is_dir() == r["features_exported"] for i, r in ids.items()), "features_exported flag matches features/<aoi>/ on disk")
    check(all((B / "activity" / i).is_dir() for i in ids), "activity/<aoi>/ exists for every region")
    names = {r["name"] for r in regions}
    check(not ({"Chittagong", "Barisal"} & names), "display names use modern spellings")
    check(all((B / r["geometry_path"]).exists() for r in regions if r["geometry_path"]), "every geometry_path exists")

    print("== no developer-local absolute paths in any exported file ==")
    hits = []
    for pth in sorted(B.rglob("*")):
        if pth.is_file():
            data = pth.read_bytes()
            for m in (b"/Users/", b"/kaggle/", b"/home/"):
                if m in data: hits.append((str(pth.relative_to(B)), m.decode()))
    check(not hits, f"no '/Users/', '/kaggle/' or '/home/' path in any exported file ({len(hits)} hits) {hits[:3]}")
    skip_reason = (met.get("qllm") or {}).get("reason") or ""
    check("under <input>" in skip_reason or met["qllm"].get("status") != "skipped", f"Q2 skip reason uses the <input> placeholder: {skip_reason!r}")

    print("== cells / features / models ==")
    sizes = [p.stat().st_size / 1e6 for p in (B / "cells").rglob("*.json")]
    check(max(sizes) <= 15.0, f"cells files ≤ 15 MB (max {max(sizes):.2f} MB over {len(sizes)} files)")
    check(not (B / "cells" / "AUS").exists() and not (B / "cells" / "USA").exists(), "no whole-country AUS / USA cell grid (v1.1, v1.2 addendum)")
    sel = met["selected_model_id"]
    for mid in ("B0_identity", "B0_ratio", "B0_month_ratio", "B1_poisson", "D1_mlp"):
        card = json.load(open(B / "models" / mid / "model_card.json"))
        check(card.get("feature_order") and card.get("feature_definitions") and set(card["feature_order"]) <= set(card["feature_definitions"]),
              f"{mid} model card has ordered features + definitions")
    d1 = json.load(open(B / "models" / "D1_mlp" / "model_card.json"))
    check(d1.get("onnx_io", {}).get("input", {}).get("name") == "x" and len(d1["onnx_io"]["input"]["features"]) == d1["onnx_io"]["input"]["shape"][1],
          "D1 ONNX I/O spec in model card")
    # selected B0_month_ratio recomputed from weights.json + cells
    if sel == "B0_month_ratio":
        w = json.load(open(B / "models" / "B0_month_ratio" / "weights.json"))
        iso = "BGD"; worst = 0.0; nchk = 0
        for y in (2005, 2015, 2021):
            cf = json.load(open(B / "cells" / iso / f"{y}.json")); cols = cf["columns"]
            rows = cf["rows"]; recs = json.load(open(B / "activity" / iso / f"{y}.json"))
            for mo in range(1, 13):
                est_cells = sum(w["ratios"][f"{iso}-{mo:02d}"] * r[cols.index("aqua")] for r in rows if r[cols.index("month")] == mo and r[cols.index("aqua")])
                e = recs[mo - 1]["estimated_viirs_reference_detections"]
                if e is None: continue
                worst = max(worst, abs(est_cells - e) / max(1.0, e)); nchk += 1
        check(nchk > 0 and worst < 1e-3, f"B0_month_ratio AOI estimate recomputed from weights.json + cells: {nchk} months, max rel diff {worst:.2e}")
    # B1 recomputed in plain numpy from features/<aoi>/<year>.json (what the JS port does)
    wb1 = json.load(open(B / "models" / "B1_poisson" / "weights.json"))
    worst, nchk = 0.0, 0
    for aid in sorted(i for i, r in ids.items() if r["features_exported"]):
        for y in (2008, 2016, 2022):
            fp = B / "features" / aid / f"{y}.json"
            ok = check(fp.exists(), f"features/{aid}/{y}.json exists") if y == 2016 else fp.exists()
            if not ok: continue
            d = json.load(open(fp))
            assert d["feature_order"] == wb1["feature_names"]
            nc = len(d["cells"]); dyn = d["rows_columns"][2:]
            X = {f: np.zeros((nc, 12)) for f in dyn}
            for r in d["rows"]:
                for j, f in enumerate(dyn): X[f][int(r[0]), int(r[1]) - 1] = r[2 + j]
            lat = np.array([c[1] for c in d["cells"]])[:, None] * np.ones((1, 12))
            clim = np.array([[np.nan if v is None else v for v in c[2]] for c in d["cells"]])
            mon = np.arange(1, 13)[None, :] * np.ones((nc, 1))
            feat = dict(X); feat["aqua_count_raw"] = X["aqua_count"]; feat["lat"] = lat; feat["aqua_clim"] = clim
            feat["month_sin"] = np.sin(2 * np.pi * (mon - 1) / 12); feat["month_cos"] = np.cos(2 * np.pi * (mon - 1) / 12)
            for k, val in d["derived"]["country_onehot"].items(): feat[k] = np.full((nc, 12), val)
            eta = np.full((nc, 12), wb1["intercept"])
            for j, f in enumerate(wb1["feature_names"]):
                x = feat[f]
                z = np.log1p(np.clip(x, 0, None)) if wb1["transform"][j] == "log1p" else x
                eta = eta + wb1["coef"][j] * (z - wb1["mean"][j]) / wb1["scale"][j]
            rate = np.exp(np.clip(eta, -30, 30)).sum(0)
            for k in range(12):
                ref = d["check"]["b1_sum_by_month"][k]
                if ref is None: continue
                worst = max(worst, abs(rate[k] - ref) / max(1.0, ref)); nchk += 1
    check(nchk > 0 and worst < 2e-3, f"B1 recomputed from features/*.json + weights.json (JS path): {nchk} AOI-months, max rel diff {worst:.2e}")
    check(sorted(p.name for p in (B / "features").iterdir()) == ["AUS-NSW", "BGD", "USA-CA"] and not (B / "features" / "AUS").exists()
          and not (B / "features" / "USA").exists() and not (B / "features" / "BGD-A").exists(), "features exported only for AUS-NSW, BGD and USA-CA")
    check({"country_BGD", "country_AUS", "country_USA"} <= set(wb1["feature_names"]), "B1 weights carry a one-hot term per country (BGD, AUS, USA)")
    check({"BGD-01", "AUS-01", "USA-01", "USA-12"} <= set(json.load(open(B / "models" / "B0_month_ratio" / "weights.json"))["ratios"]), "B0_month_ratio has ratios for BGD, AUS and USA (USA-01..USA-12)")
    rec = list((B / "recent").glob("*.json"))
    if rec:
        rd = json.load(open(rec[0]))
        check(rd["layer"] == "recent_observed_nrt" and rd["not_used_for_training"] is True, f"recent NRT layer clearly labelled ({len(rec)} files)")

    if a.fixture:
        print("== fixture invariants ==")
        def R(aoi, y): return json.load(open(B / "activity" / aoi / f"{y}.json"))
        check(all(r["raw_viirs_reference_detections"] is None and r["static_source_detections_viirs"] is None and r["extract_status"] != "complete"
                  for aoi in ("AUS", "AUS-NSW") for r in R(aoi, 2016)), "AUS & AUS-NSW 2016: VIIRS null (file missing), never 0; not complete")
        j = R("AUS", 2012)[0]
        check(j["extract_status"] == "partial" and j["raw_viirs_reference_detections"] is not None and j["split"] == "backcast"
              and j["estimated_viirs_reference_detections"] is not None and "partial" in j["reason"], "AUS Jan 2012: partial, observed count kept, estimate shown, split backcast")
        check(all(r["split"] == "backcast" for r in R("BGD", 2012)) and all(r["split"] == "backcast" for r in R("BGD", 2003))
              and all(r["split"] == "none" for r in R("BGD", 2002)), "split: 2003–2012 backcast, 2002 none")
        f12 = R("BGD", 2012)[1]
        check(f12["value_status"] in ("observed", "demo") and f12["raw_viirs_reference_detections"] is not None and f12["estimated_viirs_reference_detections"] is not None,
              "2012 (Feb): both observed VIIRS and estimate shown")
        b25 = R("BGD", 2025)
        check(all(r["raw_viirs_reference_detections"] is None for r in b25) and all(r["extract_status"] == "missing" for r in b25[9:])
              and b25[8]["extract_status"] == "partial" and all(r["raw_modis_detections"] is None for r in b25[9:]),
              "BGD 2025: header-only VIIRS → null all year; months after last acq_date missing (not zero); last month partial")
        t08 = R("AUS", 2008)
        check(all(r["raw_modis_terra_detections"] is None and r["extract_status"] == "partial" and r["raw_modis_detections"] is not None for r in t08)
              and all("Terra" in r["reason"] for r in t08), "AUS 2008 Terra outage: Terra field null + noted, record partial, Aqua kept")
        if sel.startswith("B0_"):
            check(all(r["estimated_viirs_reference_detections"] is not None for r in t08), "AUS 2008: B0 estimate unaffected by the Terra outage")
        check(all(r["value_status"] == "demo" for r in R("BGD", 2015)) and man["release_stage"] == "ui_prototype", "synthetic → demo / ui_prototype")
        check(set(ids) == {"BGD", "BGD-A", "BGD-B", "BGD-C", "BGD-D", "BGD-E", "BGD-F", "BGD-G", "AUS", "AUS-NSW", "USA", "USA-CA"} and "BGD-H" not in ids
              and ids["BGD-B"]["name"] == "Chattogram" and ids["BGD-A"]["name"] == "Barishal", "fixture mirrors real NE: 7 divisions, no BGD-H, modern display names")
        check("Lord Howe Island" in ids["AUS-NSW"]["natural_earth_names"], "AU-NSW dissolves NSW + Lord Howe Island")
        check(ids["USA"]["name"] == "United States" and ids["USA"]["country"] == "United States" and ids["USA"]["kind"] == "country"
              and ids["USA-CA"]["name"] == "California" and ids["USA-CA"]["country"] == "United States" and ids["USA-CA"]["kind"] == "admin1"
              and ids["USA-CA"]["parent"] == "USA" and ids["USA-CA"]["iso_3166_2"] == "US-CA" and ids["USA-CA"]["display_kind"] == "State"
              and ids["BGD-C"]["display_kind"] == "Division" and ids["AUS-NSW"]["display_kind"] == "State" and ids["BGD"]["display_kind"] == "Country",
              "USA / USA-CA registry entries: names, display country, kind, parent, iso_3166_2, display_kind")
        check([ids[i]["cells_exported"] for i in ("BGD", "BGD-A", "AUS", "AUS-NSW", "USA", "USA-CA")] == [True, True, False, True, False, True]
              and [ids[i]["features_exported"] for i in ("BGD", "BGD-A", "AUS", "AUS-NSW", "USA", "USA-CA")] == [True, False, False, True, False, True],
              "cells_exported / features_exported flags follow CONTRACT §9 (AUS, USA aggregate-only)")
        check(met["split_manifest"]["countries"] == ["Australia", "Bangladesh", "United_States"], f"3 countries in the split manifest: {met['split_manifest']['countries']}")
        us = [r for y in range(2003, 2025) for r in R("USA", y)]
        check(len(us) == 22 * 12 and all(r["value_status"] == "demo" for r in us if r["split"] != "none") and any(r["raw_modis_detections"] for r in us),
              "USA activity: 22 years × 12 records, synthetic → value_status demo, Aqua counts present")
        usca = [r for y in range(2013, 2021) for r in R("USA-CA", y)]
        check(any(r["raw_viirs_reference_detections"] for r in usca) and all(r["extract_status"] == "complete" for r in usca), "USA-CA 2013-2020: VIIRS reference present, extract complete")
        acv = json.load(open(B / "cells" / "USA-CA" / "2020.json"))
        check(acv["proj"] == "lambert-cea" and acv["cell_size_m"] == 5000 and len(acv["rows"]) > 0
              and all(31.0 < r[2] < 43.0 and -126.0 < r[1] < -113.0 for r in acv["rows"]), f"USA-CA cells are inside California's bounding box ({len(acv['rows'])} rows)")
        bb = ids["USA-CA"]["bbox"]
        check(-125.0 < bb[0] < -123.0 and 31.5 < bb[1] < 33.5 and -115.0 < bb[2] < -113.5 and 41.5 < bb[3] < 43.0, f"USA-CA bbox is California's extent {bb}")
        fig = {p.name for p in (B / "figures").glob("timeseries_*.png")}
        check(fig == {f"timeseries_{i}.png" for i in ("BGD", "AUS", "AUS-NSW", "USA", "USA-CA")}, f"time-series figures: {sorted(fig)}")
        check("panel_memory" in met and met["panel_memory"].get("n_cells", 0) > 0, f"metrics.json carries panel_memory {met.get('panel_memory')}")

    print(f"\n{len(PASSES)} passed, {len(FAILS)} failed")
    if FAILS:
        for f in FAILS: print("  FAILED:", f)
        sys.exit(1)


if __name__ == "__main__":
    main()
