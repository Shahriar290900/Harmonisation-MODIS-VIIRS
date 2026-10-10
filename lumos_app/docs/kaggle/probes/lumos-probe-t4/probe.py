"""Lumos T4 probe. Tiny environment census; writes /kaggle/working/probe_t4.json.
No secrets, no competition data, downloads limited to a few MB."""
import json, os, platform, shutil, subprocess, sys, time, traceback

T0 = time.time()
OUT = "/kaggle/working/probe_t4.json"
R = {"probe": "lumos-probe-t4", "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

def section(name):
    def deco(fn):
        t = time.time()
        try:
            R[name] = fn()
        except BaseException as e:  # noqa
            R[name] = {"error": "%s: %s" % (type(e).__name__, e), "trace": traceback.format_exc()[-1500:]}
        R.setdefault("timings_s", {})[name] = round(time.time() - t, 2)
        print("== %s ==" % name, flush=True)
        print(json.dumps(R[name], indent=1, default=str)[:6000], flush=True)
        save()
        return fn
    return deco

def save():
    try:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(R, f, indent=1, default=str)
    except Exception as e:
        print("save failed", e)

def run(cmd, timeout=60):
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return {"rc": p.returncode, "stdout": p.stdout[-6000:], "stderr": p.stderr[-1500:]}

@section("python")
def _():
    return {"version": sys.version, "executable": sys.executable, "platform": platform.platform(),
            "machine": platform.machine(), "cwd": os.getcwd()}

@section("pip_subset")
def _():
    want = ["torch", "torchvision", "xgboost", "lightgbm", "scikit-learn", "numpy", "pandas", "scipy",
            "pyarrow", "onnx", "onnxruntime", "onnxscript", "pennylane", "pennylane-lightning",
            "transformers", "requests", "shapely", "geopandas"]
    from importlib import metadata
    out = {}
    for w in want:
        try:
            out[w] = metadata.version(w)
        except Exception:
            out[w] = None
    return out

@section("nvidia_smi")
def _():
    return {"full": run(["nvidia-smi"]), "list": run(["nvidia-smi", "-L"]),
            "query": run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version,compute_cap", "--format=csv"])}

@section("torch_cuda")
def _():
    import torch
    d = {"torch": torch.__version__, "cuda_build": torch.version.cuda, "available": torch.cuda.is_available()}
    n = torch.cuda.device_count() if d["available"] else 0
    d["device_count"] = n
    d["arch_list"] = torch.cuda.get_arch_list()
    d["devices"] = []
    for i in range(n):
        p = torch.cuda.get_device_properties(i)
        d["devices"].append({"index": i, "name": p.name, "capability": list(torch.cuda.get_device_capability(i)),
                             "total_mem_gib": round(p.total_memory / 2**30, 2)})
    return d

@section("matmul_smoke")
def _():
    import torch
    res = []
    for i in range(torch.cuda.device_count()):
        try:
            dev = torch.device("cuda:%d" % i)
            w = torch.randn(256, 256, device=dev, requires_grad=True)
            x = torch.randn(64, 256, device=dev)
            y = (x @ w).relu().sum()
            y.backward()
            torch.cuda.synchronize(dev)
            res.append({"device": i, "ok": True, "loss": float(y), "grad_norm": float(w.grad.norm())})
        except Exception as e:
            res.append({"device": i, "ok": False, "error": "%s: %s" % (type(e).__name__, e)})
    return res

@section("xgboost_gpu")
def _():
    import numpy as np, xgboost as xgb
    rng = np.random.RandomState(0)
    X = rng.rand(10000, 20).astype("float32")
    y = (X[:, 0] + X[:, 1] > 1).astype("int32")
    m = xgb.XGBClassifier(n_estimators=20, max_depth=4, device="cuda", tree_method="hist")
    t = time.time()
    m.fit(X, y)
    acc = float((m.predict(X) == y).mean())
    return {"xgboost": xgb.__version__, "ok": True, "train_acc": acc, "fit_s": round(time.time() - t, 2)}

@section("resources")
def _():
    d = {"cpu_count": os.cpu_count()}
    try:
        with open("/proc/meminfo") as f:
            mi = {l.split(":")[0]: l.split(":")[1].strip() for l in f if ":" in l}
        d["mem_total"] = mi.get("MemTotal"); d["mem_available"] = mi.get("MemAvailable")
    except Exception as e:
        d["meminfo_error"] = str(e)
    for p in ("/kaggle/working", "/tmp"):
        try:
            u = shutil.disk_usage(p)
            d["disk_" + p] = {"total_gib": round(u.total / 2**30, 1), "free_gib": round(u.free / 2**30, 1)}
        except Exception as e:
            d["disk_" + p] = str(e)
    return d

@section("pip_download_pennylane")
def _():
    import tempfile
    td = tempfile.mkdtemp(prefix="pld_")
    try:
        r = run([sys.executable, "-m", "pip", "download", "--only-binary=:all:", "--no-deps",
                 "-d", td, "-q", "pennylane"], timeout=120)
        r["files"] = os.listdir(td)
        r["works"] = r["rc"] == 0
        return r
    except subprocess.TimeoutExpired:
        return {"works": False, "error": "timeout 120s"}
    finally:
        shutil.rmtree(td, ignore_errors=True)

@section("http_head_firms")
def _():
    import urllib.request
    url = "https://firms.modaps.eosdis.nasa.gov/data/country/modis/2020/modis_2020_Bangladesh.csv"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "lumos-probe/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return {"status": r.status, "headers": {k: v for k, v in r.headers.items()
                    if k.lower() in ("content-type", "content-length", "last-modified", "server")}}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "reason": str(e.reason), "note": "server reachable (HTTP error)"}

@section("kaggle_input")
def _():
    base = "/kaggle/input"
    if not os.path.isdir(base):
        return {"exists": False}
    return {"exists": True, "entries": sorted(os.listdir(base))[:50]}

R["total_runtime_s"] = round(time.time() - T0, 2)
save()
print("DONE total_runtime_s=%s" % R["total_runtime_s"], flush=True)
