"""Lumos offline rehearsal (T4, Internet OFF, A attached via kernel_sources). No competition data, no secrets."""
import os, sys, json, subprocess, shutil, importlib, traceback
from pathlib import Path
OUT = {}
def step(name):
    def deco(fn):
        try: OUT[name] = fn()
        except Exception as e: OUT[name] = {"error": repr(e), "tb": traceback.format_exc()[-600:]}
        print("==", name, json.dumps(OUT[name], default=str)[:1500], flush=True)
    return deco
@step("input_layout")
def _():
    rows = []
    for d, dn, fn in os.walk("/kaggle/input"):
        dn[:] = sorted(x for x in dn if x != "competitions")
        depth = d.count("/") - 2
        if depth >= 5: dn[:] = []
        rows.append([d, len(fn)])
    return rows[:60]
@step("disk")
def _():
    out = {}
    for p in ["/kaggle/working", "/kaggle/temp", "/tmp"]:
        try: u = shutil.disk_usage(p); out[p] = {"total_gib": round(u.total / 2**30, 1), "free_gib": round(u.free / 2**30, 1)}
        except Exception as e: out[p] = repr(e)
    return out
WH = next(iter(Path("/kaggle/input").rglob("wheelhouse")), None)
@step("wheelhouse")
def _(): return {"path": str(WH), "wheels": sorted(p.name for p in WH.glob("*.whl"))} if WH else {"path": None}
@step("offline_install")
def _():
    from importlib.metadata import version
    cons = Path("/kaggle/working/cons.txt")
    cons.write_text("\n".join(f"{p}=={version(p)}" for p in ["torch", "numpy", "scipy", "pandas", "scikit-learn"]) + "\n")
    res = {}
    for pkg in ["pennylane", "pennylane-lightning", "onnxruntime", "onnxscript"]:
        r = subprocess.run([sys.executable, "-m", "pip", "install", "--no-index", "--find-links", str(WH), "-c", str(cons), pkg],
                           capture_output=True, text=True, timeout=600)
        res[pkg] = {"rc": r.returncode, "err": r.stderr[-300:]}
    importlib.invalidate_caches()
    for m in ["pennylane", "pennylane_lightning", "onnxruntime", "onnxscript"]:
        try: importlib.import_module(m); res["import_" + m] = True
        except Exception as e: res["import_" + m] = repr(e)[:200]
    return res
@step("onnx_export")
def _():
    import torch, numpy as np
    m = torch.nn.Sequential(torch.nn.Linear(4, 8), torch.nn.Tanh(), torch.nn.Linear(8, 1)).eval()
    x = torch.randn(4, 4); res = {}
    for tag, kw in [("legacy_dynamo_false", {"dynamo": False}), ("default", {})]:
        p = f"/kaggle/working/t_{tag}.onnx"
        try:
            torch.onnx.export(m, x, p, input_names=["x"], output_names=["y"], dynamic_axes={"x": {0: "n"}, "y": {0: "n"}}, opset_version=17, **kw)
            res[tag] = {"ok": True}
            try:
                import onnxruntime as ort
                y = ort.InferenceSession(p, providers=["CPUExecutionProvider"]).run(None, {"x": x.numpy()})[0]
                res[tag]["parity"] = bool(np.allclose(y, m(x).detach().numpy(), atol=1e-5))
            except Exception as e: res[tag]["ort"] = repr(e)[:150]
        except Exception as e: res[tag] = {"ok": False, "err": repr(e)[:300]}
    return res
@step("gpu")
def _():
    import torch
    return {"torch": torch.__version__, "n": torch.cuda.device_count(), "bf16_supported": torch.cuda.is_bf16_supported() if torch.cuda.is_available() else None}
Path("/kaggle/working/rehearsal.json").write_text(json.dumps(OUT, indent=1, default=str))
