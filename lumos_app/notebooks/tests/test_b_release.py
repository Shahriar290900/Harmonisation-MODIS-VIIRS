#!/usr/bin/env python3
"""Unit tests of Notebook B's PER-REGION release gate (review H1) and of the region-level interval-coverage field (review M2).

The 2.12 release code and `region_interval_coverage` are extracted from lumos_B_train.py and executed on fabricated per-region metrics, so
every branch (validated, observed, boundary coverage, B0 selected, synthetic, missing region) is exercised without a training run.
Usage: LUMOS_INPUT=<fixture out> LUMOS_WORK=<scratch> python test_b_release.py
"""
import copy
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LUMOS_AUTO_RESUME", "0")
os.environ.setdefault("LUMOS_QUICK", "1")
from _exec_upto import exec_upto, SRC  # noqa: E402

FAILS = []
def check(c, m):
    print(("  PASS " if c else "  FAIL ") + m, flush=True)
    if not c: FAILS.append(m)

text = open(SRC, encoding="utf-8").read()
base = exec_upto("INGEST (contract")
VM_SRC = text[text.index("def vm("):text.index("# Gate MAE is measured")]
REL = text[text.index("sel_test = MODELS[SELECTED].get"):text.index('log(f"RELEASE STAGE: {RELEASE_STAGE} — {RELEASE_REASON}")') + len('log(f"RELEASE STAGE: {RELEASE_STAGE} — {RELEASE_REASON}")')]
RIC_SRC = text[text.index("def region_interval_coverage("):text.index("def activity_records(")]

UNITS = ["BGD", "AUS-NSW", "USA-CA"]
AOIS = [{"aoi_id": i, "name": n, "country": c, "kind": k} for i, n, c, k in [
    ("BGD", "Bangladesh", "Bangladesh", "country"), ("BGD-A", "Barishal", "Bangladesh", "admin1"),
    ("AUS", "Australia", "Australia", "country"), ("AUS-NSW", "New South Wales", "Australia", "admin1"),
    ("USA", "United States", "United_States", "country"), ("USA-CA", "California", "United_States", "admin1")]]

def models(sel, mae, cov):
    """mae[model][aoi] → test AOI-month MAE; cov[aoi] → (coverage, n) of the selected model's interval."""
    M = {}
    for mid, per in mae.items():
        M[mid] = {"test": {"aoi_month": {f"aoi:{a}": {"mae": v, "n": 24} for a, v in per.items()}}}
    M[sel]["interval"] = {"test_coverage_by_aoi": {a: {"coverage": c, "n": n, "gated": a in UNITS} for a, (c, n) in cov.items()}}
    return M

GOOD_MAE = {"B2_xgb": {"BGD": 10, "AUS-NSW": 50, "USA-CA": 60, "AUS": 900, "USA": 1500, "BGD-A": 3},
            "B0_identity": {"BGD": 40, "AUS-NSW": 90, "USA-CA": 120, "AUS": 800, "USA": 1000, "BGD-A": 8},
            "B0_month_ratio": {"BGD": 12, "AUS-NSW": 55, "USA-CA": 70, "AUS": 700, "USA": 900, "BGD-A": 4}}
GOOD_COV = {"BGD": (0.79, 24), "AUS-NSW": (0.83, 24), "USA-CA": (0.71, 24), "AUS": (0.5, 24), "USA": (0.4, 24), "BGD-A": (0.9, 24)}

def run(sel="B2_xgb", mae=None, cov=None, synthetic=False, present=UNITS, absent=()):
    ns = dict(base)
    ns.update(MODELS=models(sel, copy.deepcopy(mae or GOOD_MAE), copy.deepcopy(cov or GOOD_COV)), SELECTED=sel, SYNTHETIC=synthetic,
              GATE={"selection_reason": "test"}, GATE_UNITS_PRESENT=list(present), GATE_UNITS_ABSENT=list(absent), AOIS=AOIS, AOI_BY_ID={a["aoi_id"]: a for a in AOIS})
    ns["LOG_LINES"] = []
    ns["log"] = lambda m: ns["LOG_LINES"].append(m)
    exec(compile(VM_SRC, SRC, "exec"), ns)      # vm / tmae must see THIS scenario's MODELS (functions bind to the namespace they are exec'd in)
    exec(compile(REL, SRC, "exec"), ns)
    return ns

print("== per-region release gate (H1) ==")
ns = run()
check(ns["RELEASE_STAGE"] == "validated_calibration" and all(r["stage"] == "validated_calibration" for r in ns["REGION_RELEASE"].values()),
      f"selected beats both baselines and coverage within ±0.10 in every gated region → validated_calibration: { {u: r['stage'] for u, r in ns['REGION_RELEASE'].items()} }")
check(set(ns["REPORTED_SEPARATELY"]) == {"AUS", "USA", "BGD-A"} and ns["REPORTED_SEPARATELY"]["AUS"]["interval_test_coverage"] == 0.5,
      "whole-country AUS / USA and the BGD division are reported separately (their poor numbers do not enter the gate)")
check(any(l.startswith("RELEASE REGION BGD") for l in ns["LOG_LINES"]) and sum(l.startswith("RELEASE REGION") for l in ns["LOG_LINES"]) == 3, "one RELEASE REGION line per gated region")

m = copy.deepcopy(GOOD_MAE); m["B2_xgb"]["AUS-NSW"] = 56   # worse than B0_month_ratio (55) in NSW only
ns = run(mae=m)
check(ns["REGION_RELEASE"]["AUS-NSW"]["stage"] == "observed_comparison" and ns["REGION_RELEASE"]["BGD"]["stage"] == "validated_calibration"
      and ns["RELEASE_STAGE"] == "observed_comparison", "one region failing a baseline → that region observed_comparison, overall = weakest = observed_comparison, other regions keep their own stage")
