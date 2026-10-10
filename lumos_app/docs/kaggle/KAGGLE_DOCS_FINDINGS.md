# Kaggle docs findings (K3-DOCS-RESEARCH)

Date: 2026-10-10. Method: 15 web requests (search and fetch), one host at a time.
Many kaggle.com pages are JavaScript-rendered, so WebFetch returned only the page title for them. Kaggle's own wording therefore came mostly from search-result summaries or other hosts. Every claim carries a label:

- FETCHED = text read from a fetched page
- SEARCH = taken from a web-search summary, with no page body read
- UNVERIFIED = inference or background knowledge

## Summary

1. The Kaggle GPU image is built on top of the Google Colab runtime image. Its torch therefore comes from Colab, and Kaggle does not pin it (FETCHED, Dockerfile.tmpl). Colab's current GPU freeze has torch 2.11.0+cu130 (FETCHED, see section 1). torch builds for cu130 include sm_120 (FETCHED, Ming-Image issue). So the latest Kaggle image very probably supports Blackwell, but the actual Kaggle image has not been checked (UNVERIFIED).
2. The "pinned original" environment of an old notebook may carry an older torch. An old wheel such as 2.4.0+cu121 fails on an RTX PRO 6000 with "no kernel image is available" (FETCHED, Ming-Image issue). Do not use the pin on RTX. Use the latest environment, and print `torch.cuda.get_arch_list()` in the probe.
3. POLICY RISK, HIGH. The ARC-AGI-3 competition says its RTX machines are for competition use. Other use "could result in moderation action, such as site suspension or account ban" (SEARCH). Running the unrelated Lumos fire-calendar training there needs an explicit owner decision. See section 3.
4. `kernel_sources` and `competition_sources` are real fields of `kernel-metadata.json` (FETCHED). No numeric limits were found for them.

## 1. Blackwell (sm_120) support: Kaggle default vs pinned image

**Kaggle image base (FETCHED).** In the Kaggle docker-python repo, `Dockerfile.tmpl` builds on a Colab base:

- GPU: `FROM us-docker.pkg.dev/colab-images/public/runtime:release-colab-external-images_20260917-060051_RC00`
- CPU: `.../cpu-runtime:release-colab-external-images_20260917-060051_RC00`
- torch, torchvision, tensorflow and jax are not pinned. They are carried over from the base image: `pip freeze | grep -E 'tensorflow|keras|torch|jax' > /colab_requirements.txt`.
- Only `torchtune` and `pycuda` are installed explicitly.
- A comment says a package has "no cp313", which implies Python 3.13 in the current image.
- No TORCH_CUDA_ARCH_LIST or sm_120 text appears in the file.
- Source: https://raw.githubusercontent.com/Kaggle/docker-python/main/Dockerfile.tmpl
- The repo README says nothing about CUDA versions, torch, or tags: https://github.com/Kaggle/docker-python

**Colab GPU freeze (FETCHED, current main branch).**

| Package | Version |
|---|---|
| torch / torchvision / torchaudio | 2.11.0+cu130 / 0.26.0+cu130 / 2.11.0+cu130 |
| xgboost | 3.4.1 |
| jax / jaxlib | 0.11.1 |
| tensorflow | 2.21.0 |
| cuda runtime | cu13 13.0.96, cu12 12.9.79 |
| cupy | cupy-cuda13x 14.0.1 |
| numpy | 2.1.3 |

- Source: https://raw.githubusercontent.com/googlecolab/backend-info/main/pip-freeze.gpu.txt
- The file header says it "may not match the current staging or production container".
- Whether the Kaggle image dated 20260917 has exactly these versions is UNVERIFIED. The probe must print the real versions.

**Which torch builds include sm_120 (FETCHED).**

