"""Lumos RTX PRO 6000 probe. Tiny environment census; writes /kaggle/working/probe_rtx.json.
Internet is OFF on this kernel: outbound tests are expected to FAIL and that is recorded as expected.
Does NOT read competition data (only lists top-level names under /kaggle/input) and never submits.
Same section layout as probes/lumos-probe-t4/probe.py, plus Blackwell-specific checks."""
import json, os, platform, shutil, subprocess, sys, time, traceback

T0 = time.time()
OUT = os.environ.get("LUMOS_PROBE_OUT", "/kaggle/working/probe_rtx.json")
SKIP_NET = os.environ.get("LUMOS_PROBE_SKIP_NET") == "1"   # local dry-run only
R = {"probe": "lumos-probe-rtx", "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


def save():
    try:
        os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
        with open(OUT, "w") as f:
            json.dump(R, f, indent=1, default=str)
    except Exception as e:
        print("save failed", e)


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


def run(cmd, timeout=60):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return {"rc": p.returncode, "stdout": p.stdout[-6000:], "stderr": p.stderr[-1500:]}
    except FileNotFoundError as e:
        return {"rc": None, "error": "not found: %s" % e}
    except subprocess.TimeoutExpired:
        return {"rc": None, "error": "timeout %ss" % timeout}


@section("python")
def _():
    return {"version": sys.version, "executable": sys.executable, "platform": platform.platform(),
            "machine": platform.machine(), "cwd": os.getcwd()}


@section("pip_subset")
def _():
    want = ["torch", "torchvision", "xgboost", "lightgbm", "scikit-learn", "numpy", "pandas", "scipy",
            "pyarrow", "onnx", "onnxruntime", "onnxscript", "pennylane", "pennylane-lightning",
            "transformers", "requests", "shapely", "geopandas", "nvidia-cublas-cu12", "nvidia-cudnn-cu12"]
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
            "query": run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version,compute_cap",
                          "--format=csv"])}


@section("torch_cuda")
def _():
    import torch
    d = {"torch": torch.__version__, "cuda_build": torch.version.cuda, "available": torch.cuda.is_available()}
    n = torch.cuda.device_count() if d["available"] else 0
    d["device_count"] = n
    arch = list(torch.cuda.get_arch_list())
    d["arch_list"] = arch
    # sm_120 SASS, or compute_120 PTX (JIT-able on Blackwell), or any sm_12x
    d["arch_has_sm_120"] = any(a in ("sm_120", "compute_120") or a.startswith("sm_12") for a in arch)
    d["arch_has_sm_120_sass"] = "sm_120" in arch
    d["devices"] = []
    for i in range(n):
        p = torch.cuda.get_device_properties(i)
        free_b, total_b = torch.cuda.mem_get_info(i)
        d["devices"].append({"index": i, "name": p.name, "capability": list(torch.cuda.get_device_capability(i)),
                             "total_mem_gib": round(p.total_memory / 2**30, 2),
                             "free_mem_gib": round(free_b / 2**30, 2),
                             "sm_count": getattr(p, "multi_processor_count", None)})
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


@section("bf16_matmul")
def _():
    import torch
    dev = torch.device("cuda:0")
    out = {"bf16_supported_flag": bool(torch.cuda.is_bf16_supported())}
    a = torch.randn(4096, 4096, device=dev, dtype=torch.bfloat16)
    b = torch.randn(4096, 4096, device=dev, dtype=torch.bfloat16)
    c = a @ b
    torch.cuda.synchronize(dev)
    iters = 10
    t = time.time()
    for _i in range(iters):
        c = a @ b
    torch.cuda.synchronize(dev)
    dt = time.time() - t
    ref = (a[:64].float() @ b.float())          # fp32 reference on 64 rows
    err = float((c[:64].float() - ref).abs().max())
    scale = float(ref.abs().max())
    out.update({"ok": bool(torch.isfinite(c.float()).all()), "tflops_bf16": round(2 * 4096 ** 3 * iters / dt / 1e12, 2),
                "max_abs_err_vs_fp32_rows": round(err, 3), "ref_abs_max": round(scale, 3),
                "rel_err": round(err / max(scale, 1e-9), 4), "dtype": str(c.dtype)})
    out["ok"] = out["ok"] and out["rel_err"] < 0.05
    del a, b, c
    torch.cuda.empty_cache()
    return out


