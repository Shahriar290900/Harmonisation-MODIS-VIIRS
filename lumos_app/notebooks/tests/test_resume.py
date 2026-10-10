#!/usr/bin/env python3
"""Resume / checkpoint tests for Notebook B (quick mode, synthetic fixture).

1. REAL KILL: start B as a script, wait until stages.json records the `panel` checkpoint, SIGKILL the process; rerun → the same
   run folder is auto-resumed, ingest+panel are reused (verified by sha256), the run completes.
2. SIMULATED CRASH in the notebook (nbconvert, LUMOS_STOP_AFTER=export_core) → the app bundle already exists (written before
   Q1/Q2); rerun the notebook → B1/B2/D1 are reused from checkpoints and their validation metrics are bit-identical.
3. TAMPER: corrupt one cached panel array → that stage (and every later one) is recomputed, not trusted.
4. LUMOS_RESUME_RUN=<id> explicit resume; LUMOS_AUTO_RESUME=0 starts a fresh run.

Usage: python test_resume.py [work_dir]
"""
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
NB_PY = HERE.parent / "lumos_B_train.py"
NB = HERE.parent / "lumos_B_train.ipynb"
FIX = HERE.parents[1] / "fixtures" / "out"
FAILS = []


def check(c, m):
    print(("  PASS " if c else "  FAIL ") + m, flush=True)
    if not c: FAILS.append(m)


def env(work, **kw):
    e = dict(os.environ, LUMOS_INPUT=str(FIX), LUMOS_WORK=str(work), LUMOS_QUICK="1")
    for k in ["LUMOS_STOP_AFTER", "LUMOS_RESUME_RUN", "LUMOS_AUTO_RESUME"]: e.pop(k, None)
    e.update({k: str(v) for k, v in kw.items()})
    return e


def runs(work): return sorted(p for p in (work / "runs").iterdir() if p.is_dir()) if (work / "runs").exists() else []


def stages(run): return json.load(open(run / "stages.json"))


def run_script(work, log, **kw):
    with open(log, "w") as f:
        return subprocess.run([sys.executable, str(NB_PY)], env=env(work, **kw), stdout=f, stderr=subprocess.STDOUT, timeout=1800).returncode


def run_nb(work, name, **kw):
    cmd = [sys.executable, "-m", "jupyter", "nbconvert", "--to", "notebook", "--execute", "--ExecutePreprocessor.timeout=1800",
           "--output-dir", str(work), "--output", name, str(NB)]
    r = subprocess.run(cmd, env=env(work, **kw), capture_output=True, text=True, timeout=3600)
    nb = json.load(open(work / name)) if (work / name).exists() else {"cells": []}
    text = "".join("".join(o.get("text", "")) for c in nb["cells"] if c["cell_type"] == "code" for o in c.get("outputs", []) if o.get("output_type") == "stream")
    err = "".join(o.get("ename", "") + ":" + o.get("evalue", "") for c in nb["cells"] if c["cell_type"] == "code" for o in c.get("outputs", []) if o.get("output_type") == "error")
    return r.returncode, text, err + r.stderr[-2000:]


def val_metrics(run):
    m = json.load(open(run / "metrics.json"))["models"]
    return {k: (v.get("val") or {}).get("cell_month", {}).get("all", {}).get("poisson_deviance") for k, v in m.items() if k[:2] in ("B0", "B1", "B2", "D1")}


