# Kaggle CLI 2.2.4: verified command notes (K1-TOOLING, 2026-10-10)

Sources: `--help` output, installed source (`kaggle/api/kaggle_api_extended.py`, `kagglesdk/kernels/types/kernels_api_service.py`, `kagglesdk/kaggle_env.py`), and read-only calls against the owner's account (`kernels list --mine`, `kernels pull -m` of 17 own notebooks, `kernels status`, `quota`). Nothing was pushed, no competition data touched. "CONFIRMED" = observed in real server metadata or source. "UNCONFIRMED" = inference, verify with a tiny probe.

## 0. Environment and credentials

CLI binary (venv, Python 3.12.2, kaggle 2.2.4, kagglesdk 0.1.37, nbformat 5.11.1):

    KBIN=/private/tmp/claude-501/-Users-aburoshderokonuddawla-Desktop-Lumos-Fire-Calendar-Complete/511a4843-a341-4e98-b431-30787176181b/scratchpad/kgenv/bin/kaggle

Credential lookup order (CONFIRMED in `kaggle_env.get_access_token_from_env` and `KaggleApi.authenticate`):
1. Inside a Kaggle notebook: file named by env `KAGGLE_API_V1_TOKEN_PATH`.
2. Env `KAGGLE_API_TOKEN`: either the token string itself or a path to a file that holds it.
3. `~/.kaggle/access_token`, then `~/.kaggle/access_token.txt`.
4. Then legacy `~/.kaggle/kaggle.json` / `KAGGLE_USERNAME` + `KAGGLE_KEY`, then OAuth creds, then anonymous (only for commands that allow it).
The token is introspected server side to get the username (so `id` in metadata must use that username: `shahriarhameem`). `~/.kaggle/` exists but is empty (created by the CLI itself; no secrets stored there).

Per-command pattern (token read from the private file, never printed):

    export KAGGLE_API_TOKEN="$(cat /private/tmp/claude-501/-Users-aburoshderokonuddawla-Desktop-Lumos-Fire-Calendar-Complete/511a4843-a341-4e98-b431-30787176181b/scratchpad/.kaggle_token)"
    $KBIN quota

(Per source lines 99-100, `KAGGLE_API_TOKEN` may also be a path to the token file; not exercised by us.)

Politeness rules we follow: sequential calls, `sleep 6` between calls, status polling >= 60 s, max 3 attempts per failing call.

## 1. Command inventory (kernels)

`kaggle kernels {list,files,get,init,push,pull,output,status,logs,update,delete,topics}`; `push` = `update`, `pull` = `get`. Also `kaggle quota`, `kaggle config view`, `kaggle auth ...`.

| Command | Exact syntax | Notes |
|---|---|---|
| init | `$KBIN kernels init -p DIR` | writes template `kernel-metadata.json` (see section 2). |
| push | `$KBIN kernels push -p DIR [-t SECONDS] [--accelerator NAME]` | uploads `code_file` AND starts a run. `-t` caps run time (never beyond global max). `--accelerator` overrides `machine_shape` AND the enable_gpu/enable_tpu booleans in the metadata (docstring, source ~line 6330). |
| pull | `$KBIN kernels pull OWNER/SLUG -p DIR -m` | `-m` also writes `kernel-metadata.json` with the server's current settings incl. `machine_shape`, `docker_image`. Also accepts `OWNER/SLUG/VERSION`. Only saved versions are pullable; unsaved UI drafts return HTTP 403 (confirmed by K2). |
| status | `$KBIN kernels status OWNER/SLUG` | prints `OWNER/SLUG has status "KernelWorkerStatus.<X>"`. Seen: `CANCEL_ACKNOWLEDGED`. Other values (QUEUED, RUNNING, COMPLETE, ERROR, CANCEL_REQUESTED) are expected but UNCONFIRMED by observation. |
| logs | `$KBIN kernels logs OWNER/SLUG [-f]` | execution log of latest run; `-f` follows a live run. Returned HTTP 404 on a kernel without a log (observed on `newcnn2`). |
| output | `$KBIN kernels output OWNER/SLUG -p OUTDIR [-o] [-q] [--file-pattern REGEX] [--page-size N] [--page-token T]` | downloads files from `/kaggle/working` of the latest run. Use `--file-pattern` to avoid bulk downloads. `-o` forces re-download. |
| files | `$KBIN kernels files OWNER/SLUG [--format json]` | lists output files of latest run (404 if none; observed on final-qllm). |
| list | `$KBIN kernels list --mine [--search TERM] [--page N] [--page-size N] [--format json]` | `--mine` is `-m`. Hidden never-run drafts show as `[Private Notebook]` with empty ref. |
| delete | `$KBIN kernels delete OWNER/SLUG -y` | destructive; never use on owner notebooks. Only on our own `lumos-probe-*` if cleanup is wanted. |
| quota | `$KBIN quota` | verified output: GPU used 0.05h / remaining 29.95h / total 30h; TPU 0/20h; refresh 2026-10-17T00:00. |

