# Kaggle environment report for Notebooks A and B (K7-ANALYST, 2026-10-10)

Sources read: `CLI_NOTES.md`, `ACCOUNT_PROBE.md`, `KAGGLE_DOCS_FINDINGS.md`, `probes/*/output/*.json` and logs, `messages/*`, `heartbeat/*`, plus `notebooks/lumos_A_fetch.py` (section 1.9) and `notebooks/lumos_B_train.py` (sections 2.2 to 2.4, 2.9, 2.10, 2.14, 2.16), read only. Nothing was edited, pushed or run by this role.

Labels used below:
- MEASURED = seen in the probe output of the two Kaggle runs (`lumos-probe-t4`, `lumos-probe-rtx`).
- READ = taken from the notebook source or from earlier notes, no run behind it.
- UNVERIFIED = inference or not tested.

## 1. Summary

1. Notebook B's GPU stack works on the RTX PRO 6000 Blackwell. MEASURED on the environment Kaggle assigns to a new CLI-pushed kernel: torch 2.11.0+cu128 has `sm_120` SASS, fp32 forward/backward, a bf16 matmul (346 TFLOPs on a 4096x4096 test) and an 8 GiB allocation all pass, and XGBoost 3.4.1 trains on the GPU. No image change and no "latest" pinning was needed.
2. The fallback T4 x2 (`machine_shape: NvidiaTeslaT4`) also works for the GPU libraries, but it has 4 CPUs and 31 GiB RAM against 48 CPUs and 177 GiB on the RTX machine. RAM, not the GPU, is the real risk for B there.
3. Notebook A's wheelhouse does not match what B installs. A downloads `onnx` and `onnxscript` but B never installs them, and nobody supplies `onnxruntime`. The image has no `onnxruntime`, `onnxscript` or `pennylane`. Details and proposed diffs are in sections 4 and 5.
4. The "RTX needs the ARC-AGI-3 competition attached" path carries the policy risk recorded in `KAGGLE_DOCS_FINDINGS.md` section 3. The owner has said to go ahead with a new notebook; this report only repeats that a multi-hour Lumos run there is a bigger exposure than the 87 s probe was. The T4 x2 fallback avoids the competition entirely.

## 2. Environment comparison

Both probes were CLI-pushed `script` kernels with no pinning field set, so Kaggle assigned the image itself.