@section("vram")
def _():
    import torch
    d = {}
    free_b, total_b = torch.cuda.mem_get_info(0)
    d["free_gib"] = round(free_b / 2**30, 2)
    d["total_gib"] = round(total_b / 2**30, 2)
    # modest allocation proof: 8 GiB tensor (not a stress test), skipped if less than 16 GiB free
    if free_b > 16 * 2**30:
        x = torch.empty(8 * 2**30, dtype=torch.uint8, device="cuda:0")
        x.fill_(1)
        torch.cuda.synchronize()
        d["alloc_8gib_ok"] = True
        d["max_allocated_gib"] = round(torch.cuda.max_memory_allocated(0) / 2**30, 2)
        del x
        torch.cuda.empty_cache()
    else:
        d["alloc_8gib_ok"] = None
    return d


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
    return {"xgboost": xgb.__version__, "ok": acc > 0.9, "train_acc": acc, "fit_s": round(time.time() - t, 2)}


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


# ---- outbound tests: internet is OFF here, so failure is the EXPECTED result ----
@section("pip_download_pennylane")
def _():
    if SKIP_NET:
        return {"skipped": True}
    import tempfile
    td = tempfile.mkdtemp(prefix="pld_")
    try:
        r = run([sys.executable, "-m", "pip", "download", "--only-binary=:all:", "--no-deps", "--retries", "0",
                 "--timeout", "10", "-d", td, "-q", "pennylane"], timeout=90)
        r["files"] = os.listdir(td)
        r["works"] = r.get("rc") == 0
        r["expected_to_fail"] = True
        r["as_expected"] = not r["works"]
        return r
    finally:
        shutil.rmtree(td, ignore_errors=True)


@section("http_head_firms")
def _():
    if SKIP_NET:
        return {"skipped": True}
    import urllib.request, urllib.error
    url = "https://firms.modaps.eosdis.nasa.gov/data/country/modis/2020/modis_2020_Bangladesh.csv"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "lumos-probe/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return {"reachable": True, "status": r.status, "expected_to_fail": True, "as_expected": False}
    except urllib.error.HTTPError as e:
        return {"reachable": True, "status": e.code, "expected_to_fail": True, "as_expected": False}
    except Exception as e:
        return {"reachable": False, "error": "%s: %s" % (type(e).__name__, str(e)[:300]),
                "expected_to_fail": True, "as_expected": True}


@section("kaggle_input")
def _():
    base = "/kaggle/input"   # top-level names only; competition contents are never opened
    if not os.path.isdir(base):
        return {"exists": False}
    return {"exists": True, "entries": sorted(os.listdir(base))[:50]}


@section("verdict")
def _():
    tc = R.get("torch_cuda") or {}
    bf = R.get("bf16_matmul") or {}
    mm = R.get("matmul_smoke") or []
    xg = R.get("xgboost_gpu") or {}
    devs = tc.get("devices") or []
    d0 = devs[0] if devs else {}
    cap = d0.get("capability") or [0, 0]
    name = str(d0.get("name", ""))
    is_blackwell_dev = cap[0] >= 12 or "blackwell" in name.lower() or "rtx pro 6000" in name.lower()
    checks = {
        "cuda_available": bool(tc.get("available")),
        "device_is_blackwell": bool(is_blackwell_dev),
        "arch_list_has_sm_120": bool(tc.get("arch_has_sm_120")),
        "fp32_matmul_backward_ok": bool(mm) and all(m.get("ok") for m in mm),
        "bf16_matmul_ok": bool(bf.get("ok")),
    }
    net = [R.get(k, {}) for k in ("pip_download_pennylane", "http_head_firms")]
    return {
        "blackwell_torch_ok": all(checks.values()),
        "checks": checks,
        "xgboost_gpu_ok": bool(xg.get("ok")),
        "device_name": name,
        "capability": cap,
        "vram_total_gib": d0.get("total_mem_gib"),
        "torch": tc.get("torch"),
        "torch_cuda_build": tc.get("cuda_build"),
        "internet_off_as_expected": all(n.get("as_expected", n.get("skipped", False)) for n in net),
        "hint": None if all(checks.values()) else
                "If device_is_blackwell but arch_list_has_sm_120 or matmul fails: torch in this image lacks sm_120; "
                "retry with docker_image_pinning_type 'latest' (UI: Environment -> Always use latest).",
    }


R["total_runtime_s"] = round(time.time() - T0, 2)
save()
print("blackwell_torch_ok=%s" % R["verdict"].get("blackwell_torch_ok") if isinstance(R.get("verdict"), dict) else "verdict missing", flush=True)
print("DONE total_runtime_s=%s" % R["total_runtime_s"], flush=True)