check("does not beat B0_month_ratio" in ns["RELEASE_REASON"] and "AUS-NSW" in ns["RELEASE_REASON"] and "BGD" in ns["RELEASE_REASON"] and "USA-CA" in ns["RELEASE_REASON"],
      "release_reason lists every region's outcome and the failing reason")

m = copy.deepcopy(GOOD_MAE); m["B2_xgb"]["AUS-NSW"] = 100   # worse than B0_identity too
ns = run(mae=m)
check(ns["REGION_RELEASE"]["AUS-NSW"]["reasons_not_validated"] == ["does not beat B0_identity", "does not beat B0_month_ratio"], f"both baseline failures named: {ns['REGION_RELEASE']['AUS-NSW']['reasons_not_validated']}")

# a whole-country AUS that the model loses badly must NOT block the gated regions (not gated), and an excellent AUS must NOT rescue a failing region
m = copy.deepcopy(GOOD_MAE); m["B2_xgb"]["AUS"] = 99999
check(run(mae=m)["RELEASE_STAGE"] == "validated_calibration", "terrible whole-country AUS / USA numbers do not decide the gate (reported separately)")
m = copy.deepcopy(GOOD_MAE); m["B2_xgb"]["AUS"] = 1; m["B2_xgb"]["USA-CA"] = 500
ns = run(mae=m)
check(ns["RELEASE_STAGE"] == "observed_comparison" and ns["REGION_RELEASE"]["USA-CA"]["stage"] == "observed_comparison", "a great whole-country number cannot rescue a failing gated region")

print("== interval coverage tolerance per region ==")
for c, ok in [(0.70, True), (0.90, True), (0.6958, False), (0.9167, False), (0.80, True)]:
    cv = dict(GOOD_COV); cv["USA-CA"] = (c, 24)
    ns = run(cov=cv)
    check(ns["REGION_RELEASE"]["USA-CA"]["coverage_ok"] == ok and (ns["RELEASE_STAGE"] == "validated_calibration") == ok, f"USA-CA coverage {c} → coverage_ok={ok}")
cv = dict(GOOD_COV); cv["BGD"] = (None, None)
ns = run(cov=cv)
check(ns["REGION_RELEASE"]["BGD"]["stage"] == "observed_comparison" and "no interval coverage measured" in ns["REGION_RELEASE"]["BGD"]["reasons_not_validated"], "unmeasured region coverage → not validated")
check("24 AOI-months" in run()["RELEASE_REASON"] or "standard error" in run()["RELEASE_REASON"], "reason warns that n=24 coverage is coarse")

print("== B0 selected, synthetic, missing regions ==")
ns = run(sel="B0_month_ratio", mae={**GOOD_MAE, "B0_month_ratio": {"BGD": 1, "AUS-NSW": 1, "USA-CA": 1, "AUS": 1, "USA": 1, "BGD-A": 1}})
check(ns["RELEASE_STAGE"] == "observed_comparison" and "by construction" in ns["RELEASE_REASON"], "selected B0_month_ratio can never be validated (cannot beat itself) → observed_comparison")
ns = run(synthetic=True)
check(ns["RELEASE_STAGE"] == "ui_prototype" and all(r["stage"] == "ui_prototype" and r["stage_if_real"] == "validated_calibration" for r in ns["REGION_RELEASE"].values()),
      "synthetic data → ui_prototype everywhere; the would-be stage is recorded as stage_if_real")
ns = run(present=["BGD", "AUS-NSW"], absent=["USA-CA"])
check(set(ns["REGION_RELEASE"]) == {"BGD", "AUS-NSW"} and ns["RELEASE_STAGE"] == "validated_calibration" and "USA-CA" in ns["RELEASE_REASON"],
      "a gated region that is not in the bundle is not gated but is named in the reason")
ns = run(present=[])
check(ns["RELEASE_STAGE"] == "observed_comparison" and "no gated region could be evaluated" in ns["RELEASE_REASON"], "no evaluable region → observed_comparison with a reason")

print("== interval_empirical_holdout_coverage per AOI (M2) ==")
ns = run()
SI = ns["MODELS"]["B2_xgb"]["interval"]
base.update(GATE_UNITS_PRESENT=UNITS, SEL_INTERVAL=SI)
exec(compile(RIC_SRC, SRC, "exec"), base)
f = base["region_interval_coverage"]
v, note = f(AOIS[0]); check(v == 0.79 and "BGD" in note and "n=24" in note, f"BGD → its own region coverage {v}")
v, note = f(AOIS[3]); check(v == 0.83, f"AUS-NSW → its own coverage {v}")
v, note = f(AOIS[5]); check(v == 0.71, f"USA-CA → its own coverage {v}")
v, note = f(AOIS[2]); check(v is None and "whole-country AUS" in note and "null" in note, "whole-country AUS → null + documented reason")
v, note = f(AOIS[4]); check(v is None and "whole-country USA" in note, "whole-country USA → null + documented reason")
v, note = f(AOIS[1]); check(v is None and "without its own test evaluation" in note, "BGD division → null + documented reason")
base["SEL_INTERVAL"] = {"test_coverage_by_aoi": {}}
v, note = f(AOIS[0]); check(v is None and "no test AOI-months" in note, "gated region without test AOI-months → null + reason")

print(f"\n{'ALL RELEASE TESTS PASSED' if not FAILS else 'FAILED: ' + str(FAILS)}")
sys.exit(1 if FAILS else 0)