def main():
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp(prefix="lumosB_resume_"))
    print(f"work: {base}")

    print("== 1. real SIGKILL after the panel checkpoint, then auto-resume ==")
    w1 = base / "kill"; w1.mkdir(parents=True, exist_ok=True)
    p = subprocess.Popen([sys.executable, str(NB_PY)], env=env(w1), stdout=open(w1 / "run1.log", "w"), stderr=subprocess.STDOUT)
    t0 = time.time(); killed = False
    while time.time() - t0 < 600 and p.poll() is None:
        rs = runs(w1)
        if rs and (rs[-1] / "stages.json").exists():
            try:
                if "panel" in stages(rs[-1])["stages"]:
                    os.kill(p.pid, signal.SIGKILL); p.wait(); killed = True; break
            except Exception: pass
        time.sleep(0.2)
    check(killed, f"process SIGKILLed after panel checkpoint ({time.time() - t0:.1f}s)")
    r1 = runs(w1)[-1]; st = stages(r1)
    check(not st["complete"] and {"ingest", "panel"} <= set(st["stages"]), f"stages.json after kill: {list(st['stages'])}, complete={st['complete']}")
    check(not (w1 / "lumos_app_bundle").exists() or "export_core" not in st["stages"], "no export yet")
    rc = run_script(w1, w1 / "run2.log")
    log2 = (w1 / "run2.log").read_text()
    check(rc == 0, "resumed run exits 0")
    check(len(runs(w1)) == 1 and "(RESUMED)" in log2, "same run folder auto-resumed (no new run dir)")
    check("RESUME: stage ingest reused" in log2 and "RESUME: stage panel reused" in log2, "ingest + panel reused (sha256-verified)")
    check(stages(r1)["complete"] is True and len(stages(r1)["resumes"]) == 1, "run marked complete; resume recorded")
    check((w1 / "lumos_app_bundle" / "manifest.json").exists(), "app bundle written")

    print("== 2. notebook: simulated crash after export_core (before Q1/Q2), then resume ==")
    w2 = base / "nb"; w2.mkdir(parents=True, exist_ok=True)
    rc, out, err = run_nb(w2, "crash.ipynb", LUMOS_STOP_AFTER="export_core")
    check(rc != 0 and "LUMOS_STOP_AFTER=export_core" in err, "notebook stopped with simulated crash after export_core")
    check((w2 / "lumos_app_bundle" / "manifest.json").exists() and (w2 / "lumos_app_bundle.zip").exists(),
          "app bundle + zip already exist although the research stages never ran (export-before-Q1/Q2)")
    r2 = runs(w2)[-1]
    m_before = val_metrics(r2)
    man_before = json.load(open(w2 / "lumos_app_bundle" / "manifest.json"))
    check("core" in man_before.get("export_phase", ""), f"bundle phase = {man_before.get('export_phase')}")
    rc, out, err = run_nb(w2, "resume.ipynb")
    check(rc == 0, "resumed notebook run exits 0" + ("" if rc == 0 else f" ({err[-400:]})"))
    for s_ in ["ingest", "panel", "B1_poisson", "B2_xgb", "D1_mlp"]:
        check(f"RESUME: stage {s_} reused" in out, f"stage {s_} reused")
    m_after = val_metrics(r2)
    check(m_before == m_after and all(v is not None for v in m_after.values()), f"validation metrics identical after resume: {m_after}")
    man_after = json.load(open(w2 / "lumos_app_bundle" / "manifest.json"))
    check("final" in man_after.get("export_phase", "") and stages(r2)["complete"], "bundle refreshed with research stages; run complete")
    met = json.load(open(w2 / "lumos_app_bundle" / "metrics.json"))
    check(met["qml_subset_comparison"].get("status") == "ok" and "Q1_vqc" in met["models"], "Q1 metrics appended to metrics.json after export")

    print("== 3. tampered cache is not trusted ==")
    w3 = base / "tamper"; w3.mkdir(parents=True, exist_ok=True)
    rc = run_script(w3, w3 / "a.log", LUMOS_STOP_AFTER="B1_poisson")
    r3 = runs(w3)[-1]
    arr = r3 / "cache" / "panel" / "aqua_count.npy"
    b = bytearray(arr.read_bytes()); b[-1] ^= 0xFF; arr.write_bytes(bytes(b))
    rc = run_script(w3, w3 / "b.log")
    lb = (w3 / "b.log").read_text()
    check(rc == 0 and "RESUME: stage ingest reused" in lb and "artefact cache/panel/aqua_count.npy missing/changed → recompute" in lb,
          "changed panel artefact detected → panel recomputed")
    check("RESUME: stage B1_poisson invalidated (an earlier stage was recomputed)" in lb, "later stage (B1) invalidated too")

    print("== 4. explicit LUMOS_RESUME_RUN and LUMOS_AUTO_RESUME=0 ==")
    w4 = base / "explicit"; w4.mkdir(parents=True, exist_ok=True)
    run_script(w4, w4 / "a.log", LUMOS_STOP_AFTER="ingest")
    rid = runs(w4)[-1].name
    run_script(w4, w4 / "b.log", LUMOS_AUTO_RESUME="0", LUMOS_STOP_AFTER="ingest")
    check(len(runs(w4)) == 2, "LUMOS_AUTO_RESUME=0 starts a fresh run folder")
    rc = run_script(w4, w4 / "c.log", LUMOS_RESUME_RUN=rid)
    lc = (w4 / "c.log").read_text()
    check(rc == 0 and f"run {rid} (RESUMED)" in lc and "RESUME: stage ingest reused" in lc, f"LUMOS_RESUME_RUN={rid} resumes that run")

    print(f"\n{'ALL RESUME TESTS PASSED' if not FAILS else 'FAILED: ' + str(FAILS)}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
