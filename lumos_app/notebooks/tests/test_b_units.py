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

print(f"\n{'ALL UNIT TESTS PASSED' if not FAILS else 'FAILED: ' + str(FAILS)}")
sys.exit(1 if FAILS else 0)