- Report on an RTX PRO 6000: `torch 2.4.0+cu121` fails with "CUDA error: no kernel image is available for execution on the device". Its wheel covers sm_50 to sm_90.
- The same report says `torch 2.11.0+cu130` with `torchvision 0.26.0+cu130` passed a CUDA tensor smoke test on sm_120.
- Source: https://github.com/inclusionAI/Ming-Image/issues/4
- Other search results say stable wheels need CUDA 12.8 or newer for sm_120 (SEARCH). Examples: https://gist.github.com/Keven1894/9a8f3b1a2ac44614c2b922e25041b05c and https://lilting.ch/en/articles/comfyui-blackwell-gpu-compatibility.

**XGBoost on Blackwell: UNVERIFIED.**

- XGBoost 3.x wheels are built with CUDA 12.x. Whether they include sm_120 SASS, or fall back to PTX JIT, was not found in any fetched page.
- The probe should run `xgb.XGBClassifier(device="cuda", tree_method="hist")` on a tiny array. Fall back to CPU `hist` if it fails.
- Hedge: set the env var `CUDA_FORCE_PTX_JIT=1` (UNVERIFIED, NVIDIA driver feature).

**Pinned vs latest image, and how to select it.**

- The notebook UI shows "Pin to original environment" (owner screenshot). That means the dropdown offers a choice between the original and the latest environment.
- A search summary of the official docs says the Settings pane, under Session options, has an Environment setting. The choices are "original" for reproducibility and "latest" for package updates (SEARCH). The exact labels were not confirmed on a fetched page.
- Related threads: https://www.kaggle.com/questions-and-answers/484639 (pin to a specific version) and https://www.kaggle.com/product-feedback/174298 (the pin option once appeared disabled). Neither was read.
- A kernel pushed with the CLI appears to take the default image. `kernel-metadata.json` has no documented image-pinning field (FETCHED). A pin is probably set in the UI only (UNVERIFIED).
- The `--accelerator` option exists in `kaggle kernels push` (verified locally with CLI 2.2.4). The locally installed SDK only knows `NvidiaTeslaT4`, `NvidiaTeslaP100` and `Tpu1VmV38`. The RTX machine-shape string was not found.
- Metadata docs give `NvidiaTeslaT4` for "GPU T4 x2", plus `NvidiaL4` and `TpuV5E8` (FETCHED). Source: https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels_metadata.md

**ARC kit hardware names (FETCHED).** The ARC docs list `ACCELERATOR = "t4" # one of: cpu, t4, p100, rtx6000`. This refers to the starter kit's own setting. It is not a Kaggle API string. Source: https://docs.arcprize.org/arc-prize-2026

## 2. RTX PRO 6000 quirks on Kaggle

- Machine type is `g4-standard-48`, called "Nvidia RTX 6000" (FETCHED, ARC docs). The docs do not say "PRO", but the owner's UI shows RTX PRO 6000.
- The ARC docs say: "RTX 6000 is reserved for ARC-AGI-3 notebooks. Don't use it for early iteration." The hardware table says "Heavy ML; ARC-AGI-3 exclusive, burns GPU quota faster" (FETCHED, ARC docs). So the weekly 30 h quota may drain faster than 1 h per hour on RTX. Keep probes tiny. The multiplier is unknown (UNVERIFIED).
- A search summary of the Kaggle ARC competition overview says (SEARCH):
  - RTX 6000 machines were added to the competition's hardware pool.
  - RTX use is limited to notebooks attached to that competition.
  - Every RTX session must have internet disabled "so the machines stay reserved for competition use".
  - This matches the owner's screenshots.