Slug rule on push: `id` must be `OWNER/slug`, no version. `title` >= 5 characters; the slug should equal the slugified title (lowercase, spaces to dashes) or the CLI prints a warning. Use titles like `Lumos Probe T4` with id `shahriarhameem/lumos-probe-t4`.

Rate limiting: no 429s seen over about 50 calls spaced >= 6 s.

## 2. kernel-metadata.json schema (CONFIRMED from `kernels_initialize` and `kernels_push`)

| Field | Type | Required | Meaning / allowed values |
|---|---|---|---|
| `id` | string | yes (or `id_no`) | `owner/slug`, no version suffix |
| `id_no` | int | alt | numeric kernel id (present in pulled metadata) |
| `title` | string | recommended | >= 5 chars, should slugify to the id slug |
| `code_file` | string | yes | path relative to the folder; file must exist |
| `language` | string | yes | `python`, `r`, `rmarkdown` |
| `kernel_type` | string | yes | `script` or `notebook`. For `notebook` the code file is parsed as JSON (`.ipynb`); code-cell outputs are stripped on push |
| `is_private` | bool | no (default true) | |
| `enable_gpu` | bool | no (default false) | |
| `enable_tpu` | bool | no (default false) | |
| `enable_internet` | bool | no (default TRUE; set false explicitly for B) | |
| `machine_shape` | string | no | accelerator name, see section 3. Empty or omitted means default shape |
| `dataset_sources` | list[str] | no | `owner/dataset-slug` |
| `competition_sources` | list[str] | no | competition slugs, e.g. `arc-prize-2026-arc-agi-3` |
| `kernel_sources` | list[str] | no | `owner/kernel-slug` (kernel output as input) |
| `model_sources` | list[str] | no | `owner/model/Framework/variation/version` |
| `keywords` | list[str] | no | maps to category_ids (tags); invalid tags are reported, not fatal |
| `docker_image` | string | no | one of Kaggle's known images, `gcr.io/kaggle-images/python@sha256:...`; leave out for the default |
| `docker_image_pinning_type` | string | no | `original` or `latest` (the only two values the CLI accepts). Name-consistent with the UI dropdown "Pin to original environment"; exact mapping UNCONFIRMED |

Notebook gotcha: the ipynb's own `metadata.kaggle` block (`accelerator`, `isGpuEnabled`, `isInternetEnabled`, `dataSources`) is what the UI writes; the API request fields above are what the server applies on push. Do not rely on the ipynb block.

## 3. Accelerator selection (machine_shape)

SDK docstring lists only `NvidiaTeslaT4`, `NvidiaTeslaP100`, `Tpu1VmV38`, and says the enum "is not currently included in kagglesdk". Real server values observed by pulling the owner's notebooks with `-m` (17 notebooks):