| Item | T4 x2, Internet ON (`lumos-probe-t4`) | RTX PRO 6000, Internet OFF (`lumos-probe-rtx`) | Evidence |
|---|---|---|---|
| Metadata used | `machine_shape NvidiaTeslaT4`, `enable_internet true`, no competition | `machine_shape NvidiaRtxPro6000`, `enable_internet false`, `competition_sources [arc-prize-2026-arc-agi-3]` | MEASURED (pull -m after the run showed the same shape and internet flag for RTX) |
| Accelerator granted | 2 x Tesla T4, cc 7.5, 14.56 GiB each | 1 x NVIDIA RTX PRO 6000 Blackwell Server Edition, cc 12.0, 188 SMs, 94.97 GiB, 600 W cap | MEASURED (`nvidia-smi -L`, `torch.cuda.device_count()`) |
| Driver / CUDA (driver side) | 580.178.04 / CUDA 13.0 | 580.178.04 / CUDA 13.0 | MEASURED |
| Docker image digest | not recorded (no `pull -m` after the T4 run) | `gcr.io/kaggle-private-byod/python@sha256:2757e0c7...` (same digest as the owner's `qml-qllm`) | MEASURED for RTX only |
| Python | 3.13.15 (build of 6 Aug 2026), Linux 6.18.48 | 3.13.15, same build string | MEASURED |
| torch / torchvision | 2.11.0+cu128 / 0.26.0+cu128 | 2.11.0+cu128 / 0.26.0+cu128 | MEASURED |
| torch arch list | sm_75, sm_80, sm_86, sm_90, sm_100, sm_120 | same list; `arch_has_sm_120_sass: true` | MEASURED |
| xgboost GPU | 3.4.1, GPU fit ok (0.33 s tiny fit) | 3.4.1, GPU fit ok (0.38 s tiny fit) | MEASURED |
| Other libs | lightgbm 4.6.0, scikit-learn 1.6.1, numpy 2.1.3, pandas 2.3.3, scipy 1.16.3, pyarrow 23.0.1, transformers 5.16.1, shapely 2.1.2, geopandas 1.1.4, requests 2.34.2, nvidia-cublas-cu12 12.8.4.1, nvidia-cudnn-cu12 9.19.0.56 | identical versions | MEASURED |
| onnx | 1.22.0 present | 1.22.0 present | MEASURED |
| onnxruntime, onnxscript | absent | absent | MEASURED |
| pennylane, pennylane-lightning | absent | absent | MEASURED |
| `pip download pennylane` | works (`--no-deps`, one pure-python wheel `pennylane-0.45.1-py3-none-any.whl`, 5.4 MB) | fails: "No matching distribution" | MEASURED |
| Internet | HEAD to a FIRMS-type URL returned 200 | DNS failure, no route | MEASURED |
| CPU cores | 4 | 48 | MEASURED |
| RAM | 31.35 GiB total (32,869,448 kB), 29.5 GiB available at start | 176.9 GiB total (185,472,896 kB), 173.3 GiB available | MEASURED |
| `/kaggle/working` | 19.5 GiB total, 19.5 free | 19.5 GiB total, 19.5 free (owner's UI shows about 57.6 GiB; not reconciled) | MEASURED |
| `/kaggle/temp` | not probed | not probed | NOT MEASURED |
| `/tmp` | reports 8,156.9 GiB total / 1,069.9 free (shared host filesystem, not a usable quota figure) | same | MEASURED, but misleading |
| `/kaggle/input` | empty | contains one top-level entry `competitions` (names only, no data read) | MEASURED |
| GPU smoke tests | fp32 matmul + backward ok on both GPUs | fp32 matmul + backward ok; bf16 matmul ok (rel err 0.003); 8 GiB alloc ok | MEASURED |
| Script runtime | 13.67 s | 87.28 s | MEASURED |
| Weekly GPU quota after both probes | 29.92 h left of 30 h (0.08 h used), refresh 2026-10-17 | | MEASURED (K6) |

Things the table does not settle:
- Whether the RTX machine bills GPU quota faster than 1 h per hour (ARC docs say it "burns GPU quota faster", multiplier unknown). The two probes together cost 0.03 h, too little to separate it from startup time.
- Whether a T4 or CPU session sees the same image digest as the RTX one. Python 3.13.15 (same build string) and identical package versions on both probes make it very likely, but the digest was only recorded for RTX.
- The CPU-only image has not been probed at all.

## 3. Verdict on running Notebook B

### 3.1 RTX PRO 6000 Blackwell

| Environment | Verdict | Reason |
|---|---|---|
| Default environment assigned by Kaggle to a new CLI-pushed kernel (digest `2757e0c7...`; this is "the original environment" of a freshly created notebook) | PASS for the GPU parts: B2 (XGBoost, `device: cuda`), D1 (torch, bf16 autocast), the Q1 simulator (complex64 torch) and the device probe in 2.3 will find `sm_120` and run | MEASURED probe, but with tiny workloads only. B itself has not run on Kaggle. |
| "Latest" environment (`docker_image_pinning_type: "latest"` or the UI dropdown) | NOT NEEDED, NOT TESTED | The default already passes. Do not switch to chase it. |
| Old pinned images from the owner's other notebooks (`81b1e7c4...`, `dafd4ce5...`, `37c64f7d...`, `7a9d2a6b...`) | UNKNOWN. Do not use them for B | Their torch versions were never printed. K3 found that an old cu121 torch (2.4.0) fails on an RTX PRO 6000 with "no kernel image is available". |

Practical answer to "pinned or latest": for a new notebook, leave the environment alone. The UI's "Pin to original environment" then pins to the image current at creation, which is the verified one. After the first real run record the image digest (`kernels pull -m`) next to the results, so a later re-run can be compared. Do not import the owner's old notebooks' environment.

Open point, untested: B is a `notebook` kernel with `kernel_sources` and a competition source at once. The verified RTX grant was a `script` kernel with only the competition source. The five existing RTX notebooks of the owner are `notebook` type with a competition source, so the combination is likely fine, but check `machine_shape` after the push (runbook step R5).

### 3.2 T4 x2 as the fallback

| Aspect | Result |
|---|---|
| Libraries | MEASURED: torch (sm_75 SASS present), XGBoost GPU, matmul fwd/bwd all ok on both T4s |
| GPUs used | B uses `cuda:0` only (device handling in 2.3, 2.9, 2.10 is single-device). The second T4 stays idle. READ |
| VRAM | 14.56 GiB on the used GPU. D1 and B2 data are put on the GPU whole (`torch.tensor(..., device=dev)`), so the biggest training tensors must fit in about 14 GiB. UNVERIFIED for real data |
| RAM | 31.35 GiB. 2.6 warns when the estimated panel exceeds 60% of free RAM (about 18 GiB here). The US panel size is unmeasured (STATUS.md says so). This is the most likely T4 failure. B resumes from the ingest checkpoint after an out-of-memory kill |
| CPU | 4 cores against 48. The ingest and panel stages are CPU-bound pandas/numpy, so expect them to take noticeably longer. Not measured |
| bf16 | T4 (cc 7.5) has no native bf16. D1 sets `use_amp = DEVICE == "cuda"` and autocasts to bfloat16 unconditionally. It may run slowly or emulated. Not tested. See diff P5 |
| Q2 (LLM) | A 7B model in bf16 is about 15 GB; the cap in `llm_size_cap` is 0.85 x free VRAM (about 12 GiB), so it would be reported `too_large` and Q2 skipped. Fine, B handles that |
| Competition | Not needed. No ARC exposure |
| Internet | May be left OFF, which also mimics the RTX run. B blocks sockets anyway |

Overall: B can run on T4 x2 with Internet OFF and no competition, expected slower and RAM-limited. Use it first if the owner wants a no-policy-risk rehearsal, or as the fallback when the RTX grant fails.

## 4. Wheelhouse: what A must provide for B's offline install

### 4.1 What the code does (READ)

Notebook A, section 1.9 (`lumos_A_fetch.py`, `WHEELS` list and `build_wheelhouse`):
- `WHEELS = ["pennylane", "pennylane-lightning", "onnx", "onnxscript"]`, plus `xgboost` only if it is not installed (it is installed, so not added).
- For each name it runs `python -m pip download --only-binary=:all: -d lumos_bundle/wheelhouse <name>`, one package per call. Each call pulls that package's whole dependency tree, even for dependencies already installed in the image.
- No version pins. It records the Python version and the success/failure of each package in `env_A.json` and `README_bundle.md`.

Notebook B, section 2.4 (`lumos_B_train.py`, `try_offline_install`):
- Default packages: `("pennylane", "pennylane-lightning")` only. Nothing else is installed.
- Command: `pip install --no-index --find-links <bundle>/wheelhouse -c <constraints> <pkg>`, with the constraints file pinning `torch`, `numpy`, `scipy`, `pandas`, `scikit-learn` to the installed versions. If that fails, it retries with `--no-deps`. Then it imports `pennylane`; if the import fails, Q1 uses the built-in torch simulator and skips the PennyLane cross-check.
- `PIP_NO_INDEX=1` is set for the whole session in 2.2.
- B's 2.14 ONNX export (`export_onnx`) uses `torch.onnx.export(..., dynamo=False, opset_version=17)` and checks parity with `onnxruntime` if it can be imported; otherwise it records `passed: None` ("onnxruntime not installed; parity not checked"). B's own "Done when" list for 2.14 expects `ONNX parity ... passed true`.

### 4.2 Exact package list the wheelhouse must provide

Needed because the image lacks them (MEASURED on both probes):

| Package | Needed by | In A's `WHEELS` today | Installed by B today |
|---|---|---|---|
| pennylane | 2.4 / Q1 cross-check (optional) | yes | yes |
| pennylane-lightning | Q1 cross-check (optional) | yes | yes |
| pennylane's pure-python and compiled dependencies (resolved by `pip download`, for example numpy, scipy, networkx, rustworkx, autograd, autoray, cachetools, tomlkit, appdirs, packaging, typing_extensions, requests and Lightning's own dependencies; the exact list depends on the pennylane release and is UNVERIFIED) | pennylane import | yes, as a side effect of `pip download` | yes via resolver, or missing if the `--no-deps` retry fires |
| onnxruntime | ONNX parity check in 2.14 | NO | NO |
| onnxscript (and its dependency `onnx_ir`, UNVERIFIED) | `torch.onnx.export` if it ever takes the dynamo path (the `except TypeError` fallback in `export_onnx` does) | yes (download only) | NO |
| onnx | export helper | yes (download only) | NO, and not needed: image has 1.22.0 |

Packages already in the image and therefore not needed in the wheelhouse: torch, torchvision, xgboost, lightgbm, scikit-learn, numpy, pandas, scipy, pyarrow, onnx, transformers, shapely, geopandas, requests.

### 4.3 Mismatches and risks

| # | Mismatch | Effect | Status |
|---|---|---|---|
| W1 | `onnxruntime` is in neither A's list nor B's install | ONNX parity can never pass: it is recorded as `passed: None`, contradicting B's own check list in 2.14 | READ + MEASURED (absent in image) |
| W2 | A downloads `onnx` and `onnxscript`, B installs neither | wasted download; and if `torch.onnx.export` ever needs onnxscript, the D1 export fails and is only logged ("ONNX export failed") | READ |
| W3 | Constraint file pins `numpy==2.1.3`, `scipy==1.16.3` and so on, but the wheelhouse holds the latest numpy/scipy wheels that `pip download` fetched | If the newest pennylane needs a newer numpy than 2.1.3, the resolver fails, B retries with `--no-deps`, and pennylane then misses its dependencies (rustworkx, autograd, autoray and others) so `import pennylane` fails. B degrades honestly to the built-in simulator, but PennyLane is lost | UNVERIFIED; the T4 probe only downloaded `pennylane --no-deps` (one 5.4 MB wheel), so the dependency closure was never resolved on Kaggle |
| W4 | `pennylane-lightning` needs a compiled cp313 manylinux wheel for Python 3.13.15 | If PyPI has none, A logs `wheel FAILED pennylane-lightning` and B skips it. Not checked | UNVERIFIED |
| W5 | No version pins in A. A's download date and B's run date can differ, and A is rerun by "Save & Run All" | The bundle holds whatever PyPI had on A's last committed run. Only the manifest `env_A.json` tells which | READ |
| W6 | A's guide says "Leave Environment on the default (latest)" while the owner's UI shows "Pin to original environment" | Not a code conflict, but A, B and any rehearsal must be on the same image: Python 3.13.15 (cp313) wheels. The CPU image used by A was never probed | READ + UNVERIFIED |
| W7 | A on a CPU-only session may differ from the GPU image in Python minor version | A's `pip download` uses A's own interpreter, so the wheels would carry the wrong ABI tag. A records the Python version in `env_A.json`; the runbook checks it equals B's | UNVERIFIED |

Proposed final list (section 5, diffs P1 and P2): A downloads `pennylane`, `pennylane-lightning`, `onnxruntime`, `onnxscript` (drop standalone `onnx`, since the image has 1.22.0 and the dependency tree of `onnxscript` pulls it anyway if required). B installs the same four in one `pip install --no-index` call with the existing constraint pins, then tries each one on its own and keeps going if one fails.

A cheap way to remove the unverified parts is the offline rehearsal in section 7 (R3): it runs exactly B's install path on a T4 with Internet OFF against A's real output, takes a few minutes, and also tests the ONNX export and the input folder layout.

## 5. Proposed changes (diffs only; no file was edited)

All paths are under `lumos_app/notebooks/`. The workflow that owns those files decides whether to apply them. Keep the `.py` and `.ipynb` in sync (`build_ipynb_*.py`).

### P1. A: wheel list (`lumos_A_fetch.py`, config cell)

```diff
-WHEELS = ["pennylane", "pennylane-lightning", "onnx", "onnxscript"]   # "xgboost" added below if missing
+# onnx is already in the Kaggle image (1.22.0 on 2026-10-10); onnxruntime is not, and B needs it for the ONNX parity check.
+WHEELS = ["pennylane", "pennylane-lightning", "onnxruntime", "onnxscript"]   # "xgboost" added below if missing
```

### P2. B: install all four, one at a time with fallbacks (`lumos_B_train.py`, section 2.4)

```diff
-def try_offline_install(pkgs=("pennylane", "pennylane-lightning")):
+def try_offline_install(pkgs=("pennylane", "pennylane-lightning", "onnxruntime", "onnxscript")):
```
The existing `modname` mapping already works for the two new names (`onnxruntime`, `onnxscript`). The `import_check` at the end only tests `pennylane`; it should also report `onnxruntime`. The call site is gated by `if RUN_QML:`; the ONNX packages should also be installed when `RUN_QML` is false and `RUN_DL` is true.

### P3. B: do not walk the competition mount (`lumos_B_train.py`, `walk_limited`)

On the RTX probe `/kaggle/input` held only `competitions`. `locate_bundle` and `find_local_llm` both `os.walk` the whole of `/kaggle/input`, so with the ARC competition attached B lists that competition's folders (names only, depth-limited, but still touching it). The project rule is that nothing reads the competition data.

```diff
     for dirpath, dirnames, filenames in os.walk(root):
         depth = len(Path(dirpath).parts) - base_depth
         if depth >= max_depth: dirnames[:] = []
-        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
+        dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and not (depth == 0 and d == "competitions"))
```

### P4. B: budgets for the first real run (`lumos_B_train.py`, section 2.2)

Defaults 120 + 120 + 90 minutes fit inside the 12 h session. They are not wrong, but the first real run is on unmeasured data and the RTX quota multiplier is unknown, so a lower cap limits a surprise. Budgets are part of the run fingerprint, so changing them starts a fresh run folder.

```diff
-XGB_MAX_MINUTES = float(os.environ.get("XGB_MAX_MINUTES", "120"))
-DL_MAX_MINUTES = float(os.environ.get("DL_MAX_MINUTES", "120"))
-QLLM_MAX_MINUTES = float(os.environ.get("QLLM_MAX_MINUTES", "90"))
+XGB_MAX_MINUTES = float(os.environ.get("XGB_MAX_MINUTES", "45"))     # first real run; raise after seeing B2 timing
+DL_MAX_MINUTES = float(os.environ.get("DL_MAX_MINUTES", "45"))
+QLLM_MAX_MINUTES = float(os.environ.get("QLLM_MAX_MINUTES", "45"))   # only used when a model is attached
```

For T4 x2, the same caps apply (XGBoost GPU speed on a T4 is lower, and the wall-clock callback keeps the best iteration so far).

### P5. B: bf16 only where the GPU supports it (`lumos_B_train.py`, section 2.10)

```diff
-    use_amp = DEVICE == "cuda"
+    use_amp = DEVICE == "cuda" and torch.cuda.get_device_capability(0)[0] >= 8   # bf16 is native from cc 8.0 (Ampere); T4 is 7.5
```
`D1_INFO["amp_bf16"]` currently reports `DEVICE == "cuda"`; change it to the same expression so the model card is accurate. On a T4 D1 then trains in fp32 (slower but safe). Not tested on T4.

### P6. B: keep heavy scratch out of the 19.5 GiB output (`lumos_B_train.py`, section 2.2)

Facts: `/kaggle/working` is 19.5 GiB on both probes, and everything in it (the `runs/<ts>/cache` panel `.npy` files, the model caches, `runs/<ts>/lumos_app_bundle`, `lumos_app_bundle/` and the zip) becomes the notebook output. The app bundle is therefore stored three times (stage copy, final copy, zip), and the panel arrays count too. Sizes are unmeasured.

```diff
-CACHE = RUN_DIR / "cache"
+_TMP = Path("/kaggle/temp") if Path("/kaggle/temp").is_dir() and os.access("/kaggle/temp", os.W_OK) else None
+CACHE = (_TMP / "lumos_cache" / RUN_TS) if _TMP else (RUN_DIR / "cache")   # scratch, not saved as output
```
Careful: `stage_save` stores artefact paths relative to `RUN_DIR`, so moving CACHE outside `RUN_DIR` needs the relative-path logic changed. Do not apply this blindly; first measure `/kaggle/temp` in the rehearsal (R3 prints it) and, if it exists, decide. A smaller alternative with no resume impact: after the zip is written, delete `runs/<ts>/lumos_app_bundle` (it is a duplicate of `lumos_app_bundle/`).

### P7. A: guard the disk (`lumos_A_fetch.py`)

A's intro says the whole-country files total "under 1 GB". No measurement backs that for the United States (STATUS.md: US sizes unmeasured), and `/kaggle/working` is 19.5 GiB with the wheelhouse inside it. Proposal: log `shutil.disk_usage(WORK)` after each year batch and stop requesting more files once free space is below 2 GiB (the code already records disk-full as a per-file error, so this only makes it explicit and earlier). Change the intro text once the first real run gives the actual figure.

### P8. B, Q2 only: `torch_dtype` keyword (`make_llm_generate`)

transformers 5.16.1 is installed (MEASURED). The code passes `"torch_dtype": dtype`. Recent transformers releases renamed this to `dtype`. Not tested here, and only matters when a model is attached. Proposal: try `dtype=` first and fall back to `torch_dtype=` on `TypeError`.

### P9. Notebook settings (UI or metadata)

| Setting | A (fetch) | B (train) |
|---|---|---|
| Environment | leave default for a new notebook; record the digest afterwards | same as A. Do not pick an old environment |
| Accelerator | none (CPU) is enough; T4 only if the CPU image proves to have a different Python | RTX PRO 6000 (`NvidiaRtxPro6000`) with the ARC competition attached; fallback `NvidiaTeslaT4` |
| Internet | ON | OFF |
| Inputs | none (optional secret `FIRMS_MAP_KEY`) | A's output through `kernel_sources` |
| Time cap on push (`-t`) | 7200 s | 14400 s (4 h) for the first run; the session limit is 12 h |

## 6. What was NOT verified

- Notebook A on real FIRMS data and Notebook B on any real data, on any Kaggle machine. STATUS.md says nothing has run on real FIRMS data or on the Blackwell GPU, and the Kaggle probes here only used tiny workloads.
- A's wheelhouse build on Kaggle, the dependency closure of `pennylane` and `pennylane-lightning`, and the offline install with B's constraint file (W3, W4). Only `pip download pennylane --no-deps` was run.
- `torch.onnx.export(..., dynamo=False)` on torch 2.11.0; whether it still accepts that keyword; whether `onnxscript` is needed.
- Whether the PennyLane cross-check passes at all.
- The CPU-only image (Python version, RAM, cores), and the image digest of the T4 run.
- `/kaggle/temp` existence and size; the real disk limit of the RTX machine (UI 57.6 GiB vs probe 19.5 GiB for `/kaggle/working`); the 500-item output limit mentioned in a feedback thread (not read).
- The mount path of a kernel output used as input. The RTX probe showed `/kaggle/input/competitions`, so a layout like `/kaggle/input/notebooks/<owner>/<slug>/` is a guess. B discovers the bundle by walking down to depth 8, which should cope, but this was not run.
- That a `notebook`-type CLI push with both `kernel_sources` and a competition source receives the RTX machine (the grant was seen for a `script` kernel with a competition only).
- RTX quota billing rate, the 12 h session limit, XGBoost behaviour on Blackwell beyond a tiny fit (no PTX/SASS detail), long-run stability of the RTX session.
- Whether the policy risk about unrelated work on the ARC-attached RTX machines is enforced. The wording comes from a search summary, not from the page itself.
- The draft notebook "Internet OFF with RTX PRO 6000": not readable through the CLI (HTTP 403), not touched.
- "Pin to original environment" versus the latest environment: how the UI choice maps to `docker_image` and `docker_image_pinning_type` was never tested.
- The T4 option via API was verified to give 2 GPUs, but the owner's UI label "T4 x2" and `NvidiaTeslaT4` are matched only through that measurement.
- No test of `kernels push` for a `notebook` kernel in this session (only `script` kernels were pushed).

## 7. Runbook: launch A and B through the API once the notebooks are final

Rules that apply to every step: sequential calls, at least 5 s apart; status polling no faster than every 60 s (use 120 s for long runs); on HTTP 429 wait for `Retry-After`; at most 3 attempts per failing call, then record the blocker and take the fallback; no competition data download and no submission, ever; never print or write the token; no bulk downloads (always use `--file-pattern`); the Mac has about 10 GB free.

Shell prelude for each command (token read from the private file, never echoed):

```
S=/private/tmp/claude-501/-Users-aburoshderokonuddawla-Desktop-Lumos-Fire-Calendar-Complete/511a4843-a341-4e98-b431-30787176181b/scratchpad
KBIN=$S/kgenv/bin/kaggle
export KAGGLE_API_TOKEN="$(cat $S/.kaggle_token)"
L=/Users/aburoshderokonuddawla/Desktop/Lumos_Fire_Calendar_Complete/lumos_app/docs/kaggle/launch
```

### R0. Freeze and stage (local, no API)

1. Wait until the notebook-editing workflow reports `lumos_A_fetch.ipynb` and `lumos_B_train.ipynb` as final. Record their SHA-256 in the run notes.
2. Validate: `$S/kgenv/bin/python -I -c "import nbformat,sys; nbformat.validate(nbformat.read(sys.argv[1],4))" <file.ipynb>` for both.
3. Create `$L/A`, `$L/B-rtx`, `$L/B-t4` and copy the final notebook into each (never push from the `notebooks/` folder). Check each staged file for the token prefix with `grep -c "KGAT""_"` (the doubled quote makes the pattern not match this document itself; it must print 0).
4. Write the three metadata files:

`$L/A/kernel-metadata.json`
```
{
  "id": "shahriarhameem/lumos-a-fetch",
  "title": "Lumos A Fetch",
  "code_file": "lumos_A_fetch.ipynb",
  "language": "python",
  "kernel_type": "notebook",
  "is_private": true,
  "enable_gpu": false,
  "enable_tpu": false,
  "enable_internet": true,
  "dataset_sources": [],
  "competition_sources": [],
  "kernel_sources": [],
  "model_sources": []
}
```

`$L/B-rtx/kernel-metadata.json` (same shape as the verified probe, plus the A source)
```
{
  "id": "shahriarhameem/lumos-b-train",
  "title": "Lumos B Train",
  "code_file": "lumos_B_train.ipynb",
  "language": "python",
  "kernel_type": "notebook",
  "is_private": true,
  "enable_gpu": true,
  "enable_tpu": false,
  "enable_internet": false,
  "machine_shape": "NvidiaRtxPro6000",
  "dataset_sources": [],
  "competition_sources": ["arc-prize-2026-arc-agi-3"],
  "kernel_sources": ["shahriarhameem/lumos-a-fetch"],
  "model_sources": []
}
```

`$L/B-t4/kernel-metadata.json`: as above but `"id": "shahriarhameem/lumos-b-train-t4"`, `"title": "Lumos B Train T4"`, `"machine_shape": "NvidiaTeslaT4"`, `"competition_sources": []`.

Add an optional model to `model_sources` only if the owner wants Q2. A 7B model needs the RTX machine.

### R1. Preflight (API, read-only)

```
$KBIN quota
sleep 6; $KBIN kernels list --mine -s lumos
```
Expect: GPU remaining about 29.9 h; the only Lumos kernels are `lumos-probe-t4`, `lumos-probe-rtx` (and `lumos-probe-offline` if R3 was already run). No `lumos-a-fetch` or `lumos-b-train` yet (a clash would mean a rename, never an overwrite). Never use slugs starting `internet-off-`.

### R2. Launch A (CPU, Internet ON)

```
$KBIN kernels push -p $L/A -t 7200
sleep 60; $KBIN kernels status shahriarhameem/lumos-a-fetch      # repeat every 120 s
$KBIN kernels pull shahriarhameem/lumos-a-fetch -p $S/chk-a -m   # applied settings: enable_internet true, no machine_shape, docker_image digest
```
Success: status `COMPLETE`. Estimated 8 to 40 minutes plus wheels (A's own estimate; unmeasured).
Then fetch only the small proofs (no raw data):
```
$KBIN kernels files shahriarhameem/lumos-a-fetch --format json
sleep 6; $KBIN kernels output shahriarhameem/lumos-a-fetch -p $S/out-a --file-pattern 'env_A|config_A|sources|README_bundle'
```
Gate G-A (all must hold, otherwise stop and fix A; maximum 3 repair rounds):
- `env_A.json`: `python_version` is `3.13.15`, which equals the Python of the B image. If not, rerun A with `enable_gpu: true, machine_shape: NvidiaTeslaT4` (about 1 GPU hour at most) so that it runs on the GPU image.
- `sources.json`: no record with status `error`; `missing` only for years FIRMS does not publish; `synthetic` absent or false.
- `wheelhouse`: `pennylane` and `pennylane-lightning` listed as succeeded in `env_A.json`, and (after P1) `onnxruntime` and `onnxscript`. A failed wheel is acceptable only if the owner accepts the matching fallback (simulator only, no ONNX parity).
- The bundle size seen in the log (folder sizes line) is below the 19.5 GiB limit with margin.

### R3. Offline rehearsal on T4 (Internet OFF, no competition, a few GPU minutes)

Files already prepared: `probes/lumos-probe-offline/{kernel-metadata.json,probe.py}` (script kernel, `NvidiaTeslaT4`, Internet OFF, `kernel_sources` = A). Not pushed by this role.
```
$KBIN kernels push -p /Users/aburoshderokonuddawla/Desktop/Lumos_Fire_Calendar_Complete/lumos_app/docs/kaggle/probes/lumos-probe-offline -t 600
sleep 60; $KBIN kernels status shahriarhameem/lumos-probe-offline
$KBIN kernels output shahriarhameem/lumos-probe-offline -p $S/out-offline --file-pattern 'rehearsal.*json'
```
Read `rehearsal.json`:
- `input_layout`: the real path where A's output is mounted. Confirm B's search (depth 8 from `/kaggle/input`) can reach `lumos_bundle/manifests/sources.json`.
- `offline_install`: rc 0 for each of the four packages and the four imports true. If `pennylane` shows the numpy-pin conflict (W3), apply P2 with a relaxed constraint set (drop numpy/scipy pins for that install) or accept the simulator-only fallback.
- `onnx_export`: `legacy_dynamo_false` ok with `parity` true, or note which path works.
- `disk`: `/kaggle/temp` figures for P6.
- `gpu`: `bf16_supported` on the T4, for P5.

Gate G-R: any failure is fixed in the notebooks or recorded as a degraded feature before B starts. This costs about 0.1 GPU hour and saves a multi-hour RTX run from failing on an install.

### R4. Choose B's machine

- RTX path (default if the owner accepts the ARC-attached route): R5.
- T4 x2 path: if the owner declines the ARC route, the RTX grant fails, or the RTX path is the policy risk in section 1 point 4: use R6.

### R5. Launch B on RTX PRO 6000 (Internet OFF, A attached)

```
$KBIN quota                                                   # note GPU used before
sleep 6; $KBIN kernels push -p $L/B-rtx -t 14400
sleep 60; $KBIN kernels pull shahriarhameem/lumos-b-train -p $S/chk-b -m
```
Immediately verify in `$S/chk-b/kernel-metadata.json`: `machine_shape` is `NvidiaRtxPro6000`, `enable_internet` is `false`, `competition_sources` has the ARC slug, `kernel_sources` has A. If `machine_shape` differs: the CLI has no cancel command; stop the run in the UI (Session options, Stop) or use `kernels delete shahriarhameem/lumos-b-train -y` (it is our own kernel; never any other), then take R6. Note the `docker_image` digest in the run notes.

Monitor (no faster than every 120 s):
```
$KBIN kernels status shahriarhameem/lumos-b-train
$KBIN kernels logs shahriarhameem/lumos-b-train          # after it finishes or errors (or -f to follow)
```
Watch for: `Device: cuda` and the GPU line naming the RTX PRO 6000 in 2.3; `SYNTHETIC=False`; `mismatches=0`; the `offline pip:` line (all four installed); `panel plan:` memory line; per-stage `timing` lines.
Success: status `COMPLETE`, then
```
$KBIN kernels files shahriarhameem/lumos-b-train --format json
$KBIN kernels output shahriarhameem/lumos-b-train -p $S/out-b --file-pattern 'lumos_app_bundle\.zip|env_B|stages|checksum_report|run_log|metrics'
$KBIN quota                                                   # GPU used after, for the billing-rate figure
```
Check the Mac has room for the zip first (`df -h /`, 10 GB free expected; the zip size is unmeasured). Record: `RELEASE STAGE` is `observed_comparison` or `validated_calibration`, `schema errors: 0`, `blocked network attempts: 0`, `Device: cuda`, ONNX parity result, and the GPU hours consumed per wall-clock hour (this measures the RTX billing rate).

### R6. Launch B on T4 x2 (fallback)

Same as R5 with `$L/B-t4`, slug `shahriarhameem/lumos-b-train-t4`, no competition, `-t 21600` (6 h) for the first run. Expect longer ingest (4 CPUs) and watch for the RAM warning in 2.6 (31 GiB). After an out-of-memory kill a second push of the same kernel starts a fresh session, not a resume (resume works only inside one live session); in that case reduce the work (for example fewer extra countries in A, or fewer seeds) rather than looping.

### R7. If something goes wrong (stuck and repair rules)

| Symptom | Action |
|---|---|
| HTTP 429 | wait `Retry-After`, then continue; after 3 failures stop and record |
| status stays `QUEUED` for more than 15 min | note it; do not re-push (a second push queues a second run); poll at 120 s; after 45 min tell the owner |
| status `ERROR` | `kernels logs`, find the first traceback, fix in a staged copy, push again (max 3 repair rounds per blocker, then document and use the fallback) |
| A: FIRMS errors in the summary table | rerun A once (cached files are reused inside a session, not across versions: expect a full re-download); if still failing, record the ids as `missing` and let B treat them as unknown |
| B: `device_selected: cpu` on RTX | check the 2.3 smoke test error; if it names `no kernel image`, the image has no `sm_120`: add `"docker_image_pinning_type": "latest"` to the metadata and push once; if still failing, use R6 |
| B: wheels missing at 2.4 | not fatal: Q1 uses the simulator; ONNX parity stays `None`. Fix via P1/P2 and rerun |
| Output limit or disk full | stop, apply the deletion/scratch ideas of P6, rerun |
| Quota concern | `$KBIN quota` before and after every GPU run; a multi-hour RTX run should only start with a clear margin |

### R8. After the runs

1. Append results to `heartbeat` and to `messages/COORDINATOR.md` with facts only (what ran, what status, what outputs), and note anything left untested.
2. Run `grep -rl "KGAT""_" lumos_app/docs/kaggle` as a leak check on everything produced; it must print nothing.
3. Do not delete or modify the owner's draft "Internet OFF with RTX PRO 6000" or any non-`lumos-` kernel. Probe and launch kernels with `lumos-` slugs may be deleted only if the owner asks.

## 8. Reference: values quoted in this report

- T4 probe: pushed 15:43 (+06), COMPLETE at first 60 s poll, runtime 13.67 s. RTX probe: pushed 15:54 (+06), RUNNING at poll 1, COMPLETE at poll 2, runtime 87.28 s, no repairs.
- RTX pulled metadata: `machine_shape NvidiaRtxPro6000`, `enable_internet false`, `docker_image gcr.io/kaggle-private-byod/python@sha256:2757e0c7d1e0a9cb43da657b97e223c321a98f5014bdf64f44f2f6b083ad2b2f` (the server chose it; no pinning field was sent).
- Owner's older RTX notebooks use other digests (`81b1e7c4...` for `final-qllm` and `antenna-llm-qml`, `dafd4ce5...` for `thesis-final`, `37c64f7d...` for `notebook6279d2637b`); their torch builds are unknown.
- Owner facts (screenshots, trusted): RTX PRO 6000 has 95.6 GiB VRAM, 175 GiB RAM, a 12 h session and disk "max about 57.6 GiB"; weekly GPU quota 30 h; TPU 20 h.