- A competition notebook keeps its attachments. This is consistent with the owner's note that the notebook must be in the competition with internet off. The Kaggle overview page was fetched but returned only its title, so exact wording is UNVERIFIED. Source: https://www.kaggle.com/competitions/arc-prize-2026-arc-agi-3/overview
- The ARC docs say: "All accelerated Kaggle sessions have internet disabled." That is the kit default (FETCHED, ARC docs). It may also hold for all competition accelerators, but this was not confirmed.
- Disk limits, UNVERIFIED for RTX:
  - A search summary of the Kaggle notebook docs says "Up to 20 GB of output ... may be saved to disk in /kaggle/working" (SEARCH).
  - An older Medium article says an extra 20 GB is available at runtime but is not saved. Source: https://yashvaantlakham73.medium.com/rounding-up-in-kaggle-environment-563d8af7af39
  - The UI's 57.6 GiB likely shows total disk size, including /kaggle/temp and the OS, or a larger quota on this machine. No page was found that reconciles the two numbers.
  - Plan for 20 GB persisted in /kaggle/working. Write large scratch files to /kaggle/temp. The probe should run `df -h /kaggle/working /kaggle/temp /tmp` to measure.
- Session limit: 12 h (owner's screenshot). Not independently confirmed.
- A similar competition-only RTX arrangement exists for the NVIDIA Nemotron Model Reasoning Challenge, which uses G4 VMs with RTX PRO 6000 Blackwell Server Edition (SEARCH). Source: https://www.kaggle.com/competitions/nvidia-nemotron-model-reasoning-challenge
- A community guide titled "From Local Dev to RTX 6000 (Kaggle CLI Guide)" exists but its body could not be fetched: https://www.kaggle.com/code/citerne/from-local-dev-rtx-6000-kaggle-cli-guide

## 3. Output size, `kernel_sources` chaining, and policy risk

**Output size.**

- Persisted output is up to 20 GB in /kaggle/working (SEARCH, summary of https://www.kaggle.com/docs/notebooks).
- A feedback thread reports notebook outputs "limited to 500 items": https://www.kaggle.com/product-feedback/420538. Only its title was seen. Keep output to a few archives, not thousands of files.
- A product update titled "Increased Resources for Datasets and Kernel Outputs" exists but was not read: https://www.kaggle.com/product-feedback/195163. Limits may have changed.

**Chaining.**

- `kernel-metadata.json` supports `"kernel_sources": ["username/kernel-slug"]`. It also supports `dataset_sources`, `competition_sources` and `model_sources` (FETCHED). Source: https://github.com/Kaggle/kaggle-api/blob/main/docs/kernels_metadata.md
- The output of an attached kernel appears under `/kaggle/input/` (UNVERIFIED, general knowledge). The exact folder name is not documented in anything fetched.
- The kernel output used is that of the source kernel's latest successful version (UNVERIFIED).
- To chain A to B, B must have `kernel_sources` set to A. The B notebook's input path should be discovered at run time, for example by globbing `/kaggle/input/**/<file>`. Do not hard-code it.
- A pinned version of the source kernel is not documented in the fetched metadata page.
- No numeric limit on source count was found.
- A fallback is to publish A's outputs as a private Kaggle Dataset and attach it with `dataset_sources`. Datasets are also readable with internet off.

**Policy risk of non-competition workloads in a competition notebook.** Neutral summary:

- Kaggle and ARC state the RTX machines are for ARC-AGI-3 competition work.
- Per the search summary of the Kaggle overview page, "using it for any other activity could result in moderation action, such as site suspension or account ban" (SEARCH).
- The ARC docs call the accelerator "ARC-AGI-3 exclusive" and say not to use it for early iteration (FETCHED, ARC docs).
- The Lumos fire-calendar MODIS/VIIRS training is unrelated to ARC-AGI-3. Running it in an ARC-attached notebook to obtain the RTX PRO 6000 appears to fall outside the stated intended use.
- Only the ARC overview page carries the exact wording, and it was not fetched in full. Competition rules and Kaggle Terms were not read. The risk is flagged here, not decided.
- Recommended handling:
  1. The owner makes the decision explicitly, aware of the account-level consequence.
  2. If the owner declines, use the T4 x2 fallback. The owner already confirmed any other notebook can use it. T4 x2 has 2 x 16 GB VRAM and no Blackwell issues.
  3. A tiny probe (a few minutes) that only prints `nvidia-smi`, the torch arch list and a 1-second tensor test is lower risk than a multi-hour training run. It is still not ARC work.
  4. The probe kernel must not read competition data and must never submit. This is already a project rule.

## 4. Offline pip wheelhouse install limits

No page about wheelhouses was fetched. Everything in this section is UNVERIFIED (background knowledge):

- With internet off, `pip install` cannot reach PyPI. Packages must come from an attached dataset or kernel output, for example `pip install --no-index --find-links=/kaggle/input/<wheelhouse> pkg`.
- Wheels must match the image's Python ABI (probably cp313 given the "cp313" comment in the Dockerfile) and platform (manylinux x86_64). Build the wheelhouse on a Kaggle notebook with internet on, using `pip download` or `pip wheel` in the same image version. A wheelhouse built on the Mac (macOS, Python 3.12) will not work.
- A pinned "original" environment has a different Python/ABI from the latest one. Build and consume the wheelhouse under the same environment setting.
- Prefer packages already in the image. Torch, xgboost, numpy, pandas and scikit-learn are likely present (the Colab freeze lists torch, xgboost and numpy).
- `/kaggle/input` is read-only. Install to `/kaggle/working` or `/kaggle/temp`, or install into the default site-packages with `--no-deps` from the wheelhouse.
- Do not upgrade torch offline. A newer CUDA wheel is multi-GB, and replacing it risks breaking the image.
- Wheelhouse size counts against dataset limits. Publishing a dataset requires internet and the owner's token.
- Kernel outputs can double as a wheelhouse: A (internet on) runs `pip download -d /kaggle/working/wheels ...`, and B attaches A via `kernel_sources`.

## Suggested actions for other roles

- Probe kernel (T4 x2 first): print `torch.__version__`, `torch.version.cuda`, `torch.cuda.get_arch_list()`, `xgboost.__version__`, the Python version, `df -h`, `nvidia-smi` and a 1 s CUDA matmul. On RTX, `sm_120` must appear in the arch list.
- If `sm_120` is missing on RTX: switch the environment to latest, rerun once, then fall back to T4 x2.
- Do not overwrite the owner's draft notebook "Internet OFF with RTX PRO 6000". Use `lumos-probe-*` slugs.
- Ask the owner to confirm the ARC-attached RTX path, given section 3, before any multi-hour RTX run.

## Request log (15)

1. WebSearch: Kaggle RTX PRO 6000 competition internet off
2. WebFetch: kaggle.com/competitions/arc-prize-2026-arc-agi-3 (title only)
3. WebFetch: kaggle.com/code/citerne/... (title only)
4. WebFetch: github.com/Kaggle/docker-python
5. WebFetch: github.com/Kaggle/kaggle-api/blob/main/docs/kernels_metadata.md
6. WebFetch: kaggle.com/docs/notebooks (title only)
7. WebSearch: sm_120 PyTorch Kaggle
8. WebFetch: github.com/inclusionAI/Ming-Image/issues/4
9. WebSearch: ARC Prize RTX 6000 moderation
10. WebFetch: docs.arcprize.org/arc-prize-2026
11. WebFetch: kaggle.com/competitions/arc-prize-2026-arc-agi-3/overview (title only)
12. WebFetch: raw.githubusercontent.com/Kaggle/docker-python/main/gpu.Dockerfile (404)
13. WebFetch: raw.githubusercontent.com/Kaggle/docker-python/main/Dockerfile.tmpl
14. WebFetch: raw.githubusercontent.com/googlecolab/backend-info/main/pip-freeze.gpu.txt
15. WebSearch: Pin to original environment, output limits

One more request, github.com/Kaggle/kaggle-api/blob/main/docs/README.md, returned HTTP 503 and was not retried (over budget). Local checks: `kaggle kernels push --help` on CLI 2.2.4 shows `--accelerator ACC` and `-t TIMEOUT`, and the SDK strings include NvidiaTeslaT4, NvidiaTeslaP100 and Tpu1VmV38.