| Hardware | machine_shape value | Evidence |
|---|---|---|
| RTX PRO 6000 (Blackwell) | `NvidiaRtxPro6000` | CONFIRMED: final-qllm, qml-qllm, antenna-llm-qml, thesis-final, notebook6279d2637b. All have `enable_gpu: true`, `enable_internet: false`, `competition_sources: ["arc-prize-2026-arc-agi-3"]` |
| T4 (Kaggle "GPU T4 x2" option) | `NvidiaTeslaT4` | CONFIRMED as the value stored for T4 notebooks (ml-cst, newcnn2, yolo26-mediapipe131; ipynb meta `accelerator: nvidiaTeslaT4`). UNCONFIRMED that it gives TWO GPUs: the UI offers only "T4 x2" and "P100" and no separate single-T4 value was seen, so it is very likely x2. Verify with `nvidia-smi -L` and `torch.cuda.device_count()` in the T4 probe |
| P100 | `NvidiaTeslaP100` | SDK docstring only |
| H100 | `NvidiaH100` | observed on capstone-image-bdslw131-fixed (not for us) |
| TPU | `Tpu1VmV38` | SDK docstring only |
| CPU only | omit / empty | pulled as `None` with `enable_gpu: false` |

How to request:
- Metadata route: `"enable_gpu": true` plus `"machine_shape": "<value>"` (all server-side GPU notebooks carry both).
- CLI override: `$KBIN kernels push -p DIR --accelerator NvidiaRtxPro6000` (or `NvidiaTeslaT4`). The flag wins over the metadata file.
- RTX PRO 6000 is only granted when the competition `arc-prize-2026-arc-agi-3` is attached and internet is off (owner's fact; consistent with all 5 RTX notebooks). Whether the server REJECTS or silently downgrades a push that asks for RTX with internet ON or without the competition is UNCONFIRMED (not tested to save quota). Always `kernels pull -m` afterwards and compare `machine_shape`.

Docker image / environment (matters for Blackwell sm_120): the owner's RTX notebooks use different images: `gcr.io/kaggle-images/python@sha256:81b1e7c4...` (final-qllm, antenna-llm-qml), `...dafd4ce5...` (thesis-final), and several `gcr.io/kaggle-private-byod/python@sha256:...` (qml-qllm `2757e0c7...`, notebook6279d2637b `37c64f7d...`). Whether torch in each supports sm_120 is UNCONFIRMED; the RTX probe must print `torch.__version__`, `torch.cuda.get_device_capability()`, `torch.cuda.get_arch_list()` and run a tiny matmul. If the default image fails: try `docker_image_pinning_type: "latest"`; if still failing, the UI step is the notebook editor's session options, Environment dropdown, switching from "Pin to original environment" to the latest environment (the exact label of the latest option is UNCONFIRMED; only "Pin to original environment" is known from the owner's screenshot).

## 4. Sample metadata

(a) T4 with Internet ON (probe or any non-RTX GPU notebook):

    {
      "id": "shahriarhameem/lumos-probe-t4",
      "title": "Lumos Probe T4",
      "code_file": "lumos_probe_t4.ipynb",
      "language": "python",
      "kernel_type": "notebook",
      "is_private": true,
      "enable_gpu": true,
      "enable_tpu": false,
      "enable_internet": true,
      "machine_shape": "NvidiaTeslaT4",
      "dataset_sources": [],
      "competition_sources": [],
      "kernel_sources": [],
      "model_sources": []
    }

(a2) Notebook A (CPU, internet ON): same shape with `"enable_gpu": false`, `machine_shape` omitted, id e.g. `shahriarhameem/lumos-a-fetch`.

(b) RTX PRO 6000 + competition source + Internet OFF (mirrors final-qllm minus its datasets, model and pinned image; do NOT include `shahriarhameem/ml-data` or the Qwen model):

    {
      "id": "shahriarhameem/lumos-probe-rtx",
      "title": "Lumos Probe RTX",
      "code_file": "lumos_probe_rtx.ipynb",
      "language": "python",
      "kernel_type": "notebook",
      "is_private": true,
      "enable_gpu": true,
      "enable_tpu": false,
      "enable_internet": false,
      "machine_shape": "NvidiaRtxPro6000",
      "dataset_sources": [],
      "competition_sources": ["arc-prize-2026-arc-agi-3"],
      "kernel_sources": [],
      "model_sources": []
    }

Add `"docker_image_pinning_type": "latest"` only if the default image's torch lacks sm_120 (UNCONFIRMED whether needed). A `script` kernel (`kernel_type: "script"`, `code_file: "probe.py"`) is a lighter alternative for probes, but the owner's working RTX kernels are all notebooks, so notebooks are the safer match.

The RTX kernel is attached to the ARC competition only as an access path: probe code must not read `/kaggle/input/arc-prize-2026-arc-agi-3` and must never submit. The CLI has no kernel-to-competition submit step in `kernels push`, so a push/run alone is not a submission (competition submissions are a separate `competitions submit` command, which we do not use).

## 5. End-to-end command template

    KBIN=.../scratchpad/kgenv/bin/kaggle
    export KAGGLE_API_TOKEN="$(cat .../scratchpad/.kaggle_token)"      # per command, never echoed
    $KBIN quota
    $KBIN kernels push -p docs/kaggle/probes/lumos-probe-rtx -t 600    # push + run, 10 min cap
    sleep 60; $KBIN kernels status shahriarhameem/lumos-probe-rtx      # poll >= 60 s apart
    $KBIN kernels logs shahriarhameem/lumos-probe-rtx                  # after finish
    $KBIN kernels output shahriarhameem/lumos-probe-rtx -p docs/kaggle/probes/out-rtx --file-pattern 'probe.*\.json'
    $KBIN kernels pull shahriarhameem/lumos-probe-rtx -p SCRATCH/chk -m   # verify applied machine_shape / enable_internet
    $KBIN quota

Push response text (from source): `Kernel version N successfully pushed.  Please check progress at <url>` or `Kernel push error: <msg>`; invalid sources are listed as "not valid dataset/competition/kernel sources".

## 6. Items that could not be confirmed

1. Whether `NvidiaTeslaT4` yields two GPUs (check `nvidia-smi -L` in the T4 probe).
2. Whether a push with `NvidiaRtxPro6000` is refused or downgraded when internet is ON or the competition is missing.
3. Which docker image / pinning mode gives a torch build with sm_120 support on Blackwell.
4. Full list of `KernelWorkerStatus` values beyond `CANCEL_ACKNOWLEDGED`.
5. Draft "Internet OFF with RTX PRO 6000" metadata: not readable via CLI (403, per K2); untouched.
6. Whether a CLI-created notebook gets RTX at all (the five existing RTX notebooks may have been created in the UI; the first CLI-driven RTX push is the real test).

## 7. Local probe (this Mac)

| Item | Value |
|---|---|
| OS | macOS 12.7.6 (Darwin 21.6.0) |
| CPU | Intel Core i5-5350U @ 1.80 GHz |
| RAM | 8 GB (8589934592 bytes) |
| Disk | `/` data view: 113 GiB, 10 GiB available (`df -h` shows 60% for that view; owner-reported 89% full is the whole container); plan for about 10 GB free |
| Python | 3.12.2 (anaconda pip3 on PATH); kgenv venv Python 3.12.2 |
| Node | v20.20.2 (nvm), npm present |
| git | 2.37.1 (Apple Git-137.1) |
| Browser | Brave present at `/Applications/Brave Browser.app` |
| Other tools | jq, curl (anaconda) |
| Kaggle CLI venv | kaggle 2.2.4, kagglesdk 0.1.37, nbformat 5.11.1, jupyter_core 5.9.1 |

Missing locally: nothing required for the Kaggle workflow beyond the CLI venv. Not installed and not needed locally: CUDA, torch, GDAL (heavy work stays on Kaggle). `jupyter nbconvert` is not installed and not needed (pushes strip outputs; nbformat in kgenv can validate `.ipynb` before push).
